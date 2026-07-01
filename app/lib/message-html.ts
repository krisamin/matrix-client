import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { hasMarkdown, markdownToMatrixHtml } from "./markdown";
import { getReplyToId } from "./reply";

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
  "button", // 코드블록 복사 버튼 (highlightHtml에서 주입)
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
  "type",
  "data-copy", // 코드블록 복사 버튼 (클릭 위임 식별)
  "aria-label",
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

/** code class="language-xxx"에서 hljs가 아는 언어명 추출 (없으면 null=자동감지) */
function detectLanguage(codeEl: Element): string | null {
  for (const cls of codeEl.classList) {
    const m = /^language-(.+)$/.exec(cls) ?? /^lang-(.+)$/.exec(cls);
    if (m) {
      const lang = m[1].toLowerCase();
      if (hljs.getLanguage(lang)) return lang;
    }
  }
  return null;
}

/** 살균+하이라이트 결과 모듈 캐시.
 *  가상 스크롤에서 행이 뷰포트를 들락날락하면 MessageBody가 mount/unmount를
 *  반복한다. useMemo는 unmount 시 캐시가 날아가므로, 재마운트마다 무거운
 *  DOMPurify.sanitize + highlightHtml(hljs)이 재실행돼 스크롤이 버벅인다.
 *  결과를 컴포넌트 밖(모듈 레벨) Map에 보관해 재마운트 시 즉시 히트시킨다.
 *  키 = 이벤트 id + 내용 길이 (수정/복호화로 내용이 바뀌면 키가 달라져 갱신).
 *  LRU 비슷하게 상한을 두고 오래된 항목부터 버린다. */
const htmlCache = new Map<string, string>();
const HTML_CACHE_MAX = 600;

function getCachedHtml(key: string, build: () => string): string {
  const hit = htmlCache.get(key);
  if (hit !== undefined) {
    // 최근 사용으로 끌어올림 (Map은 삽입 순서 유지 → 재삽입으로 LRU 근사)
    htmlCache.delete(key);
    htmlCache.set(key, hit);
    return hit;
  }
  const built = build();
  htmlCache.set(key, built);
  if (htmlCache.size > HTML_CACHE_MAX) {
    const oldest = htmlCache.keys().next().value;
    if (oldest !== undefined) htmlCache.delete(oldest);
  }
  return built;
}

/** 살균된 HTML 안의 모든 <pre><code>를 구문 강조하고 복사 버튼을 단다.
 *  — 핵심: 하이라이트를 "문자열 단계"에서 끝내서 렌더 시 innerHTML 단 1회 세팅.
 *    예전엔 useEffect에서 highlightElement로 DOM을 후처리해서, 수정(m.replace)/
 *    복호화로 html이 재세팅될 때마다 "색 빠졌다가 다시 칠해짐"이 반복 → 깜빡임.
 *    이제 색이 박힌 채로 그려지므로 깜빡임이 없다. */
function highlightHtml(html: string): string {
  // 빠른 탈출: 코드블록이 없으면 파싱 비용 자체를 스킵
  if (!html.includes("<pre")) return html;
  const doc = new DOMParser().parseFromString(
    `<body>${html}</body>`,
    "text/html",
  );
  for (const pre of doc.querySelectorAll("pre")) {
    const code = pre.querySelector("code") ?? pre;
    const text = code.textContent ?? "";
    if (text.length > 0) {
      const lang = detectLanguage(code);
      try {
        const result = lang
          ? hljs.highlight(text, { language: lang })
          : hljs.highlightAuto(text);
        code.innerHTML = result.value;
        code.classList.add("hljs");
      } catch {
        // 강조 실패해도 평문 코드는 그대로 보존
      }
    }
    // <pre>를 래퍼로 감싸고 복사 버튼 주입 (CSS .code-block-wrap)
    const wrap = doc.createElement("div");
    wrap.className = "code-block-wrap";
    const btn = doc.createElement("button");
    btn.setAttribute("type", "button");
    btn.setAttribute("data-copy", "");
    btn.setAttribute("aria-label", "Copy code");
    btn.className = "code-copy-btn";
    btn.textContent = "Copy";
    pre.replaceWith(wrap);
    wrap.append(btn, pre);
  }
  return doc.body.innerHTML;
}

/** 이벤트 본문 → 표시용 HTML (살균+하이라이트+캐시까지 한 번에).
 *  MessageBody의 useMemo에서 호출 — 캐시가 모듈 레벨이라 가상 스크롤
 *  재마운트에도 살아남는다. */
export function renderMessageHtml(
  client: MatrixClient,
  ev: MatrixEvent,
): string {
  const content = ev.getContent();
  const { body, formatted_body: formattedBody } = content;
  // 모듈 캐시 키: 이벤트 id + 내용 길이 (수정/복호화로 내용 바뀌면 갱신).
  // 재마운트(가상 스크롤 in/out) 시 useMemo는 날아가지만 이 캐시는 살아남음.
  const cacheKey = `${ev.getId() ?? "?"}:${((body as string) ?? "").length}:${
    ((formattedBody as string) ?? "").length
  }`;
  return getCachedHtml(cacheKey, () => {
    const useHtml =
      content.format === "org.matrix.custom.html" &&
      typeof content.formatted_body === "string";
    // 답장 메시지의 평문 fallback 인용부는 ReplyQuote가 따로 그리므로 제거.
    // 양 끝 공백/빈 줄(\n, 보이지 않는 whitespace)도 트림 — 게이트웨이가 가끔
    // 메시지 앞뒤로 줄바꿈을 여러 개 붙여 보내, 칩 다음 답이 큰 공백으로
    // 시작하거나 끝나는 시각적 이슈가 있었음.
    const isReply = getReplyToId(ev) != null;
    const plainBody = (
      isReply
        ? stripPlainReplyFallback(content.body ?? "")
        : (content.body ?? "")
    ).trim();
    // HTML formatted body는 앞뒤 공백/`<br>`/`<br/>`/`<p></p>` 같은 빈
    // 블록을 정리해 양 끝 시각적 공백 제거.
    const trimmedFormatted =
      useHtml && typeof content.formatted_body === "string"
        ? content.formatted_body
            .replace(/^(?:\s|<br\s*\/?>|<p>\s*<\/p>)+/i, "")
            .replace(/(?:\s|<br\s*\/?>|<p>\s*<\/p>)+$/i, "")
        : "";
    const raw = useHtml
      ? stripInterTagNewlines(
          convertMxcUrls(client, stripMxReply(trimmedFormatted)),
        )
      : // formatted_body가 없는 평문이라도 마크다운(테이블/코드블록/리스트
        // 등)을 담고 있으면 렌더한다. 발신측(mention.ts)이 formatted_body를
        // 붙이는 기준과 동일한 hasMarkdown 휴리스틱을 재사용해, 평문에 우연히
        // 들어간 기호(*별표* 등)에 대한 동작을 발신/수신 양측에서 일관시킨다.
        // (봇·스크립트·다른 클라가 formatted_body 없이 보낸 마크다운 대응)
        hasMarkdown(plainBody)
        ? markdownToMatrixHtml(plainBody)
        : linkifyPlain(plainBody);
    const clean = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      // href는 http/https/mailto/matrix.to만
      ALLOWED_URI_REGEXP: /^(?:https?|mailto|magnet):|^#|^matrix:/i,
    });
    // 구문 강조 + 복사 버튼을 문자열 단계에서 완성 (렌더 시 1회 세팅 → 깜빡임 0)
    return highlightHtml(clean);
  });
}

/** 수정(타이핑) reveal — root의 텍스트 노드들을 순회하며 fromOffset 이후
 *  글자를 숨겼다가 점진적으로 풀어 "촤라라락" 타이핑 느낌을 만든다.
 *  반환: 취소 함수 (다음 수정이 겹치면 이전 애니메이션 중단) */
export function revealTyping(
  root: HTMLElement,
  fromOffset: number,
): () => void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hidden: { node: Text; full: string }[] = [];
  let offset = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    const full = node.data;
    const start = offset;
    offset += full.length;
    if (offset <= fromOffset) continue; // 전부 공통 prefix — 그대로
    const keep = Math.max(0, fromOffset - start);
    hidden.push({ node, full });
    node.data = full.slice(0, keep);
  }
  if (hidden.length === 0) return () => {};

  const totalChars = hidden.reduce(
    (sum, h) => sum + (h.full.length - h.node.data.length),
    0,
  );
  // 길이에 비례하되 0.35~1.1s로 캡 (너무 길면 답답, 짧으면 안 보임)
  const duration = Math.min(1100, Math.max(350, totalChars * 18));
  let cancelled = false;
  const startTime = performance.now();
  // ease-out: 처음 빠르게 치고 끝에서 살짝 감속 — 등속보다 자연스러움
  const ease = (t: number) => 1 - (1 - t) ** 2.4;

  const tick = (now: number) => {
    if (cancelled) return;
    const progress = ease(Math.min(1, (now - startTime) / duration));
    let budget = Math.floor(totalChars * progress);
    for (const h of hidden) {
      const revealed = Math.min(
        h.full.length,
        h.node.data.length + Math.max(0, budget),
      );
      budget -= revealed - h.node.data.length;
      if (revealed !== h.node.data.length)
        h.node.data = h.full.slice(0, revealed);
    }
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    // 즉시 전체 공개 (다음 렌더가 어차피 갈아끼우지만 안전하게)
    for (const h of hidden) h.node.data = h.full;
  };
}
