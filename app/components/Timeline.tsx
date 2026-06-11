import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { Fragment, useEffect, useRef } from "react";
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

  // 새 메시지 오면 바닥 고정 (사용자가 위를 보고 있으면 유지)
  // biome-ignore lint/correctness/useExhaustiveDependencies: events는 트리거 용도 (본문 미사용)
  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [events]);

  /** 과거 로드 + 스크롤 위치 보존 (보던 메시지 유지) */
  async function loadOlderKeepScroll() {
    const list = listRef.current;
    const prevScrollHeight = list?.scrollHeight ?? 0;
    const prevScrollTop = list?.scrollTop ?? 0;
    const loaded = await loadOlder();
    if (!loaded) return;
    requestAnimationFrame(() => {
      if (list) {
        list.scrollTop = prevScrollTop + (list.scrollHeight - prevScrollHeight);
      }
    });
  }

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    // 바닥 근처(80px)에 있을 때만 새 메시지 오면 자동 스크롤
    stickToBottomRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    // 위쪽 200px 안으로 올라오면 과거 로드
    if (list.scrollTop < 200) loadOlderKeepScroll();
  }

  const items = groupTimeline(events);

  return (
    <ul
      ref={listRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto py-3"
    >
      {topSlot}
      {loadingOlder && (
        <li className="py-2 text-center font-mono text-[10px] text-fg-3">
          과거 메시지 불러오는 중...
        </li>
      )}
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
  );
}
