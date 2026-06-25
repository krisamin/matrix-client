import { EventType, type MatrixClient, type Room } from "matrix-js-sdk";

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
