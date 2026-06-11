import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { Fragment, useLayoutEffect, useRef } from "react";
import { groupTimeline } from "../lib/group";
import { DateDivider, UnreadDivider } from "./DateDivider";
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
  unreadMarkerId,
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
  /** 이 이벤트 "다음"에 NEW 경계선 표시 (방 진입 시점 읽음 위치) */
  unreadMarkerId?: string | null;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  // 스크롤 앵커: 현재 보고 있는 첫 메시지(id + offsetTop).
  // 커밋마다 앵커 요소의 이동량만큼 scrollTop을 따라 옮기면
  // 커밋 횟수/순서와 무관하게 보던 위치가 고정됨 (높이차 방식은
  // 복호화 등 중간 커밋에서 보정값이 엉뚱하게 소진되는 버그가 있었음)
  const anchorRef = useRef<{ id: string; top: number } | null>(null);
  // 직전 커밋의 마지막 이벤트 id — "새 메시지 도착" 판별용
  const prevLastIdRef = useRef<string | null>(null);

  /** 뷰포트 상단에 걸친 첫 메시지 요소를 앵커로 측정 */
  function measureAnchor(list: HTMLUListElement) {
    for (const li of list.querySelectorAll<HTMLElement>('li[id^="ev-"]')) {
      if (li.offsetTop + li.offsetHeight > list.scrollTop) {
        return { id: li.id, top: li.offsetTop };
      }
    }
    return null;
  }

  // 페인트 전에 스크롤 위치 보정 (rAF 방식은 한 프레임 늦어 점프가 보임)
  // biome-ignore lint/correctness/useExhaustiveDependencies: events 커밋 직후 위치 보정 트리거
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const last = events[events.length - 1];
    const lastId = last?.getId() ?? null;
    const prevLastId = prevLastIdRef.current;
    prevLastIdRef.current = lastId;
    if (stickToBottomRef.current) {
      // 새 메시지가 끝에 붙은 커밋만 smooth — 기존 내용이 부드럽게 밀려 올라감.
      // 초기 로드/방 전환/과거 로드(끝 불변)는 instant (출렁임 방지)
      const isNewArrival =
        prevLastId != null && lastId != null && lastId !== prevLastId;
      bottomRef.current?.scrollIntoView({
        behavior: isNewArrival ? "smooth" : "instant",
      });
    } else {
      const anchor = anchorRef.current;
      if (anchor) {
        const el = list.querySelector<HTMLElement>(`#${CSS.escape(anchor.id)}`);
        // 앵커 요소가 이동한 만큼 scrollTop도 이동 → 화면상 위치 불변
        if (el) list.scrollTop += el.offsetTop - anchor.top;
      }
    }
    anchorRef.current = measureAnchor(list);
  }, [events]);

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    // 바닥 근처(80px)에 있을 때만 새 메시지 오면 자동 스크롤
    stickToBottomRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    // 사용자가 스크롤할 때마다 앵커 갱신 (지금 보는 메시지 기준)
    anchorRef.current = measureAnchor(list);
    // 위쪽 400px 안으로 올라오면 과거 로드 (여유 있게 미리)
    if (list.scrollTop < 400 && !loadingOlder) loadOlder();
  }

  const items = groupTimeline(events);
  // NEW 경계선: 마커 이벤트가 로드 범위에 있고, 그 뒤에 메시지가 있을 때만
  const markerIndex =
    unreadMarkerId != null
      ? items.findIndex(({ ev }) => ev.getId() === unreadMarkerId)
      : -1;
  const showUnreadAfter =
    markerIndex >= 0 && markerIndex < items.length - 1 ? markerIndex : -1;

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
        {items.map(({ ev, showHeader, dateDivider }, i) => (
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
            {i === showUnreadAfter && (
              <li>
                <UnreadDivider />
              </li>
            )}
          </Fragment>
        ))}
        <div ref={bottomRef} />
      </ul>
    </div>
  );
}
