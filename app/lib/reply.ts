import type { MatrixEvent } from "matrix-js-sdk";

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

/** 인용/미리보기 텍스트 (한 줄 요약) */
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
