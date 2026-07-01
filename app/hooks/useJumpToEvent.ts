import { useCallback, useState } from "react";
import type { TimelineHandle } from "../components/Timeline";

/** 검색 결과/인용 클릭 → 해당 이벤트로 스크롤 + 잠깐 강조. 룸/스레드 공용.
 *  로드된 범위에 없으면 과거를 더 불러오며 시도 (최대 5페이지).
 *  가상 스크롤이라 DOM 유무와 무관하게 인덱스 기반(timelineRef)으로 스크롤.
 *  jumpTo는 useCallback 안정 참조 — EventLine memo가 깨지지 않는다. */
export function useJumpToEvent(
  timelineRef: React.RefObject<TimelineHandle | null>,
  hasMore: boolean,
  loadOlder: () => Promise<boolean>,
  highlightMs = 2400,
) {
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const jumpTo = useCallback(
    async (eventId: string) => {
      for (let i = 0; i < 5; i++) {
        if (timelineRef.current?.scrollToEvent(eventId)) {
          setHighlightId(eventId);
          setTimeout(() => setHighlightId(null), highlightMs);
          return;
        }
        if (!hasMore) break;
        await loadOlder();
      }
    },
    [timelineRef, hasMore, loadOlder, highlightMs],
  );

  return { highlightId, jumpTo };
}
