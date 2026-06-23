import { Reply } from "lucide-react";
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { getReplyToId, quotePreview, thumbnailSource } from "../lib/reply";
import { QuoteThumbnail } from "./QuoteThumbnail";

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
  const t = useT();
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

  const thumb = original ? thumbnailSource(original) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 flex min-h-[22px] max-w-full items-center gap-1.5 rounded-md border-l-2 border-line-strong bg-bg-2 py-0.5 pl-2 pr-2.5 text-[12px] text-fg-2"
      title={t("reply.gotoOriginal")}
    >
      <Reply className="h-3 w-3 shrink-0" />
      {original ? (
        <>
          <span className="shrink-0 font-medium text-fg-1">
            {original.sender?.name ?? original.getSender()}
          </span>
          {thumb && <QuoteThumbnail client={client} source={thumb} size={18} />}
          <span className="truncate">{quotePreview(original)}</span>
        </>
      ) : (
        <span className="truncate">
          {failed ? t("reply.failed") : t("reply.loading")}
        </span>
      )}
    </button>
  );
}
