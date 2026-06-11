import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { Fragment, useLayoutEffect, useRef } from "react";
import { groupTimeline } from "../lib/group";
import { DateDivider } from "./DateDivider";
import { EventLine } from "./EventLine";

/** 타임라인 스크롤 영역 — 룸/스레드 100% 동일.
 *  바닥 고정(새 메시지), 위로 스크롤 시 과거 로드(위치 보존), 점프 강조.
 *  데이터는 호출부 훅(useRoomTimeline/useThreadTimeline)이 공급. */
export function Timeline({
  client,
  room,
  events,
  myUserId,
  loadingOlder,
  hasMore = true,
  loadOlder,
  onOpenThread,
  onReply,
  highlightId,
  onJumpTo,
  topSlot,
}: {
  client: MatrixClient;
  room: Room;
  events: MatrixEvent[];
  myUserId: string;
  loadingOlder: boolean;
  /** false면 "대화의 시작" 표시 (스레드는 생략 가능) */
  hasMore?: boolean;
  /** 과거 페이지 로드 — 반환값 true면 더 가져옴 */
  loadOlder: () => Promise<boolean>;
  onOpenThread?: (rootId: string) => void;
  onReply?: (ev: MatrixEvent) => void;
  highlightId?: string | null;
  onJumpTo?: (eventId: string) => void;
  /** 리스트 최상단 고정 콘텐츠 (스레드: 루트 메시지 + REPLIES 구분선) */
  topSlot?: React.ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  // 과거 로드 직전의 스크롤 상태 — 커밋 직후(페인트 전) 위치 보정용
  const pendingAdjustRef = useRef<{ height: number; top: number } | null>(null);

  // 페인트 전에 스크롤 위치 보정 (rAF 방식은 한 프레임 늦어 점프가 보임)
  // biome-ignore lint/correctness/useExhaustiveDependencies: events 커밋 직후 위치 보정 트리거
  useLayoutEffect(() => {
    const list = listRef.current;
    const pending = pendingAdjustRef.current;
    if (list && pending) {
      pendingAdjustRef.current = null;
      list.scrollTop = pending.top + (list.scrollHeight - pending.height);
      return;
    }
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [events]);

  /** 과거 로드 + 스크롤 위치 보존 (보던 메시지 유지) */
  async function loadOlderKeepScroll() {
    const list = listRef.current;
    if (!list) return;
    // 로드 직전 상태 저장 → setEvents 커밋 직후 useLayoutEffect가 보정
    pendingAdjustRef.current = {
      height: list.scrollHeight,
      top: list.scrollTop,
    };
    const loaded = await loadOlder();
    if (!loaded) pendingAdjustRef.current = null;
  }

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    // 바닥 근처(80px)에 있을 때만 새 메시지 오면 자동 스크롤
    stickToBottomRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    // 위쪽 400px 안으로 올라오면 과거 로드 (여유 있게 미리)
    if (list.scrollTop < 400 && !loadingOlder) loadOlderKeepScroll();
  }

  const items = groupTimeline(events);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 로딩 인디케이터: 오버레이 — 리스트 레이아웃을 밀지 않음 */}
      {loadingOlder && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
          <span className="rounded-full border border-line bg-bg-2 px-3 py-1 font-mono text-[11px] text-fg-2 shadow-lg">
            과거 메시지 불러오는 중...
          </span>
        </div>
      )}
      <ul
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto py-3"
        style={{ overflowAnchor: "none" }}
      >
        {topSlot}
        {!hasMore && !topSlot && (
          <li>
            <DateDivider label="대화의 시작" />
          </li>
        )}
        {items.map(({ ev, showHeader, dateDivider }) => (
          <Fragment key={ev.getId()}>
            {dateDivider && (
              <li>
                <DateDivider label={dateDivider} />
              </li>
            )}
            <EventLine
              ev={ev}
              myUserId={myUserId}
              client={client}
              room={room}
              showHeader={showHeader}
              onOpenThread={onOpenThread}
              onReply={onReply}
              onJumpTo={onJumpTo}
              highlighted={highlightId === ev.getId()}
            />
          </Fragment>
        ))}
        <div ref={bottomRef} />
      </ul>
    </div>
  );
}
