import { useVirtualizer } from "@tanstack/react-virtual";
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { groupTimeline } from "../lib/group";
import { DateDivider, UnreadDivider } from "./DateDivider";
import { EventLine } from "./EventLine";

/** 부모(점프/검색)가 호출하는 명령형 핸들. 가상 스크롤에서는 안 보이는
 *  행이 DOM에 없으므로 getElementById 대신 인덱스 기반 스크롤이 필요하다. */
export interface TimelineHandle {
  /** 로드된 범위에 해당 이벤트가 있으면 그 행으로 스크롤하고 true 반환 */
  scrollToEvent: (eventId: string) => boolean;
}

/** 가상 스크롤 행 — topSlot/시작구분선/이벤트를 한 배열로 통합해
 *  가상화 인덱스를 단순하게 유지한다. dateDivider/UnreadDivider는
 *  해당 이벤트 행 내부(위/아래)에 같이 렌더 → 1행 = 1 virtual item. */
type Row =
  | { kind: "top"; key: string }
  | { kind: "start"; key: string }
  | {
      kind: "event";
      key: string;
      ev: MatrixEvent;
      showHeader: boolean;
      dateDivider: string | null;
      unreadAfter: boolean;
    };

interface TimelineProps {
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
}

/** 타임라인 스크롤 영역 — 룸/스레드 100% 동일. @tanstack/react-virtual로
 *  보이는 행만 렌더(수백 개여도 가벼움).
 *
 *  스크롤 동작은 virtualizer의 `anchorTo: "end"`에 위임한다:
 *   - prepend(과거 로드): 현재 뷰포트 앵커 기준으로 scrollOffset을 자동
 *     보정 → 보던 위치 불변 (추정/측정 오차와 무관).
 *   - append(새 메시지): 바닥 근처(isAtEnd)이고 마지막 키가 바뀌었을 때만
 *     `followOnAppend`로 바닥 추적 → 부드럽게 따라감.
 *   - 제자리 갱신(복호화/수신/수정 — 끝 키 불변)은 edgeKeysChanged=false라
 *     스크롤을 건드리지 않음 → smooth 스크롤이 끊기던 문제 원천 해결. */
export const Timeline = forwardRef<TimelineHandle, TimelineProps>(
  function Timeline(
    {
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
    },
    ref,
  ) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // 통합 행 배열 구성
    const rows = useMemo<Row[]>(() => {
      const out: Row[] = [];
      if (topSlot) out.push({ kind: "top", key: "__top__" });
      else if (!hasMore) out.push({ kind: "start", key: "__start__" });

      const items = groupTimeline(events);
      const markerIndex =
        unreadMarkerId != null
          ? items.findIndex(({ ev }) => ev.getId() === unreadMarkerId)
          : -1;
      // 마커 뒤에 메시지가 있을 때만 NEW 경계선 (마지막 메시지면 생략)
      const showUnreadAfter =
        markerIndex >= 0 && markerIndex < items.length - 1 ? markerIndex : -1;

      items.forEach(({ ev, showHeader, dateDivider }, i) => {
        out.push({
          kind: "event",
          key: ev.getId() ?? `idx-${i}`,
          ev,
          showHeader,
          dateDivider,
          unreadAfter: i === showUnreadAfter,
        });
      });
      return out;
    }, [events, topSlot, hasMore, unreadMarkerId]);

    const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => 60,
      getItemKey: (i) => rows[i].key,
      overscan: 8,
      // 채팅은 바닥 기준 — prepend 위치 보존 + append 바닥 추적을 빌트인 처리
      anchorTo: "end",
      // 바닥 근처에서 새 메시지가 끝에 붙으면 부드럽게 따라감
      followOnAppend: "smooth",
      // 바닥 추적으로 간주하는 임계(px) — onScroll의 80px과 맞춤
      scrollEndThreshold: 80,
    });

    // 부모(jumpTo)용: 인덱스 기반 스크롤 (DOM 존재 여부와 무관하게 동작)
    useImperativeHandle(
      ref,
      () => ({
        scrollToEvent: (eventId: string) => {
          const idx = rows.findIndex(
            (r) => r.kind === "event" && r.ev.getId() === eventId,
          );
          if (idx < 0) return false;
          virtualizer.scrollToIndex(idx, { align: "center" });
          return true;
        },
      }),
      [rows, virtualizer],
    );

    function onScroll() {
      const el = scrollRef.current;
      if (!el) return;
      // 위쪽 400px 안으로 올라오면 과거 로드 (여유 있게 미리).
      // 위치 보존은 virtualizer anchorTo가 알아서 처리.
      if (el.scrollTop < 400 && !loadingOlder && hasMore) void loadOlder();
    }

    const virtualItems = virtualizer.getVirtualItems();

    const renderRow = useCallback(
      (row: Row) => {
        if (row.kind === "top") return topSlot;
        if (row.kind === "start") return <DateDivider label="대화의 시작" />;
        return (
          <>
            {row.dateDivider && <DateDivider label={row.dateDivider} />}
            <EventLine
              ev={row.ev}
              myUserId={myUserId}
              client={client}
              room={room}
              showHeader={row.showHeader}
              onOpenThread={onOpenThread}
              onReply={onReply}
              onJumpTo={onJumpTo}
              highlighted={highlightId === row.ev.getId()}
            />
            {row.unreadAfter && <UnreadDivider />}
          </>
        );
      },
      [
        client,
        room,
        myUserId,
        topSlot,
        onOpenThread,
        onReply,
        onJumpTo,
        highlightId,
      ],
    );

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
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto py-3"
          style={{ overflowAnchor: "none" }}
        >
          {/* 전체 높이 스페이서 — 가상 아이템은 이 안에 절대 배치 */}
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualItems.map((vi) => (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                {renderRow(rows[vi.index])}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
);
