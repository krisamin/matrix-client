import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { useEffect, useMemo, useRef } from "react";
import { getReplyToId } from "../lib/reply";

/** Matrix 스펙(11.2.1.7 m.room.message msgtypes)이 허용하는 HTML 태그 —
 *  Element(HtmlUtils)와 동일 집합 기준. script/iframe/style 등은 자동 차단. */
const ALLOWED_TAGS = [
  "font",
  "del",
  "s",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "p",
  "a",
  "ul",
  "ol",
  "sup",
  "sub",
  "li",
  "b",
  "i",
  "u",
  "strong",
  "em",
  "strike",
  "code",
  "hr",
  "br",
  "div",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "caption",
  "pre",
  "span",
  "img",
  "details",
  "summary",
];

const ALLOWED_ATTR = [
  "href",
  "name",
  "target",
  "rel", // a
  "width",
  "height",
  "alt",
  "title",
  "src", // img
  "start", // ol
  "colspan",
  "rowspan", // td/th
  "data-mx-bg-color",
  "data-mx-color",
  "data-mx-spoiler", // matrix 확장
  "class", // code language-* (구문 강조 훅)
];

// 외부 링크는 새 탭 + noopener 강제
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noreferrer noopener");
  }
  // img src는 mxc 변환된 http(s)만 허용 (data: 등 차단)
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src") ?? "";
    if (!src.startsWith("http")) node.removeAttribute("src");
  }
});

/** mx-reply(구식 답장 인용 fallback) 제거 — 답장 UI는 별도 렌더 */
function stripMxReply(html: string): string {
  return html.replace(/<mx-reply>[\s\S]*?<\/mx-reply>/g, "");
}

/** 평문 body의 답장 fallback 인용부("> <@u> ..." 줄들) 제거 */
function stripPlainReplyFallback(text: string): string {
  return text.replace(/^(>.*\n)+\n?/, "");
}

/** mxc:// 이미지 URL을 인증 미디어 HTTP URL로 변환 */
function convertMxcUrls(client: MatrixClient, html: string): string {
  return html.replace(/src="(mxc:\/\/[^"]+)"/g, (_m, mxc) => {
    const http = client.mxcUrlToHttp(mxc, 400, 400, "scale", false, true, true);
    return `src="${http ?? ""}"`;
  });
}

/** 블록 태그 사이의 장식용 개행 제거 — HTML은 white-space: normal로
 *  렌더하므로 원래 무해하지만, <pre> 밖 개행이 <br>로 보존되는 클라이언트
 *  대비 + DOM 노드 수 감소용으로 정리 */
function stripInterTagNewlines(html: string): string {
  return html.replace(/>\n+</g, "><");
}

/** 평문에서 URL 자동 링크화 + 줄바꿈 <br> 변환 (formatted_body 없는 메시지용) */
function linkifyPlain(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br/>");
}

/** 메시지 본문 렌더러: formatted_body(HTML)가 있으면 살균 후 렌더,
 *  없으면 평문 + URL 링크화 + <br> 변환. 코드블록은 highlight.js로 구문 강조.
 *  수정(m.replace)된 이벤트는 SDK가 getContent()에서 최신 내용을
 *  돌려주므로 추가 처리 불필요. */
export function MessageBody({
  client,
  ev,
}: {
  client: MatrixClient;
  ev: MatrixEvent;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const content = ev.getContent();
  // 주의: getContent()는 매 호출 새 객체 — 객체 자체를 deps에 넣으면
  // 매 렌더 재살균(전 메시지 DOMPurify+hljs)으로 스크롤 버벅임.
  // 내용 변화(복호화/수정)는 body/formatted_body 문자열로 감지.
  const { body, formatted_body: formattedBody } = content;
  const evType = ev.getType();
  // biome-ignore lint/correctness/useExhaustiveDependencies: content 객체 대신 문자열 키로 메모 (성능)
  const html = useMemo(() => {
    const useHtml =
      content.format === "org.matrix.custom.html" &&
      typeof content.formatted_body === "string";
    // 답장 메시지의 평문 fallback 인용부는 ReplyQuote가 따로 그리므로 제거
    const isReply = getReplyToId(ev) != null;
    const plainBody = isReply
      ? stripPlainReplyFallback(content.body ?? "")
      : (content.body ?? "");
    const raw = useHtml
      ? stripInterTagNewlines(
          convertMxcUrls(client, stripMxReply(content.formatted_body)),
        )
      : linkifyPlain(plainBody);
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      // href는 http/https/mailto/matrix.to만
      ALLOWED_URI_REGEXP: /^(?:https?|mailto|magnet):|^#|^matrix:/i,
    });
  }, [client, ev, body, formattedBody, evType]);

  // 코드블록 구문 강조 (렌더 후 DOM에 적용 — html 갱신마다)
  // biome-ignore lint/correctness/useExhaustiveDependencies: html은 innerHTML 갱신 후 재실행 트리거 용도
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const block of root.querySelectorAll("pre code")) {
      // 재렌더 시 dataset 마커가 남아 hljs가 경고만 내고 스킵하는 것 방지
      delete (block as HTMLElement).dataset.highlighted;
      hljs.highlightElement(block as HTMLElement);
    }
  }, [html]);

  return (
    <div
      ref={ref}
      className="message-body min-w-0 break-words"
      // DOMPurify 살균 완료
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
