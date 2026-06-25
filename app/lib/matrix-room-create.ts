import {
  EventType,
  type GuestAccess,
  type HistoryVisibility,
  type JoinRule,
  type MatrixClient,
  Preset,
  RoomType,
  type Visibility,
} from "matrix-js-sdk";

type StateEvent = { type: string; state_key: string; content: object };

/** join_rule / history / guest_access / encryption 등 initial_state 빌더. */
function buildInitialState(opts: {
  encrypted?: boolean;
  joinRule?: JoinRule;
  guestAccess?: GuestAccess;
  historyVisibility?: HistoryVisibility;
}): StateEvent[] {
  const initialState: StateEvent[] = [];
  if (opts.encrypted) {
    initialState.push({
      type: EventType.RoomEncryption,
      state_key: "",
      content: { algorithm: "m.megolm.v1.aes-sha2" },
    });
  }
  if (opts.joinRule) {
    initialState.push({
      type: EventType.RoomJoinRules,
      state_key: "",
      content: { join_rule: opts.joinRule },
    });
  }
  if (opts.guestAccess) {
    initialState.push({
      type: EventType.RoomGuestAccess,
      state_key: "",
      content: { guest_access: opts.guestAccess },
    });
  }
  if (opts.historyVisibility) {
    initialState.push({
      type: EventType.RoomHistoryVisibility,
      state_key: "",
      content: { history_visibility: opts.historyVisibility },
    });
  }
  return initialState;
}

/**
 * 일반 그룹 방을 생성한다.
 * - name: 방 이름 (필수)
 * - topic: 방 주제 (선택)
 * - encrypted: E2EE 켤지 (기본 true)
 * - invite: 초대할 userId 목록 (선택)
 * - parentSpaceId: 지정 시 생성 후 그 Space의 자식으로 연결 (m.space.child/parent)
 * - visibility: 공개 방 디렉토리 노출 여부 (기본 Private)
 * - aliasLocalpart: 별칭 localpart (예: "team-chat" → "#team-chat:server")
 * - joinRule / guestAccess / historyVisibility: 명시 시 initial_state로 preset 덮어쓰기
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
    visibility?: Visibility;
    aliasLocalpart?: string;
    joinRule?: JoinRule;
    guestAccess?: GuestAccess;
    historyVisibility?: HistoryVisibility;
  },
): Promise<string> {
  const encrypted = opts.encrypted ?? true;
  const initialState = buildInitialState({
    encrypted,
    joinRule: opts.joinRule,
    guestAccess: opts.guestAccess,
    historyVisibility: opts.historyVisibility,
  });
  const aliasLp = opts.aliasLocalpart?.trim();
  const { room_id: roomId } = await client.createRoom({
    name: opts.name.trim(),
    ...(opts.topic?.trim() ? { topic: opts.topic.trim() } : {}),
    preset: Preset.PrivateChat,
    ...(opts.invite?.length ? { invite: opts.invite } : {}),
    ...(opts.visibility ? { visibility: opts.visibility } : {}),
    ...(aliasLp ? { room_alias_name: aliasLp } : {}),
    ...(initialState.length ? { initial_state: initialState } : {}),
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
 * - visibility: 공개 방 디렉토리 노출 여부 (기본 Private)
 * - aliasLocalpart: 별칭 localpart
 * - joinRule / historyVisibility: 명시 시 initial_state로 preset 덮어쓰기
 *   (Space에 guest_access/암호화는 무의미하므로 제외)
 * 반환: 생성된 spaceId
 */
export async function createSpace(
  client: MatrixClient,
  opts: {
    name: string;
    topic?: string;
    parentSpaceId?: string;
    visibility?: Visibility;
    aliasLocalpart?: string;
    joinRule?: JoinRule;
    historyVisibility?: HistoryVisibility;
  },
): Promise<string> {
  const initialState = buildInitialState({
    joinRule: opts.joinRule,
    historyVisibility: opts.historyVisibility,
  });
  const aliasLp = opts.aliasLocalpart?.trim();
  const { room_id: spaceId } = await client.createRoom({
    name: opts.name.trim(),
    ...(opts.topic?.trim() ? { topic: opts.topic.trim() } : {}),
    preset: Preset.PrivateChat,
    creation_content: { type: RoomType.Space },
    ...(opts.visibility ? { visibility: opts.visibility } : {}),
    ...(aliasLp ? { room_alias_name: aliasLp } : {}),
    ...(initialState.length ? { initial_state: initialState } : {}),
    // Space는 메시지 방이 아니므로 암호화하지 않는다
  });
  if (opts.parentSpaceId) {
    await addRoomToSpace(client, opts.parentSpaceId, spaceId);
  }
  return spaceId;
}
