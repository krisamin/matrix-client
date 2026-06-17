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
import { Virtualizer, type VirtualizerHandle } from "virtua";
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

/** 위로 이 오프셋(px) 안으로 올라오면 과거 로드 (여유 있게 미리) */
const LOAD_TRIGGER_PX = 400;

/** 타임라인 스크롤 영역 — 룸/스레드 100% 동일.
 *
 *  스크롤 위치 보존은 virtua가 전담한다(검증된 reverse-infinite-scroll):
 *   - prepend(과거 로드): 로드 직전 isPrependRef=true → Virtualizer shift prop이
 *     true가 되어 "끝 기준"으로 위치를 유지한다. 직접 scrollHeight/anchor를
 *     계산하던 로직은 전부 제거(엣지케이스에서 계속 어긋났음 — react-virtual은
 *     애초에 reverse scroll 미지원).
 *   - append(새 메시지): 직전 바닥 근처(shouldStickToBottom)였으면
 *     scrollToIndex(last, {align:"end"})로 바닥 추적.
 *   - 초기 진입: 맨 아래로.
 *
 *  바닥 정렬용 spacer(flexGrow:1) — 메시지가 뷰포트보다 적을 때 아래로 붙인다. */
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
    const vRef = useRef<VirtualizerHandle>(null);
    // prepend(과거 로드)가 진행 중인지 — true면 virtua가 끝 기준으로 위치 유지.
    // 매 렌더 후 useLayoutEffect에서 false로 리셋(공식 Chat 예제 패턴).
    const isPrependRef = useRef(false);
    // 직전에 바닥 근처였는지 — append 시 바닥 추적 판단의 소스.
    const stickToBottomRef = useRef(true);
    // 초기 바닥 정렬: scheduled(중복 스케줄 방지) / done(onScroll 허용 시점).
    // rAF로 정렬이 끝난 뒤 done=true → 측정 전 onScroll의 loadOlder 폭주 차단.
    const initialScheduledRef = useRef(false);
    const initialDoneRef = useRef(false);
    // append 추적용: 직전 마지막 행 key (끝이 바뀌었는지 판단).
    const prevLastKeyRef = useRef<string | null>(null);

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

    const lastKey = rows.length > 0 ? rows[rows.length - 1].key : null;

    // prepend 플래그는 렌더 반영 직후 해제 (공식 패턴). shift는 이번 렌더에만 적용.
    useLayoutEffect(() => {
      isPrependRef.current = false;
    });

    // 방이 바뀌면 상태 리셋
    // biome-ignore lint/correctness/useExhaustiveDependencies: room.roomId 변화로 리셋
    useEffect(() => {
      initialScheduledRef.current = false;
      initialDoneRef.current = false;
      isPrependRef.current = false;
      stickToBottomRef.current = true;
      prevLastKeyRef.current = null;
    }, [room.roomId]);

    // 행 변화 후 스크롤 처리: 초기 진입(맨 아래) / append 바닥 추적.
    // prepend는 virtua shift가 알아서 하므로 여기서 건드리지 않는다.
    useEffect(() => {
      const handle = vRef.current;
      if (!handle || rows.length === 0) return;
      const lastIdx = rows.length - 1;
      const endChanged = lastKey !== prevLastKeyRef.current;
      prevLastKeyRef.current = lastKey;

      if (!initialScheduledRef.current) {
        // 초기 진입: rAF로 미뤄 측정 완료 후 맨 아래로(측정 전 호출은 부정확).
        // done은 rAF 안에서 세팅 → 그 전 onScroll의 loadOlder 폭주를 막는다.
        initialScheduledRef.current = true;
        requestAnimationFrame(() => {
          vRef.current?.scrollToIndex(lastIdx, { align: "end" });
          initialDoneRef.current = true;
        });
      } else if (
        !isPrependRef.current &&
        endChanged &&
        stickToBottomRef.current
      ) {
        // append(끝 바뀜) + 바닥 근처였으면 바닥 추적
        handle.scrollToIndex(lastIdx, { align: "end" });
      }
    }, [rows.length, lastKey]);

    // 부모(jumpTo)용: 인덱스 기반 스크롤 (가상화라 DOM에 없을 수 있어 인덱스로).
    useImperativeHandle(
      ref,
      () => ({
        scrollToEvent: (eventId: string) => {
          const idx = rows.findIndex(
            (r) => r.kind === "event" && r.ev.getId() === eventId,
          );
          if (idx < 0) return false;
          vRef.current?.scrollToIndex(idx, { align: "center" });
          return true;
        },
      }),
      [rows],
    );

    const onScroll = useCallback(
      (offset: number) => {
        const handle = vRef.current;
        if (!handle) return;
        // 초기 측정 전(viewportSize=0)이거나 초기 정렬 완료 전이면 트리거 금지 —
        // 측정 전 onScroll(offset≈0)이 loadOlder를 연쇄 발화하는 폭주 차단.
        if (handle.viewportSize === 0 || !initialDoneRef.current) return;
        // 바닥 근처 여부 추적 (append 추적 판단의 소스). 공식 Chat 예제 공식.
        stickToBottomRef.current =
          offset - handle.scrollSize + handle.viewportSize >= -1.5;
        // 위로 충분히 올라오면 과거 로드. prepend 플래그를 켜면 다음 렌더의
        // shift가 위치를 보존한다 → 직접 보정 불필요.
        if (offset < LOAD_TRIGGER_PX && !loadingOlder && hasMore) {
          isPrependRef.current = true;
          void loadOlder();
        }
      },
      [loadingOlder, hasMore, loadOlder],
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
        {/* 스크롤 컨테이너 — flex column + overflowAnchor:none(브라우저 기본
            스크롤 앵커링이 virtua의 앵커링과 충돌하지 않게). 행 간격은 전부
            EventLine 내부가 책임진다(헤더=넓게, 같은 유저 연속=좁게). */}
        <div
          ref={scrollRef}
          className="flex flex-1 flex-col overflow-y-auto py-3"
          style={{ overflowAnchor: "none" }}
        >
          {/* spacer: 메시지가 뷰포트보다 적을 때 아래로 정렬 */}
          <div style={{ flexGrow: 1 }} />
          <Virtualizer
            ref={vRef}
            scrollRef={scrollRef}
            shift={isPrependRef.current}
            onScroll={onScroll}
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
          </Virtualizer>
        </div>
      </div>
    );
  },
);
