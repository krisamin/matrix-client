import {
  EventType,
  type GuestAccess,
  type HistoryVisibility,
  type JoinRule,
  type MatrixClient,
  type Visibility,
} from "matrix-js-sdk";

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
