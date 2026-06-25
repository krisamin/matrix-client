import { marked } from "marked";

/** 마크다운 원본이 의미 있는 마크업을 포함하는지 빠른 검사.
 *  코드블록/인라인코드/굵게/기울임/링크/리스트/헤더/인용 중 하나라도 있으면 true.
 *  순수 평문이면 false → formatted_body 첨부 자체를 건너뛰어 메시지 사이즈 절약. */
export function hasMarkdown(text: string): boolean {
  return (
    /```/.test(text) ||
    /`[^`\n]+`/.test(text) ||
    /\*\*[^*\n]+\*\*/.test(text) ||
    /(^|\s)\*[^*\n]+\*(\s|$)/.test(text) ||
    /(^|\s)_[^_\n]+_(\s|$)/.test(text) ||
    /~~[^~\n]+~~/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text) ||
    /^>\s/m.test(text) ||
    /^#{1,6}\s/m.test(text) ||
    /^[-*+]\s/m.test(text) ||
    /^\d+\.\s/m.test(text)
  );
}

// GFM(테이블/체크박스/취소선) + 줄바꿈을 <br>로 변환(채팅 관례).
// async: false → 동기 반환 보장.
marked.setOptions({
  gfm: true,
  breaks: true,
  async: false,
});

/** Matrix formatted_body로 보낼 HTML 생성. Matrix는 살균된 HTML 부분집합만
 *  허용하므로 marked 출력을 그대로 보내도 무방 (수신측 MessageBody에서도
 *  DOMPurify로 한 번 더 살균). */
export function markdownToMatrixHtml(text: string): string {
  return marked.parse(text) as string;
}
