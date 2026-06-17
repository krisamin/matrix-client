import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { groupTimeline } from "../lib/group";
import { DateDivider, UnreadDivider } from "./DateDivider";
import { EventLine } from "./EventLine";

/** 부모(점프/검색)가 호출하는 명령형 핸들. */
export interface TimelineHandle {
  /** 로드된 범위에 해당 이벤트가 있으면 그 행으로 스크롤하고 true 반환 */
  scrollToEvent: (eventId: string) => boolean;
}

/** 렌더 행 — topSlot/시작구분선/이벤트를 한 배열로 통합. dateDivider/
 *  UnreadDivider는 해당 이벤트 행 내부(위/아래)에 같이 렌더. */
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
      contentVersion: string;
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

/** 바닥 추적으로 간주하는 임계(px) — 이 안에 있으면 "바닥에 붙어있다" 판정 */
const NEAR_BOTTOM_PX = 80;
/** 위쪽 이 안으로 올라오면 과거 로드 (여유 있게 미리) */
const LOAD_TRIGGER_PX = 400;

/** 타임라인 스크롤 영역 — 룸/스레드 100% 동일.
 *
 *  전통적 채팅 스크롤(Element/Discord류). 가상화를 쓰지 않는다 — 채팅은
 *  수백 행 규모라 전부 렌더해도 가볍고, 가상화의 동적 높이 측정/위치
 *  앵커링이 오히려 스크롤 위치를 튀게 만들었다(99030e9 회귀).
 *
 *  스크롤 위치 관리 3원칙:
 *   1) prepend(과거 로드): 로드 직전 scrollHeight를 기억 → 로드 후 늘어난
 *      만큼 scrollTop을 더해 보던 위치를 정확히 보존(측정/추정 오차 0).
 *   2) append(새 메시지): 직전에 바닥 근처였으면 바닥으로 따라감.
 *   3) 초기 진입: 맨 아래로. */
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
    // prepend(과거 로드) 위치 보존: 로드 "시작" 시점의 바닥 기준 거리를 박아둔다.
    // delta 누적이 아니라 절대 거리라, 로드~보정 사이에 다른 리렌더(복호화/
    // 이미지 로드 등)가 끼어도 어긋나지 않는다. null = 보정 대기 없음.
    const pendingPrependRef = useRef<number | null>(null);
    const prevLenRef = useRef(0);
    // 직전 렌더 시점에 바닥 근처였는지 (append 추적 판단용)
    const wasNearBottomRef = useRef(true);
    // 초기 진입 후 1회 바닥 점프 완료 여부
    const didInitialScrollRef = useRef(false);

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

      items.forEach(({ ev, showHeader, dateDivider, contentVersion }, i) => {
        out.push({
          kind: "event",
          key: ev.getId() ?? `idx-${i}`,
          ev,
          showHeader,
          dateDivider,
          unreadAfter: i === showUnreadAfter,
          contentVersion,
        });
      });
      return out;
    }, [events, topSlot, hasMore, unreadMarkerId]);

    // 렌더 직전(브라우저 페인트 전)에 스크롤 위치를 결정한다.
    // useLayoutEffect라서 사용자는 중간 점프를 못 본다 → 출렁임 0.
    useLayoutEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      const prevLen = prevLenRef.current;
      const grew = rows.length > prevLen;

      // 1) prepend 보정 대기 중이면 최우선 — 로드 시작 시점의 바닥 기준 거리를
      //    복원한다. scrollTop = (전체높이 - 뷰포트) - 저장된 바닥거리.
      //    delta 누적이 아니라 절대 위치라 중간 리렌더와 무관하게 정확.
      if (pendingPrependRef.current != null && grew) {
        const dist = pendingPrependRef.current;
        pendingPrependRef.current = null;
        el.scrollTop = el.scrollHeight - el.clientHeight - dist;
      }
      // 2) 초기 진입: 맨 아래로 (1회)
      else if (!didInitialScrollRef.current && rows.length > 0) {
        el.scrollTop = el.scrollHeight;
        didInitialScrollRef.current = true;
      }
      // 3) append: 끝에 행이 붙었고 직전에 바닥 근처였으면 바닥 추적.
      else if (grew && wasNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }

      prevLenRef.current = rows.length;
      wasNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    }, [rows.length]);

    // 방이 바뀌면 초기 스크롤/스냅샷 리셋
    // biome-ignore lint/correctness/useExhaustiveDependencies: room.roomId 변화로 리셋
    useEffect(() => {
      didInitialScrollRef.current = false;
      pendingPrependRef.current = null;
      prevLenRef.current = 0;
      wasNearBottomRef.current = true;
    }, [room.roomId]);

    // 부모(jumpTo)용: DOM id 기반 스크롤. 전부 렌더되므로 보이는 범위면 즉시 동작.
    useImperativeHandle(
      ref,
      () => ({
        scrollToEvent: (eventId: string) => {
          const el = scrollRef.current?.querySelector(
            `#ev-${CSS.escape(eventId)}`,
          );
          if (!el) return false;
          el.scrollIntoView({ block: "center" });
          return true;
        },
      }),
      [],
    );

    const onScroll = useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      // 바닥 근처 여부를 매 스크롤마다 추적 (append 추적 판단의 소스)
      wasNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      // 위로 충분히 올라오면 과거 로드. 로드 "시작" 시점의 바닥 기준 거리를
      // 박아둬서, 로드 완료 후 useLayoutEffect가 그 위치를 정확히 복원한다.
      if (el.scrollTop < LOAD_TRIGGER_PX && !loadingOlder && hasMore) {
        if (pendingPrependRef.current == null)
          pendingPrependRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight;
        void loadOlder();
      }
    }, [loadingOlder, hasMore, loadOlder]);

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
        {/* 스크롤 컨테이너 — 패딩/갭 없음. 행 간격은 전부 EventLine 내부가
            책임진다(같은 유저 연속=좁게, 헤더=넓게). 바깥 패딩이 없어야
            마지막 행 바닥이 스크롤 끝과 정확히 일치한다. */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto py-3"
          style={{ overflowAnchor: "none" }}
        >
          {rows.map((row) => {
            if (row.kind === "top") return <div key={row.key}>{topSlot}</div>;
            if (row.kind === "start")
              return <DateDivider key={row.key} label="대화의 시작" />;
            return (
              <div key={row.key}>
                {row.dateDivider && <DateDivider label={row.dateDivider} />}
                <EventLine
                  ev={row.ev}
                  contentVersion={row.contentVersion}
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
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
