import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { useEffect, useState } from "react";

/** 이벤트에서 답장 대상(m.in_reply_to) event_id 추출.
 *  스레드 답글은 fallback용 in_reply_to를 같이 달고 오므로
 *  (is_falling_back: true) 그건 답장으로 취급하지 않음. */
export function getReplyToId(ev: MatrixEvent): string | null {
  const relates = ev.getWireContent()?.["m.relates_to"];
  const replyTo = relates?.["m.in_reply_to"]?.event_id;
  if (!replyTo) return null;
  if (relates.rel_type === "m.thread" && relates.is_falling_back) return null;
  return replyTo;
}

/** 인용 미리보기 텍스트 (한 줄 요약) */
export function quotePreview(ev: MatrixEvent): string {
  if (ev.isRedacted()) return "(삭제된 메시지)";
  const content = ev.getContent();
  const msgtype = content.msgtype as string;
  if (msgtype === "m.image") return "📷 사진";
  if (msgtype === "m.video") return "🎞 동영상";
  if (msgtype === "m.audio") return "🎙 음성";
  if (msgtype === "m.file") return `📎 ${content.body ?? "파일"}`;
  const body: string = content.body ?? "";
  // 구식 reply fallback("> <@u> ..." 인용부) 제거 후 첫 줄
  const stripped = body.replace(/^(>.*\n)+\n?/, "");
  return stripped.split("\n")[0];
}

/** 답장 원문 인용 박스. 원문이 로컬에 없으면 서버에서 가져옴. */
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
      className="mb-0.5 flex max-w-[80%] flex-col rounded border-l-2 border-blue-400 bg-gray-100 px-2 py-1 text-left text-xs dark:bg-gray-900"
      title="원문으로 이동"
    >
      {original ? (
        <>
          <span className="font-medium text-blue-500">
            {original.getSender()}
          </span>
          <span className="truncate text-gray-500">
            {quotePreview(original)}
          </span>
        </>
      ) : (
        <span className="text-gray-400">
          {failed ? "(원문을 불러올 수 없음)" : "원문 불러오는 중..."}
        </span>
      )}
    </button>
  );
}
