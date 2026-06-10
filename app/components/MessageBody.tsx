import { useMemo } from "react";
import DOMPurify from "dompurify";
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";

/** Matrix 스펙(11.2.1.7 m.room.message msgtypes)이 허용하는 HTML 태그 —
 *  Element(HtmlUtils)와 동일 집합 기준. script/iframe/style 등은 자동 차단. */
const ALLOWED_TAGS = [
  "font", "del", "s", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote",
  "p", "a", "ul", "ol", "sup", "sub", "li", "b", "i", "u", "strong", "em",
  "strike", "code", "hr", "br", "div", "table", "thead", "tbody", "tr",
  "th", "td", "caption", "pre", "span", "img", "details", "summary",
];

const ALLOWED_ATTR = [
  "href", "name", "target", "rel", // a
  "width", "height", "alt", "title", "src", // img
  "start", // ol
  "colspan", "rowspan", // td/th
  "data-mx-bg-color", "data-mx-color", "data-mx-spoiler", // matrix 확장
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

/** mxc:// 이미지 URL을 인증 미디어 HTTP URL로 변환 */
function convertMxcUrls(client: MatrixClient, html: string): string {
  return html.replace(/src="(mxc:\/\/[^"]+)"/g, (_m, mxc) => {
    const http = client.mxcUrlToHttp(mxc, 400, 400, "scale", false, true, true);
    return `src="${http ?? ""}"`;
  });
}

/** 평문에서 URL 자동 링크화 + 줄바꿈 유지 (formatted_body 없는 메시지용) */
function linkifyPlain(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>',
  );
}

/** 메시지 본문 렌더러: formatted_body(HTML)가 있으면 살균 후 렌더,
 *  없으면 평문 + URL 링크화. 수정(m.replace)된 이벤트는 SDK가
 *  getContent()에서 최신 내용을 돌려주므로 추가 처리 불필요. */
export function MessageBody({
  client,
  ev,
  mine,
}: {
  client: MatrixClient;
  ev: MatrixEvent;
  mine: boolean;
}) {
  const content = ev.getContent();
  const html = useMemo(() => {
    const useHtml =
      content.format === "org.matrix.custom.html" &&
      typeof content.formatted_body === "string";
    const raw = useHtml
      ? convertMxcUrls(client, stripMxReply(content.formatted_body))
      : linkifyPlain(content.body ?? "");
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      // href는 http/https/mailto/matrix.to만
      ALLOWED_URI_REGEXP: /^(?:https?|mailto|magnet):|^#|^matrix:/i,
    });
  }, [client, content]);

  return (
    <span
      className={`message-body max-w-[80%] break-words rounded-lg px-3 py-1.5 ${
        mine ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-800"
      }`}
      // eslint-disable-next-line react/no-danger -- DOMPurify 살균 완료
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
