import { EventType, Preset, type Room, type MatrixClient } from "matrix-js-sdk";

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
export function getDirectMap(client: MatrixClient): Record<string, string[]> {
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
