import { Reply } from "lucide-react";
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { getReplyToId, quotePreview } from "../lib/reply";

export { getReplyToId };

/** 답장 원문 인용 박스 (높이 22px 통일). 원문이 로컬에 없으면 서버에서 가져옴. */
export function ReplyQuote({
  client,
  room,
  replyToId,
  onClick,
}: {
  client: MatrixClient;
  room: Room;
  replyToId: string;
  onClick?: () => void;
}) {
  const [original, setOriginal] = useState<MatrixEvent | null>(
    () => room.findEventById(replyToId) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (original || failed) return;
    let alive = true;
    // 로컬에 없는 과거 이벤트 — /event API로 단건 조회
    client
      .fetchRoomEvent(room.roomId, replyToId)
      .then(async (raw) => {
        if (!alive) return;
        const { MatrixEvent: MatrixEventCls } = await import("matrix-js-sdk");
        const ev = new MatrixEventCls(raw);
        if (ev.isEncrypted()) await client.decryptEventIfNeeded(ev);
        if (alive) setOriginal(ev);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [client, room, replyToId, original, failed]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 flex h-[22px] max-w-full items-center gap-1.5 rounded-md border-l-2 border-line-strong bg-bg-2 pl-2 pr-2.5 text-[12px] text-fg-2"
      title="원문으로 이동"
    >
      <Reply className="h-3 w-3 shrink-0" />
      {original ? (
        <>
          <span className="shrink-0 font-medium text-fg-1">
            {original.sender?.name ?? original.getSender()}
          </span>
          <span className="truncate">{quotePreview(original)}</span>
        </>
      ) : (
        <span className="truncate">
          {failed ? "원문을 불러올 수 없습니다" : "원문 불러오는 중..."}
        </span>
      )}
    </button>
  );
}
