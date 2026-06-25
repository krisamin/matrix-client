import {
  createClient,
  type EventTimelineSet,
  EventType,
  Filter,
  type GuestAccess,
  type HistoryVisibility,
  IndexedDBStore,
  type JoinRule,
  type MatrixClient,
  type MatrixEvent,
  OidcTokenRefresher,
  PushRuleActionName,
  type Room,
  type Visibility,
} from "matrix-js-sdk";
import type { RoomMessageEventContent } from "matrix-js-sdk/lib/@types/events";
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
    if (
      session.refreshToken &&
      session.redirectUri &&
      session.idTokenClaims &&
      session.issuer &&
      session.clientId
    ) {
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
    // dev 디버깅: 콘솔에서 window.__mxc로 client 접근 가능.
    // 프로덕션 영향 0(글로벌 한 변수 추가 뿐, 외부 노출 위험은 client가 이미
    // 메모리에 인증 토큰 들고 있는 SPA 특성상 디버그 도구로만 의미 있음).
    if (typeof window !== "undefined") {
      (window as unknown as { __mxc: MatrixClient }).__mxc = client;
    }
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

export {
  findExistingDm,
  getDirectMap,
  getDmUserId,
  startDirectMessage,
} from "./matrix-dm";

export {
  addRoomToSpace,
  createGroupRoom,
  createSpace,
} from "./matrix-room-create";

/** 참여중인 Space 목록 (생성/이동 UI의 드롭다운 소스) */
export function getJoinedSpaces(client: MatrixClient): Room[] {
  return client
    .getRooms()
    .filter((r) => r.isSpaceRoom() && r.getMyMembership() === "join");
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

/** 내 프로필 정보 (표시이름 + 아바타 mxc). 실패 시 부분/빈 값. */
export interface MyProfile {
  displayName: string;
  avatarUrl?: string;
}

/** 내 프로필 조회 (homeserver). */
export async function getMyProfile(client: MatrixClient): Promise<MyProfile> {
  const userId = client.getUserId() ?? "";
  try {
    const res = await client.getProfileInfo(userId);
    return { displayName: res.displayname ?? "", avatarUrl: res.avatar_url };
  } catch (e) {
    console.warn("프로필 조회 실패:", e);
    return { displayName: "" };
  }
}

/** 표시이름 변경. */
export async function setMyDisplayName(
  client: MatrixClient,
  name: string,
): Promise<void> {
  await client.setDisplayName(name);
}

/** 아바타 이미지 업로드 후 프로필 아바타로 설정. 반환: 새 mxc URL. */
export async function setMyAvatar(
  client: MatrixClient,
  file: File,
): Promise<string> {
  const { content_uri } = await client.uploadContent(file, {
    type: file.type || "application/octet-stream",
  });
  await client.setAvatarUrl(content_uri);
  return content_uri;
}

/** 모든 라우트에서 같은 옵션으로 startClient 하도록 통일.
 *  - threadSupport: thread relation 처리 (room.threadsTimelineSets 활성)
 *  - lazyLoadMembers: 방 멤버 lazy-load — 큰 방에서 initial sync 빠름
 *  - initialSyncLimit: 첫 sync에 가져올 메시지 수 (방마다)
 *
 *  useAuthorizationHeader는 createClient 옵션이라 따로 못 켜는데, SDK가
 *  내부적으로 access_token을 Authorization 헤더로 보내는 경로를 이미 사용
 *  중이라 별도 설정 불필요. */
export function ensureStarted(client: MatrixClient): void {
  if (!client.clientRunning) {
    client.startClient({
      initialSyncLimit: 20,
      threadSupport: true,
      lazyLoadMembers: true,
    });
  }
}

/** 방이 즐겨찾기(m.favourite 태그)인지. */
export function isFavourite(room: Room): boolean {
  return Boolean(room.tags?.["m.favourite"]);
}

/** 즐겨찾기 토글 — m.favourite 룸 태그 추가/삭제. 반환: 새 상태. */
export async function toggleFavourite(
  client: MatrixClient,
  room: Room,
): Promise<boolean> {
  const next = !isFavourite(room);
  if (next) {
    await client.setRoomTag(room.roomId, "m.favourite", {});
  } else {
    await client.deleteRoomTag(room.roomId, "m.favourite");
  }
  return next;
}

/** 방이 음소거 상태인지 (방 단위 push rule 존재 여부로 판단). */
export function isMuted(client: MatrixClient, room: Room): boolean {
  const rule = client.getRoomPushRule("global", room.roomId);
  // 음소거 룰 = actions에 notify가 없음(또는 dont_notify). 룰 존재 + notify 없음으로 판단.
  if (!rule) return false;
  return !rule.actions.includes(PushRuleActionName.Notify);
}

/** 음소거 토글 — 방 단위 mute push rule 설정/해제. 반환: 새 상태. */
export async function toggleMute(
  client: MatrixClient,
  room: Room,
): Promise<boolean> {
  const next = !isMuted(client, room);
  await client.setRoomMutePushRule("global", room.roomId, next);
  return next;
}

/** 메시지를 다른 방으로 전달.
 *  원본 content를 복사하되 관계 메타(답장/수정/스레드)는 제거해
 *  독립된 새 메시지로 보냄. 암호화 방이면 SDK가 알아서 암호화.
 *  미디어는 같은 홈서버 media repo의 mxc/file 키를 그대로 재사용. */
export async function forwardEvent(
  client: MatrixClient,
  ev: MatrixEvent,
  targetRoomId: string,
): Promise<void> {
  const src = ev.getContent();
  // 수정된 메시지면 최신 본문(m.new_content)을 우선 사용
  const base =
    (src["m.new_content"] as Record<string, unknown> | undefined) ?? src;
  // 관계/fallback 메타 제거 — 전달본은 독립 메시지
  const {
    "m.relates_to": _relates,
    "m.new_content": _newContent,
    ...clean
  } = base as Record<string, unknown>;
  await client.sendEvent(
    targetRoomId,
    EventType.RoomMessage,
    clean as unknown as RoomMessageEventContent,
  );
}

/** 방의 고정 메시지 id 목록 (m.room.pinned_events). */
export function getPinnedEventIds(room: Room): string[] {
  const ev = room.currentState.getStateEvents(EventType.RoomPinnedEvents, "");
  const pinned = ev?.getContent()?.pinned;
  return Array.isArray(pinned) ? pinned : [];
}

/** 이벤트가 고정되어 있는지. */
export function isPinned(room: Room, eventId: string): boolean {
  return getPinnedEventIds(room).includes(eventId);
}

/** 고정 토글 — m.room.pinned_events 상태 이벤트 갱신. 반환: 새 상태(고정됨 여부). */
export async function togglePin(
  client: MatrixClient,
  room: Room,
  eventId: string,
): Promise<boolean> {
  const current = getPinnedEventIds(room);
  const has = current.includes(eventId);
  const next = has
    ? current.filter((id) => id !== eventId)
    : [...current, eventId];
  await client.sendStateEvent(
    room.roomId,
    EventType.RoomPinnedEvents,
    { pinned: next },
    "",
  );
  return !has;
}

/** eventId로 방 타임라인에서 이벤트를 찾아 미리보기 텍스트 생성.
 *  타임라인에 아직 없으면 빈 문자열 (배너는 폴백 텍스트 표시). */
export function quotePreviewById(room: Room, eventId: string): string {
  const ev = room.findEventById(eventId);
  if (!ev) return "";
  // 삭제된 메시지
  if (ev.isRedacted()) return "삭제된 메시지";
  const body = ev.getContent()?.body;
  if (typeof body !== "string") return "";
  // 한 줄로 정리 + 길이 제한
  const oneline = body.replace(/\s+/g, " ").trim();
  return oneline.length > 120 ? `${oneline.slice(0, 120)}…` : oneline;
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

/* ──────────────────── 방·Space 설정 편집 헬퍼 ──────────────────── */

/** m.room.join_rules 변경 */
export async function setRoomJoinRule(
  client: MatrixClient,
  roomId: string,
  rule: JoinRule,
): Promise<void> {
  await client.sendStateEvent(
    roomId,
    EventType.RoomJoinRules,
    { join_rule: rule },
    "",
  );
}

/** m.room.history_visibility 변경 */
export async function setRoomHistoryVisibility(
  client: MatrixClient,
  roomId: string,
  visibility: HistoryVisibility,
): Promise<void> {
  await client.sendStateEvent(
    roomId,
    EventType.RoomHistoryVisibility,
    { history_visibility: visibility },
    "",
  );
}

/** m.room.guest_access 변경 (client.setGuestAccess의 얇은 래퍼) */
export async function setRoomGuestAccess(
  client: MatrixClient,
  roomId: string,
  access: GuestAccess,
): Promise<void> {
  await client.setGuestAccess(roomId, {
    allowJoin: access === "can_join",
    allowRead: false,
  });
}

/** 공개 디렉토리 노출 토글 (홈서버 방 목록).
 *  PUT /_matrix/client/v3/directory/list/room/{roomId} */
export async function setRoomDirectoryVisibility(
  client: MatrixClient,
  roomId: string,
  visibility: Visibility,
): Promise<void> {
  await client.setRoomDirectoryVisibility(roomId, visibility);
}

/** 현재 공개 디렉토리 노출 여부 조회 */
export async function getRoomDirectoryVisibility(
  client: MatrixClient,
  roomId: string,
): Promise<Visibility> {
  const res = await client.getRoomDirectoryVisibility(roomId);
  return (res.visibility as Visibility) ?? ("private" as Visibility);
}

/** Canonical alias 설정.
 *  1) 디렉토리 등록 (PUT /directory/room/{alias} → roomId 매핑)
 *  2) m.room.canonical_alias 상태 이벤트 (방 메타에 박음)
 *  alias 형식: "#name:server" (전체). null로 호출하면 canonical 해제. */
export async function setRoomCanonicalAlias(
  client: MatrixClient,
  roomId: string,
  alias: string | null,
): Promise<void> {
  if (alias) {
    // 디렉토리에 등록 — 이미 존재하면 에러나지만 같은 roomId 매핑이면 무시 가능
    try {
      await client.createAlias(alias, roomId);
    } catch (e) {
      // M_UNKNOWN(이미 존재) 등은 무시하고 진행 — 본인 방으로 매핑된 경우
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("already")) throw e;
    }
  }
  await client.sendStateEvent(
    roomId,
    EventType.RoomCanonicalAlias,
    alias ? { alias } : {},
    "",
  );
}

/** 현재 power_levels content (없으면 SDK 기본 동등 객체). */
export function getRoomPowerLevels(room: Room): {
  ban: number;
  events: Record<string, number>;
  events_default: number;
  invite: number;
  kick: number;
  redact: number;
  state_default: number;
  users: Record<string, number>;
  users_default: number;
} {
  const ev = room.currentState.getStateEvents(EventType.RoomPowerLevels, "");
  const c = (ev?.getContent() ?? {}) as Record<string, unknown>;
  return {
    ban: typeof c.ban === "number" ? c.ban : 50,
    events: (c.events as Record<string, number>) ?? {},
    events_default: typeof c.events_default === "number" ? c.events_default : 0,
    invite: typeof c.invite === "number" ? c.invite : 0,
    kick: typeof c.kick === "number" ? c.kick : 50,
    redact: typeof c.redact === "number" ? c.redact : 50,
    state_default: typeof c.state_default === "number" ? c.state_default : 50,
    users: (c.users as Record<string, number>) ?? {},
    users_default: typeof c.users_default === "number" ? c.users_default : 0,
  };
}

/** 멤버 한 명의 PL을 변경. SDK의 setPowerLevel은 내부적으로 기존 content를
 *  머지해서 전체 이벤트를 다시 보내준다. */
export async function setUserPowerLevel(
  client: MatrixClient,
  roomId: string,
  userId: string,
  level: number,
): Promise<void> {
  await client.setPowerLevel(roomId, userId, level);
}

/** 방 아바타 변경 (mxc URL). 빈 문자열이면 제거. */
export async function setRoomAvatar(
  client: MatrixClient,
  roomId: string,
  mxcUrl: string,
): Promise<void> {
  await client.sendStateEvent(
    roomId,
    EventType.RoomAvatar,
    mxcUrl ? { url: mxcUrl } : {},
    "",
  );
}

/** 방 이름·주제 한꺼번에 변경 (둘 다 바뀐 경우만 호출). */
export async function setRoomNameAndTopic(
  client: MatrixClient,
  roomId: string,
  opts: { name?: string; topic?: string },
): Promise<void> {
  if (typeof opts.name === "string") {
    await client.setRoomName(roomId, opts.name);
  }
  if (typeof opts.topic === "string") {
    await client.setRoomTopic(roomId, opts.topic);
  }
}

/** 권한 가드 — 현재 사용자가 특정 상태 이벤트를 보낼 수 있는지 */
export function canSendStateEvent(
  room: Room,
  client: MatrixClient,
  eventType: string,
): boolean {
  const myUserId = client.getUserId();
  if (!myUserId) return false;
  return room.currentState.maySendStateEvent(eventType, myUserId);
}

/** 멤버 강퇴 */
export async function kickMember(
  client: MatrixClient,
  roomId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  await client.kick(roomId, userId, reason);
}

/** 멤버 추방 (재가입 차단) */
export async function banMember(
  client: MatrixClient,
  roomId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  await client.ban(roomId, userId, reason);
}

/** 추방 해제 */
export async function unbanMember(
  client: MatrixClient,
  roomId: string,
  userId: string,
): Promise<void> {
  await client.unban(roomId, userId);
}
