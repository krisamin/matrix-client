import {
  createClient,
  type EventTimelineSet,
  EventType,
  Filter,
  IndexedDBStore,
  type MatrixClient,
  OidcTokenRefresher,
  Preset,
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
    if (!keyInfo.passphrase) throw new Error("올바른 보안 키 형식이 아닙니다");
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
    let tokenRefreshFunction:
      | ((refreshToken: string) => Promise<{
          accessToken: string;
          refreshToken?: string;
        }>)
      | undefined;
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

    // sync 영속화: 새로고침 시 마지막 sync 지점부터 이어받음
    // (없으면 매번 initial sync — 방 많아질수록 첫 화면 느려짐)
    // startup 실패(시크릿 모드, 손상된 DB 등) 시 메모리 스토어로 폴백
    let store: IndexedDBStore | undefined;
    try {
      store = new IndexedDBStore({
        indexedDB: window.indexedDB,
        localStorage: window.localStorage,
        dbName: `matrix-client-sync-${session.deviceId}`,
      });
      // 주의: createClient 전에 반드시 startup() — 안 하면 조용히 깨짐
      await store.startup();
    } catch (e) {
      console.warn("IndexedDBStore startup 실패 — 메모리 스토어로 폴백:", e);
      store = undefined;
    }

    const client = createClient({
      baseUrl: session.homeserverUrl,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      tokenRefreshFunction,
      userId: session.userId,
      deviceId: session.deviceId,
      store,
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
          throw lastError ?? new Error("일치하는 보안 키가 없습니다");
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
  // 로그아웃: sync 스토어도 비움 (다음 로그인 계정에 이전 데이터 잔류 방지)
  clientPromise
    ?.then(async (c) => {
      c.stopClient();
      await c.store.deleteAllData().catch(() => {});
    })
    .catch(() => {});
  clientPromise = null;
}

/** DM 방이면 상대 userId, 아니면 null (m.direct account data 기준) */
export function getDmUserId(client: MatrixClient, room: Room): string | null {
  const dm = client.getAccountData(EventType.Direct)?.getContent() as
    | Record<string, string[]>
    | undefined;
  if (!dm) return null;
  for (const [userId, roomIds] of Object.entries(dm)) {
    if (Array.isArray(roomIds) && roomIds.includes(room.roomId)) return userId;
  }
  return null;
}

/** 현재 m.direct 맵 (userId → roomId[]). 없으면 빈 객체. */
function getDirectMap(client: MatrixClient): Record<string, string[]> {
  const content = client.getAccountData(EventType.Direct)?.getContent() as
    | Record<string, string[]>
    | undefined;
  // 얕은 복사 — 호출부가 직접 변형하지 않게
  return content ? { ...content } : {};
}

/** 상대 userId와의 기존 (참여중) DM 방을 찾는다. 없으면 null.
 *  m.direct에 박제된 roomId 중 실제로 join 상태인 방만 유효 취급. */
export function findExistingDm(
  client: MatrixClient,
  userId: string,
): Room | null {
  const map = getDirectMap(client);
  const roomIds = map[userId];
  if (!Array.isArray(roomIds)) return null;
  for (const roomId of roomIds) {
    const room = client.getRoom(roomId);
    if (room && room.getMyMembership() === "join") return room;
  }
  return null;
}

/** m.direct 계정 데이터에 (userId → roomId)를 머지 저장.
 *  주의: 기존 맵을 읽어 머지해야 다른 DM 매핑이 날아가지 않는다. */
async function addRoomToDirect(
  client: MatrixClient,
  userId: string,
  roomId: string,
): Promise<void> {
  const map = getDirectMap(client);
  const existing = Array.isArray(map[userId]) ? map[userId] : [];
  if (existing.includes(roomId)) return;
  map[userId] = [...existing, roomId];
  await client.setAccountData(EventType.Direct, map);
}

/**
 * 상대 userId와 1:1 DM을 시작한다.
 * - 이미 참여중 DM이 있으면 그 방을 그대로 반환 (중복 방 생성 방지)
 * - 없으면 새 방 생성 (is_direct, 상대 초대, 가능하면 E2EE) 후 m.direct 갱신
 * 반환: 사용할 roomId
 */
export async function startDirectMessage(
  client: MatrixClient,
  userId: string,
): Promise<string> {
  const existing = findExistingDm(client, userId);
  if (existing) return existing.roomId;

  const { room_id: roomId } = await client.createRoom({
    is_direct: true,
    invite: [userId],
    preset: Preset.TrustedPrivateChat,
    // 신규 DM은 기본 E2EE — 이 클라가 암호화 방 전제로 동작
    initial_state: [
      {
        type: EventType.RoomEncryption,
        state_key: "",
        content: { algorithm: "m.megolm.v1.aes-sha2" },
      },
    ],
  });
  await addRoomToDirect(client, userId, roomId);
  return roomId;
}

/** 사용자 디렉토리 검색 결과 1건 */
export interface UserDirectoryResult {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
}

/** 홈서버 사용자 디렉토리 검색 (이름/아이디 일부로). 실패 시 빈 배열. */
export async function searchUserDirectory(
  client: MatrixClient,
  term: string,
  limit = 10,
): Promise<UserDirectoryResult[]> {
  const q = term.trim();
  if (!q) return [];
  try {
    const res = await client.searchUserDirectory({ term: q, limit });
    return res.results.map((u) => ({
      userId: u.user_id,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
    }));
  } catch (e) {
    console.warn("사용자 디렉토리 검색 실패:", e);
    return [];
  }
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
    const NOT_REL = {
      "org.matrix.msc3874.not_rel_types": ["m.thread", "m.replace"],
    };
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
