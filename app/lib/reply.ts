import type { MatrixEvent } from "matrix-js-sdk";
import { buildMentionContent, type Mention } from "./mention";

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

/** 전송용 메시지 content 생성 — 멘션/마크다운(buildMentionContent) 위에
 *  답장(m.in_reply_to)과 스레드(m.thread) 관계를 얹는다. 룸/스레드 공용.
 *
 *  - replyTo: 답장 대상. 구식 클라용 fallback 인용문("> <@u> ...")을 body에
 *    포함 (스펙 권장). 수신측 ReplyQuote는 이 인용부를 걷어내고 따로 그림.
 *  - threadId: 스레드 루트. replyTo와 함께면 "스레드 안의 답장"
 *    (is_falling_back: false — 진짜 답장), replyTo 없이면 일반 스레드 답글
 *    (is_falling_back: true — in_reply_to는 스레드 미지원 클라 fallback). */
export function buildSendContent({
  text,
  mentions = [],
  replyTo,
  threadId,
}: {
  text: string;
  mentions?: Mention[];
  replyTo?: MatrixEvent | null;
  threadId?: string;
}): Record<string, unknown> {
  const content = buildMentionContent(text, mentions);

  if (replyTo) {
    // 구식 클라용 fallback 인용문 (스펙 권장)
    const orig: string = replyTo.getContent().body ?? "";
    const fallbackQuote = orig
      .split("\n")
      .map((l: string, i: number) =>
        i === 0 ? `> <${replyTo.getSender()}> ${l}` : `> ${l}`,
      )
      .join("\n");
    content.body = `${fallbackQuote}\n\n${text}`;
    content["m.relates_to"] = threadId
      ? {
          rel_type: "m.thread",
          event_id: threadId,
          // 진짜 답장 (fallback 아님) — 수신측이 인용 박스를 그린다
          is_falling_back: false,
          "m.in_reply_to": { event_id: replyTo.getId()! },
        }
      : { "m.in_reply_to": { event_id: replyTo.getId()! } };
  } else if (threadId) {
    content["m.relates_to"] = {
      rel_type: "m.thread",
      event_id: threadId,
      is_falling_back: true,
    };
  }

  return content;
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
