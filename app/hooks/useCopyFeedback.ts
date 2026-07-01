import { useCallback, useState } from "react";

/** 클립보드 복사 + "복사됨" 피드백 상태 — userId/roomId 복사 버튼 공용.
 *  copy(text) 성공 시 copied=true, duration 후 자동 해제. */
export function useCopyFeedback(duration = 1200) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), duration);
      } catch (e) {
        console.warn("클립보드 복사 실패:", e);
      }
    },
    [duration],
  );

  return { copied, copy };
}
