import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { memo, useEffect, useMemo, useRef } from "react";
import { translate } from "../lib/i18n";
import { renderMessageHtml, revealTyping } from "../lib/message-html";

/** 메시지 본문 렌더러: formatted_body(HTML)가 있으면 살균 후 렌더,
 *  없으면 평문 + URL 링크화 + <br> 변환. 코드블록은 highlight.js로 구문 강조
 *  (문자열 단계에서 색을 박아 깜빡임 없음) + 복사 버튼 제공.
 *  살균/하이라이트/캐시 파이프라인은 lib/message-html.ts.
 *  수정(m.replace)된 이벤트는 SDK가 getContent()에서 최신 내용을
 *  돌려주므로 추가 처리 불필요. */
function MessageBodyInner({
  client,
  ev,
  contentVersion: _contentVersion,
}: {
  client: MatrixClient;
  ev: MatrixEvent;
  /** group.ts의 eventVersion(ev) — memo 무효화 트리거.
   *  SDK가 같은 MatrixEvent 인스턴스를 mutate(복호화/m.replace/redaction)해도
   *  ev 참조가 같아서 memo가 스킵하던 문제 해결. 실제 값은 안 쓰고 prop 변화만 신호. */
  contentVersion: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const content = ev.getContent();
  // 주의: getContent()는 매 호출 새 객체 — 객체 자체를 deps에 넣으면
  // 매 렌더 재살균(전 메시지 DOMPurify+hljs)으로 스크롤 버벅임.
  // 내용 변화(복호화/수정)는 body/formatted_body 문자열로 감지.
  const { body, formatted_body: formattedBody } = content;
  const evType = ev.getType();
  // biome-ignore lint/correctness/useExhaustiveDependencies: content 객체 대신 문자열 키로 메모 (성능)
  const html = useMemo(
    () => renderMessageHtml(client, ev),
    [client, ev, body, formattedBody, evType],
  );

  // 수정(m.replace) 시 타이핑 reveal (렌더 후 DOM에 적용) — 하이라이트는
  // 더 이상 여기서 하지 않는다 (html 문자열에 이미 박혀 있음)
  const prevTextRef = useRef<string | null>(null);
  const cancelRevealRef = useRef<(() => void) | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: html은 innerHTML 갱신 후 재실행 트리거 용도
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // 수정(m.replace)으로 본문이 바뀐 경우: 공통 prefix 이후부터 타이핑 reveal.
    // 첫 마운트(prev=null)는 스킵 — 과거 로드/입장 시 출렁임 방지
    const newText = root.textContent ?? "";
    const prevText = prevTextRef.current;
    prevTextRef.current = newText;
    if (prevText == null || prevText === newText) return;
    cancelRevealRef.current?.();
    let common = 0;
    const max = Math.min(prevText.length, newText.length);
    while (common < max && prevText[common] === newText[common]) common++;
    cancelRevealRef.current = revealTyping(root, common);
    return () => {
      cancelRevealRef.current?.();
      cancelRevealRef.current = null;
    };
  }, [html]);

  // 코드블록 복사 버튼 — 이벤트 위임 (innerHTML로 주입된 버튼이라 React 핸들러 못 닮)
  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-copy]",
    );
    if (!btn) return;
    const code = btn.parentElement?.querySelector("pre");
    const text = code?.textContent ?? "";
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        btn.textContent = translate("msg.code.copied");
        btn.classList.add("copied");
        window.setTimeout(() => {
          btn.textContent = translate("msg.code.copy");
          btn.classList.remove("copied");
        }, 1400);
      })
      .catch((err) => console.warn("code copy failed:", err));
  }

  return (
    <div
      ref={ref}
      className="message-body min-w-0 break-words"
      onClick={onClick}
      // DOMPurify 살균 완료
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export const MessageBody = memo(MessageBodyInner);
