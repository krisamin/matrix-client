import { ChevronDown } from "lucide-react";
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtualizer, type VirtualizerHandle } from "virtua";
import { groupTimeline } from "../lib/group";
import { useT } from "../lib/i18n";
import { useTypingMembers } from "../lib/typing";
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
  | { kind: "typing"; key: string; names: string[] }
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

/** 위로 이 오프셋(px) 안으로 올라오면 과거 로드 (여유 있게 미리).
 *  넉넉히(1.5화면) 잡아 fling으로 top 벽에 닿기 전에 미리 로드 시작 →
 *  trigger 멈칫(로드 끝날 때까지 top=0에 박혀있던 부자연스러움)을 없앤다. */
const LOAD_TRIGGER_PX = 1500;

/** 타임라인 스크롤 영역 — 룸/스레드 100% 동일.
 *
 *  스크롤 위치 보존은 virtua가 전담한다(검증된 reverse-infinite-scroll):
 *   - prepend(과거 로드): 렌더 중 key 변화로 감지(첫 key 변경 + 마지막 key 유지
 *     + 길이 증가) → 그 렌더에만 Virtualizer shift=true → "끝 기준"으로 위치 유지.
 *     flag(ref) 방식은 async loadOlder + 중간 loadingOlder 렌더에서 리셋돼 shift가
 *     누락→로드 높이만큼 위치가 어긋났음. 직접 scrollHeight/anchor 계산도 전부 제거
 *     (엣지케이스에서 계속 어긋남 — react-virtual은 애초에 reverse scroll 미지원).
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
    const t = useT();
    const scrollRef = useRef<HTMLDivElement>(null);
    const vRef = useRef<VirtualizerHandle>(null);
    // 직전에 바닥 근처였는지 — append 시 바닥 추적 판단의 소스.
    const stickToBottomRef = useRef(true);
    // 바닥 도달 여부(렌더 트리거용 state). stickToBottomRef는 ref라
    // 리렌더를 안 일으켜 "새 메시지 ↓" 버튼 표시 토글에 못 쓴다 → state로 미러.
    const [atBottom, setAtBottom] = useState(true);
    // 초기 바닥 정렬: scheduled(중복 스케줄 방지) / done(onScroll 허용 시점).
    // rAF로 정렬이 끝난 뒤 done=true → 측정 전 onScroll의 loadOlder 폭주 차단.
    const initialScheduledRef = useRef(false);
    const initialDoneRef = useRef(false);
    // append 추적용: 직전 마지막 행 key (끝이 바뀌었는지 판단).
    const prevLastKeyRef = useRef<string | null>(null);
    // 직전 displayRows 길이 — typing 행 등장/소멸 감지(바닥추적 트리거).
    const prevDisplayLenRef = useRef(0);
    // 프로그램적 바닥 스크롤 중 플래그 — 바닥으로 미는 과정의 onScroll이
    // stick=false로 오판해 바닥 추적이 영구 차단되는 걸 막는다.
    const programmaticRef = useRef(false);
    // prepend 감지를 데이터로 한다 — flag(ref) 방식은 async loadOlder + 중간
    // loadingOlder 렌더를 못 버티고 useLayoutEffect 리셋에 죽어서 shift가 누락,
    // 로드된 높이만큼 위치가 어긋났다(과거 로드 시 그만큼 더 스크롤되던 버그).
    // 대신 "첫 key가 바뀌고 마지막 key는 그대로 + 길이 증가"면 이번 렌더가
    // prepend라고 렌더 중에 판정 → shift를 정확한 그 렌더에만 켠다.
    const prevFirstKeyRef = useRef<string | null>(null);
    const prevLenRef = useRef(0);

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

    // 상대 타이핑 표시. 판정(prepend/append)은 events 기준 rows로만 하고,
    // typing 행은 렌더용 displayRows에만 덧붙인다 → typing 등장/소멸이
    // append/prepend 감지를 절대 흔들지 않는다(lastKey/firstKey 불변).
    // typing 행 자체의 바닥추적은 아래 ResizeObserver(contentGrew)가 처리.
    const typingNames = useTypingMembers(client, room);
    const displayRows = useMemo<Row[]>(() => {
      if (typingNames.length === 0) return rows;
      return [
        ...rows,
        { kind: "typing", key: "__typing__", names: typingNames },
      ];
    }, [rows, typingNames]);

    const firstKey = rows.length > 0 ? rows[0].key : null;
    const lastKey = rows.length > 0 ? rows[rows.length - 1].key : null;

    // 렌더 중 prepend 판정: 첫 key가 바뀌고 + 마지막 key는 그대로 + 길이 증가.
    // (refs는 아래 useLayoutEffect에서 이번 렌더 값으로 갱신)
    const isPrepend =
      rows.length > prevLenRef.current &&
      firstKey !== prevFirstKeyRef.current &&
      lastKey === prevLastKeyRef.current;

    // 렌더 반영 후 prepend 비교 기준 갱신. (lastKey는 append 추적 effect에서
    // 별도로 갱신하므로 여기선 first/len만.)
    useLayoutEffect(() => {
      prevFirstKeyRef.current = firstKey;
      prevLenRef.current = rows.length;
    });

    // 방이 바뀌면 상태 리셋
    // biome-ignore lint/correctness/useExhaustiveDependencies: room.roomId 변화로 리셋
    useEffect(() => {
      initialScheduledRef.current = false;
      initialDoneRef.current = false;
      stickToBottomRef.current = true;
      setAtBottom(true);
      prevLastKeyRef.current = null;
      prevDisplayLenRef.current = 0;
      prevFirstKeyRef.current = null;
      prevLenRef.current = 0;
    }, [room.roomId]);

    // 행 변화 후 스크롤 처리: 초기 진입(맨 아래) / append 바닥 추적.
    // prepend는 virtua shift가 알아서 하므로 여기서 건드리지 않는다.
    useEffect(() => {
      const handle = vRef.current;
      if (!handle || rows.length === 0) return;
      // 스크롤 타겟은 실제 렌더 리스트(displayRows)의 마지막 — typing 행이
      // 있으면 그 행까지 보이게. 트리거 판정(endChanged/isPrepend)은 events
      // 기준 rows로만 한다(typing이 append 판정을 흔들지 않게).
      const lastIdx = displayRows.length - 1;
      const endChanged = lastKey !== prevLastKeyRef.current;
      const displayLenChanged =
        displayRows.length !== prevDisplayLenRef.current;
      prevLastKeyRef.current = lastKey;
      prevDisplayLenRef.current = displayRows.length;

      if (!initialScheduledRef.current) {
        // 초기 진입: rAF로 미뤄 측정 완료 후 맨 아래로(측정 전 호출은 부정확).
        // done은 rAF 안에서 세팅 → 그 전 onScroll의 loadOlder 폭주를 막는다.
        initialScheduledRef.current = true;
        requestAnimationFrame(() => {
          vRef.current?.scrollToIndex(lastIdx, { align: "end" });
          initialDoneRef.current = true;
        });
      } else if (
        !isPrepend &&
        (endChanged || displayLenChanged) &&
        stickToBottomRef.current
      ) {
        // append(events 끝 바뀜) 또는 typing 행 등장/소멸(displayLenChanged) +
        // 바닥 근처였으면 바닥 추적. typing 행은 RO(contentGrew)만으론 virtua
        // 측정 타이밍상 끝까지 안 닿아(실측 24px 부족) → 여기서 직접 처리.
        handle.scrollToIndex(lastIdx, { align: "end" });
      }
    }, [rows.length, lastKey, isPrepend, displayRows.length]);

    // 높이 변화 추적 — React 신호로는 못 잡는 두 경우를 ResizeObserver로 커버.
    //  (A) 콘텐츠(virtua 루트)가 커짐: 반응/이미지로드/링크프리뷰/수정 등. 반응은
    //      ReactionBar가 자기만 force 리렌더해 rows/lastKey 불변 → 위 effect 미발화.
    //  (B) 뷰포트(스크롤 컨테이너)가 줄어듦: 입력창이 여러 줄로 커지면 타임라인
    //      높이가 줄어 마지막 메시지가 입력창 뒤로 밀린다 → 다시 바닥으로.
    // 둘 다 "직전에 바닥 근처였을 때만" 바닥 추적 → 위로 스크롤 중엔 영향 없다.
    useEffect(() => {
      const container = scrollRef.current;
      // virtua 루트 = 스크롤 컨테이너의 마지막 자식(spacer 다음).
      const content = container?.lastElementChild;
      if (!container || !content) return;
      let prevContentH = content.getBoundingClientRect().height;
      let prevViewportH = container.getBoundingClientRect().height;
      const stickIfNeeded = () => {
        if (
          initialDoneRef.current &&
          stickToBottomRef.current &&
          rows.length > 0
        ) {
          // virtua scrollToIndex(last,"end")는 뷰포트 축소 직후 정확히 바닥에
          // 안 닿고, rAF로 미루면 virtua가 자기 위치로 되돌려 안 먹는다(실측).
          // RO 콜백에서 즉시 DOM 스크롤을 바닥으로 밀고, 그 과정의 onScroll이
          // stick을 오판하지 않게 programmaticRef로 가드한다.
          const el = scrollRef.current;
          if (el) {
            programmaticRef.current = true;
            el.scrollTop = el.scrollHeight;
            requestAnimationFrame(() => {
              programmaticRef.current = false;
            });
          }
        }
      };
      const ro = new ResizeObserver(() => {
        const contentH = content.getBoundingClientRect().height;
        const viewportH = container.getBoundingClientRect().height;
        // 콘텐츠가 커졌거나(A) 뷰포트 높이가 바뀌면(B) 바닥 재정렬.
        //  - 뷰포트 줄어듦: 입력창이 여러 줄로 커져 마지막 메시지가 가려질 때.
        //  - 뷰포트 커짐: 전송 후 입력창이 한 줄로 줄며 아래 공간이 생길 때.
        //    이때 overflowAnchor:none + virtua라 브라우저 자동 바닥고정이 안 먹어
        //    마지막 메시지가 바닥에서 뜬다(전송했는데 안 내려가던 증상의 원인).
        const contentGrew = contentH > prevContentH + 0.5;
        const viewportChanged = Math.abs(viewportH - prevViewportH) > 0.5;
        prevContentH = contentH;
        prevViewportH = viewportH;
        if (contentGrew || viewportChanged) stickIfNeeded();
      });
      ro.observe(content);
      ro.observe(container);
      return () => ro.disconnect();
      // rows.length가 바뀌면 기준 높이를 새로 잡아야 정확 — 재구독으로 초기화.
    }, [rows.length]);

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
        // 프로그램적 바닥 스크롤(stickIfNeeded) 중엔 stick 재계산 금지 — 바닥으로
        // 미는 과정의 onScroll이 stick=false로 오판하면 추적이 영구 차단된다.
        if (programmaticRef.current) return;
        // 바닥 근처 여부는 실제 DOM(scrollRef) 기준으로 판정한다.
        // virtua가 넘기는 scrollSize/viewportSize는 리사이즈 직후 stale이라,
        // 전송 시 입력창이 줄어 뷰포트가 커지는 순간 offset만 먼저 줄고
        // viewportSize 갱신은 늦어 공식(offset-scrollSize+viewportSize)이
        // "바닥 아님"으로 오판→stick이 죽고, 한 번 죽으면 RO 재정렬이 영영
        // skip돼 전송해도 안 내려갔다(라인 한 번 바뀌면 안 되던 증상의 진짜 원인).
        // DOM은 stale될 일이 없어 항상 정확하다.
        const el = scrollRef.current;
        if (el) {
          const domDist = el.scrollHeight - el.scrollTop - el.clientHeight;
          const stick = domDist <= 2;
          stickToBottomRef.current = stick;
          // 버튼 표시 state는 값이 바뀔 때만 갱신(불필요 리렌더 방지).
          setAtBottom((prev) => (prev !== stick ? stick : prev));
        }
        // 위로 충분히 올라오면 과거 로드. prepend는 다음 렌더에서 key 변화로
        // 감지돼 shift가 자동으로 켜진다(flag 불필요 — async를 못 버텼음).
        if (offset < LOAD_TRIGGER_PX && !loadingOlder && hasMore) {
          void loadOlder();
        }
      },
      [loadingOlder, hasMore, loadOlder],
    );

    // "맨 아래로" 버튼: 마지막 행으로 스크롤 + stick 복구.
    const scrollToBottom = useCallback(() => {
      const lastIdx = displayRows.length - 1;
      if (lastIdx < 0) return;
      stickToBottomRef.current = true;
      setAtBottom(true);
      vRef.current?.scrollToIndex(lastIdx, { align: "end" });
    }, [displayRows.length]);

    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* 로딩 인디케이터: 오버레이 — 리스트 레이아웃을 밀지 않음 */}
        {loadingOlder && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
            <span className="rounded-full border border-line bg-bg-2 px-3 py-1 font-mono text-[11px] text-fg-2 shadow-lg">
              {t("timeline.loading")}
            </span>
          </div>
        )}
        {/* 스크롤 컨테이너 — flex column + overflowAnchor:none(브라우저 기본
            스크롤 앵커링이 virtua의 앵커링과 충돌하지 않게). 행 간격은 전부
            EventLine 내부가 책임진다(헤더=넓게, 같은 유저 연속=좁게). */}
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto py-3"
          style={{ overflowAnchor: "none" }}
        >
          {/* spacer: 메시지가 뷰포트보다 적을 때 아래로 정렬 */}
          <div style={{ flexGrow: 1 }} />
          <Virtualizer
            ref={vRef}
            scrollRef={scrollRef}
            shift={isPrepend}
            onScroll={onScroll}
          >
            {displayRows.map((row) => {
              if (row.kind === "top") return <div key={row.key}>{topSlot}</div>;
              if (row.kind === "start")
                return (
                  <DateDivider key={row.key} label={t("timeline.start")} />
                );
              if (row.kind === "typing")
                return (
                  <div
                    key={row.key}
                    className="msg-in flex items-center gap-1.5 px-5 py-0.5 text-[12px] text-fg-2"
                  >
                    <span className="flex gap-0.5">
                      <span className="typing-dot h-1 w-1 rounded-full bg-fg-2" />
                      <span className="typing-dot h-1 w-1 rounded-full bg-fg-2" />
                      <span className="typing-dot h-1 w-1 rounded-full bg-fg-2" />
                    </span>
                    {t("timeline.typing", { names: row.names.join(", ") })}
                  </div>
                );
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
        {/* "맨 아래로" 버튼 — 바닥에서 벗어났을 때만. 입력창 바로 위 우측. */}
        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            title={t("timeline.scrollDown")}
            aria-label={t("timeline.scrollDown")}
            className="absolute right-5 bottom-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-bg-2 text-fg-1 shadow-xl transition-colors hover:bg-bg-3 hover:text-fg-0"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        )}
      </div>
    );
  },
);
