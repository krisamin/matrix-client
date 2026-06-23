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
  if (ev.isRedacted()) return "Deleted message";
  const content = ev.getContent();
  const msgtype = content.msgtype as string;
  if (msgtype === "m.image") return "📷 Image";
  if (msgtype === "m.video") return "🎞 Video";
  if (msgtype === "m.audio") return "🎙 Audio";
  if (msgtype === "m.file") return `📎 ${content.body ?? "File"}`;
  const body: string = content.body ?? "";
  // 구식 reply fallback("> <@u> ..." 인용부) 제거 후 첫 줄
  const stripped = body.replace(/^(>.*\n)+\n?/, "");
  return stripped.split("\n")[0];
}

/** 인용/미리보기 박스에 작은 썸네일로 띄울 미디어 소스 추출.
 *  이미지/비디오만 대상 (오디오/파일은 썸네일 의미 없음).
 *  반환: getMediaBlobUrl/getThumbnailBlobUrl에 넘길 url|file + mimetype.
 *  미디어가 아니거나 mxc가 없으면 null. */
export function thumbnailSource(ev: MatrixEvent): {
  url?: string;
  file?: unknown;
  mimetype?: string;
} | null {
  if (ev.isRedacted()) return null;
  const content = ev.getContent();
  const msgtype = content.msgtype as string;
  if (msgtype !== "m.image" && msgtype !== "m.video") return null;
  // 비디오는 별도 썸네일(info.thumbnail_url/file)이 있으면 그걸 우선
  if (msgtype === "m.video") {
    const tUrl = content.info?.thumbnail_url as string | undefined;
    const tFile = content.info?.thumbnail_file as unknown;
    if (tFile || tUrl)
      return {
        url: tUrl,
        file: tFile,
        mimetype: content.info?.thumbnail_info?.mimetype as string | undefined,
      };
    return null; // 비디오 썸네일 없으면 생략 (원본 영상 받아오긴 과함)
  }
  // 이미지: url(평문) 또는 file(E2EE)
  return {
    url: content.url as string | undefined,
    file: content.file as unknown,
    mimetype: content.info?.mimetype as string | undefined,
  };
}
