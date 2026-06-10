import {
  createClient,
  Filter,
  OidcTokenRefresher,
  type EventTimelineSet,
  type MatrixClient,
  type Room,
} from "matrix-js-sdk";
import {
  decodeRecoveryKey,
  deriveRecoveryKeyFromPassphrase,
} from "matrix-js-sdk/lib/crypto-api";
import type { SecretStorageKeyDescription } from "matrix-js-sdk/lib/secret-storage";
import { loadSession, updateSessionTokens } from "./session";

let clientPromise: Promise<MatrixClient> | null = null;

/**
 * secret storage 키가 필요할 때 UI에서 사용자 입력(보안 키 또는 passphrase)을
 * 받아오는 provider. verify 페이지 등에서 등록한다.
 */
let secretInputProvider: (() => Promise<string | null>) | null = null;

export function setSecretInputProvider(
  fn: (() => Promise<string | null>) | null,
): void {
  secretInputProvider = fn;
}

async function inputToKey(
  input: string,
  keyInfo: SecretStorageKeyDescription,
): Promise<Uint8Array<ArrayBuffer>> {
  const trimmed = input.trim();
  // Element 보안 키 형식 (EsTx ABcd ...) 먼저 시도, 실패하면 passphrase 유도
  try {
    return decodeRecoveryKey(trimmed);
  } catch {
    if (!keyInfo.passphrase) throw new Error("보안 키 형식이 아니야");
    return deriveRecoveryKeyFromPassphrase(
      trimmed,
      keyInfo.passphrase.salt,
      keyInfo.passphrase.iterations,
    );
  }
}

/**
 * 세션이 있으면 rust crypto까지 초기화된 싱글턴 MatrixClient를 돌려준다.
 * 없으면 null. (crypto stack은 thread-unsafe라 반드시 인스턴스 1개 유지)
 */
export function getReadyClient(): Promise<MatrixClient> | null {
  if (clientPromise) return clientPromise;
  const session = loadSession();
  if (!session) return null;
  clientPromise = (async () => {
    // OIDC 토큰 자동 갱신: M_UNKNOWN_TOKEN 시 http-api가 이 함수를 호출
    let tokenRefreshFunction;
    if (session.refreshToken && session.redirectUri && session.idTokenClaims) {
      class PersistingRefresher extends OidcTokenRefresher {
        protected async persistTokens(tokens: {
          accessToken: string;
          refreshToken?: string;
        }): Promise<void> {
          updateSessionTokens(tokens.accessToken, tokens.refreshToken);
        }
      }
      const refresher = new PersistingRefresher(
        session.issuer,
        session.clientId,
        session.redirectUri,
        session.deviceId,
        session.idTokenClaims,
      );
      tokenRefreshFunction = (refreshToken: string) =>
        refresher.doRefreshAccessToken(refreshToken);
    }

    const client = createClient({
      baseUrl: session.homeserverUrl,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      tokenRefreshFunction,
      userId: session.userId,
      deviceId: session.deviceId,
      cryptoCallbacks: {
        getSecretStorageKey: async ({ keys }) => {
          if (!secretInputProvider) return null;
          const input = await secretInputProvider();
          if (!input) return null;
          // 요청된 키들 중 입력으로 풀리는 첫 번째 키 반환
          let lastError: unknown = null;
          for (const [keyId, keyInfo] of Object.entries(keys)) {
            try {
              const key = await inputToKey(input, keyInfo);
              return [keyId, key];
            } catch (e) {
              lastError = e;
            }
          }
          throw lastError ?? new Error("일치하는 secret storage 키 없음");
        },
      },
    });
    await client.initRustCrypto({
      useIndexedDB: true,
      cryptoDatabasePrefix: `matrix-client-crypto-${session.deviceId}`,
    });
    return client;
  })();
  return clientPromise;
}

export function resetClient(): void {
  clientPromise?.then((c) => c.stopClient()).catch(() => {});
  clientPromise = null;
}

/** 모든 라우트에서 같은 옵션으로 startClient 하도록 통일 (threadSupport 포함) */
export function ensureStarted(client: MatrixClient): void {
  if (!client.clientRunning) {
    client.startClient({ initialSyncLimit: 20, threadSupport: true });
  }
}

/**
 * 메인 타임라인용 "스레드 답글 제외" 필터드 timelineSet.
 * MSC3874 (not_rel_types) — Synapse experimental_features.msc3874_enabled=true 필요.
 * 서버가 /messages 페이지네이션에서 스레드 답글을 빼고 주므로
 * "한 페이지 전부 스레드 답글이라 빈 화면" 문제가 원천 차단됨.
 * 필터 등록 실패(서버 미지원 등) 시 null 반환 → 호출부는 라이브 타임라인 fallback.
 */
export async function getNoThreadTimelineSet(
  client: MatrixClient,
  room: Room,
): Promise<EventTimelineSet | null> {
  try {
    const filter = new Filter(client.getUserId());
    filter.setDefinition({
      room: {
        timeline: {
          // 메시지 + 리액션만 (리액션은 화면에 직접 안 그리지만
          // SDK relations aggregation에 필요 — 칩 렌더의 데이터 소스)
          types: ["m.room.message", "m.room.encrypted", "m.reaction"],
        },
      },
    });
    // 함정 1: Synapse 1.154 MSC3874는 **unstable 키만** 인식
    // (스테이블 not_rel_types는 조용히 무시 — 실측 확인)
    // 함정 2: SDK FilterComponent.toJSON()은 아는 키만 직렬화 → toJSON 래핑으로 강제 포함
    // m.replace도 제외: 스트리밍 봇의 수정 이벤트가 페이지를 채우는 것 방지
    // (수정 내용은 bundled relations로 원본에 합쳐져 옴)
    const NOT_REL = { "org.matrix.msc3874.not_rel_types": ["m.thread", "m.replace"] };
    const comp = filter.getRoomTimelineFilterComponent();
    if (comp) {
      const origToJSON = comp.toJSON.bind(comp);
      comp.toJSON = () => ({
        ...origToJSON(),
        ...NOT_REL,
      });
    }
    const filterId = await client.getOrCreateFilter(
      `NO_THREAD_TIMELINE_${room.roomId}`,
      filter,
    );
    filter.filterId = filterId;
    return room.getOrCreateFilteredTimelineSet(filter, {
      // true: 현재 라이브 타임라인 이벤트를 복사 + backward 토큰을 가장
      // 오래된 unfiltered 토큰으로 세팅 → 빈 화면/토큰 null 문제 방지.
      // (스레드 답글이 섞여 들어와도 visibleEvents()가 클라에서 걸러냄 —
      //  서버 필터는 이후 페이지네이션부터 적용)
      prepopulateTimeline: true,
      useSyncEvents: true,
      pendingEvents: true,
    });
  } catch (e) {
    console.warn("no-thread filtered timeline 생성 실패, fallback:", e);
    return null;
  }
}
