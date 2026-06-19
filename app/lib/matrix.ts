import {
  createClient,
  type EventTimelineSet,
  EventType,
  Filter,
  IndexedDBStore,
  type MatrixClient,
  type MatrixEvent,
  OidcTokenRefresher,
  Preset,
  PushRuleActionName,
  type Room,
  RoomType,
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

/**
 * 일반 그룹 방을 생성한다.
 * - name: 방 이름 (필수)
 * - topic: 방 주제 (선택)
 * - encrypted: E2EE 켤지 (기본 true)
 * - invite: 초대할 userId 목록 (선택)
 * - parentSpaceId: 지정 시 생성 후 그 Space의 자식으로 연결 (m.space.child/parent)
 * 반환: 생성된 roomId
 */
export async function createGroupRoom(
  client: MatrixClient,
  opts: {
    name: string;
    topic?: string;
    encrypted?: boolean;
    invite?: string[];
    parentSpaceId?: string;
  },
): Promise<string> {
  const encrypted = opts.encrypted ?? true;
  const { room_id: roomId } = await client.createRoom({
    name: opts.name.trim(),
    ...(opts.topic?.trim() ? { topic: opts.topic.trim() } : {}),
    preset: Preset.PrivateChat,
    ...(opts.invite?.length ? { invite: opts.invite } : {}),
    ...(encrypted
      ? {
          initial_state: [
            {
              type: EventType.RoomEncryption,
              state_key: "",
              content: { algorithm: "m.megolm.v1.aes-sha2" },
            },
          ],
        }
      : {}),
  });
  if (opts.parentSpaceId) {
    await addRoomToSpace(client, opts.parentSpaceId, roomId);
  }
  return roomId;
}

/** userId/roomId에서 서버 도메인 추출 (@u:server → server, !r:server → server) */
function serverNameOf(id: string): string {
  const i = id.indexOf(":");
  return i >= 0 ? id.slice(i + 1) : "";
}

/** 방을 다른 사용자에게 노출할 때 거치는 서버 도메인 목록(via) 추정.
 *  현재 멤버들의 서버 도메인을 모아 빈도순으로. m.space.child/parent에 필요. */
function viaServers(client: MatrixClient, roomId: string): string[] {
  const room = client.getRoom(roomId);
  const counts = new Map<string, number>();
  if (room) {
    for (const m of room.getJoinedMembers()) {
      const s = serverNameOf(m.userId);
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  // 내 서버는 항상 포함 (방금 만든 방이라 멤버가 나뿐일 수 있음)
  const mine = serverNameOf(client.getUserId() ?? "");
  if (mine && !counts.has(mine)) counts.set(mine, 0);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .slice(0, 3);
}

/**
 * Space와 방을 양방향 연결한다 (Matrix 정석).
 * - 부모 Space에 m.space.child (state_key=roomId)
 * - 자식 방에 m.space.parent (state_key=spaceId)
 * via(서버 도메인) 없으면 다른 서버에서 못 찾으므로 둘 다 채운다.
 * (자식 방의 parent 쓰기 권한이 없으면 child만 성공해도 트리 표시는 됨 —
 *  buildRoomTree가 child만 신뢰하므로)
 */
export async function addRoomToSpace(
  client: MatrixClient,
  spaceId: string,
  roomId: string,
): Promise<void> {
  const childVia = viaServers(client, roomId);
  await client.sendStateEvent(
    spaceId,
    EventType.SpaceChild,
    { via: childVia.length ? childVia : [serverNameOf(roomId)] },
    roomId,
  );
  // parent는 권한 없을 수 있으니 실패해도 무시 (child가 본질)
  try {
    const parentVia = viaServers(client, spaceId);
    await client.sendStateEvent(
      roomId,
      EventType.SpaceParent,
      {
        via: parentVia.length ? parentVia : [serverNameOf(spaceId)],
        canonical: true,
      },
      spaceId,
    );
  } catch (e) {
    console.warn("m.space.parent 설정 실패(권한?) — child만으로 진행:", e);
  }
}

/**
 * 새 Space를 생성한다 (m.space 타입 방).
 * - name: Space 이름 (필수)
 * - topic: 설명 (선택)
 * - parentSpaceId: 지정 시 생성 후 그 Space의 자식으로 연결 (Space 중첩)
 * 반환: 생성된 spaceId
 */
export async function createSpace(
  client: MatrixClient,
  opts: { name: string; topic?: string; parentSpaceId?: string },
): Promise<string> {
  const { room_id: spaceId } = await client.createRoom({
    name: opts.name.trim(),
    ...(opts.topic?.trim() ? { topic: opts.topic.trim() } : {}),
    preset: Preset.PrivateChat,
    creation_content: { type: RoomType.Space },
    // Space는 메시지 방이 아니므로 암호화하지 않는다
  });
  if (opts.parentSpaceId) {
    await addRoomToSpace(client, opts.parentSpaceId, spaceId);
  }
  return spaceId;
}

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

/** 모든 라우트에서 같은 옵션으로 startClient 하도록 통일 (threadSupport 포함) */
export function ensureStarted(client: MatrixClient): void {
  if (!client.clientRunning) {
    client.startClient({ initialSyncLimit: 20, threadSupport: true });
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
