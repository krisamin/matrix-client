import {
  EventType,
  type MatrixClient,
  PushRuleActionName,
  type Room,
} from "matrix-js-sdk";

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
