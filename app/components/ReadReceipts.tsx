import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { ReceiptType } from "matrix-js-sdk/lib/@types/read_receipts";
import { Avatar } from "./Avatar";

const MAX_AVATARS = 5;

/** 이 이벤트를 "여기까지 읽음"으로 가리키는 다른 유저들의 receipt.
 *  (receipt는 유저당 1개 — 항상 그 유저가 읽은 최신 이벤트에만 붙음) */
function readersOfEvent(
  room: Room,
  ev: MatrixEvent,
  myUserId: string,
): string[] {
  return room
    .getReceiptsForEvent(ev)
    .filter(
      (r) =>
        r.type === ReceiptType.Read &&
        r.userId !== myUserId &&
        r.userId !== ev.getSender(),
    )
    .map((r) => r.userId);
}

/** 메시지 우측 하단 읽음 표시 — 작은 아바타 스택 (+N 오버플로).
 *  receipt 변화 리렌더는 Timeline의 RoomEvent.Receipt 구독이 트리거 */
export function ReadReceipts({
  client,
  room,
  ev,
  myUserId,
}: {
  client: MatrixClient;
  room: Room;
  ev: MatrixEvent;
  myUserId: string;
}) {
  const readers = readersOfEvent(room, ev, myUserId);
  if (readers.length === 0) return null;

  const shown = readers.slice(0, MAX_AVATARS);
  const overflow = readers.length - shown.length;
  const names = readers.map((id) => room.getMember(id)?.name ?? id).join(", ");

  return (
    <span
      className="absolute bottom-0.5 right-2 flex items-center"
      title={`${names} 읽음`}
    >
      {shown.map((userId) => {
        const member = room.getMember(userId);
        return (
          <span key={userId} className="-ml-1 first:ml-0">
            <Avatar
              client={client}
              mxcUrl={member?.getMxcAvatarUrl()}
              name={member?.name ?? userId}
              shape="round"
              size={14}
            />
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="ml-0.5 font-mono text-[10px] text-fg-3">
          +{overflow}
        </span>
      )}
    </span>
  );
}
