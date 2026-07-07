import {
  type MatrixClient,
  type MatrixEvent,
  MatrixEventEvent,
  type Room,
  RoomEvent,
  ThreadEvent,
} from "matrix-js-sdk";
import { useEffect, useReducer, useRef, useState } from "react";
import { perfSpan } from "../lib/perf-log";
import { eventsSignature, visibleThreadEvents } from "../lib/timeline";

/** 스레드 루트 이벤트 훅 — 헤더 제목("Thread"로 박제되던 버그의 해결).
 *
 *  루트가 메인 타임라인에 로드 안 된 오래된 메시지면 mount 시점엔
 *  findEventById도 thread.rootEvent도 undefined다. SDK가 비동기로
 *  fetchRootEvent를 수행해 rootEvent를 채우지만(constructor →
 *  updateThreadMetadata), 그걸 리렌더로 연결하는 코드가 없으면 제목이
 *  fallback("Thread")으로 박제된다 — 다른 곳 갔다 와야(재마운트) 그새
 *  채워진 rootEvent가 보이던 증상의 원인.
 *
 *  ThreadEvent.Update(fetchRootEvent 완료 후 emit)와 루트 복호화 완료
 *  (E2EE 방은 fetch 직후 암호문이라 미리보기 생성 불가) 시점에 강제
 *  리렌더해 최신 루트를 다시 읽는다. */
export function useThreadRoot(
  client: MatrixClient,
  room: Room,
  rootId: string,
): MatrixEvent | undefined {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const root = room.findEventById(rootId) ?? room.getThread(rootId)?.rootEvent;
  useEffect(() => {
    // 암호화된 루트는 복호화 트리거 — 완료되면 아래 Decrypted 리스너가 리렌더
    if (root) client.decryptEventIfNeeded(root);
    // useThreadTimeline의 effect가 먼저 실행돼 thread를 생성해두므로
    // (훅 선언 순서 = effect 실행 순서) 여기선 getThread로 충분.
    const thread = room.getThread(rootId);
    const onUpdate = () => force();
    thread?.on(ThreadEvent.Update, onUpdate);
    const onDecrypted = (ev: MatrixEvent) => {
      if (ev.getId() === rootId) force();
    };
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    return () => {
      thread?.off(ThreadEvent.Update, onUpdate);
      client.off(MatrixEventEvent.Decrypted, onDecrypted);
    };
  }, [client, room, rootId, root]);
  return root;
}

/** 백필 예산 소진 스레드 기억 + 시간 예산 — room fill과 동일 처방.
 *  실측: thread:fill 10192ms pages=10 visible=0 (표시할 게 없는 스레드를
 *  향해 10페이지 풀 소진). 소진 확인한 스레드는 재진입 시 1페이지만. */
const backfillExhaustedThreads = new Set<string>();
const THREAD_FILL_BUDGET_MS = 3000;

/**
 * 스레드 타임라인 훅 — ThreadPanel에서 추출한 데이터 레이어:
 *
 * - thread 인스턴스 확보 (없으면 createThread)
 * - 초기 fetch 후 표시할 메시지가 모일 때까지 자동 백필
 *   (수정/리액션 위주 페이지로 인한 스크롤 데드락 방지)
 * - 실시간 리스너: ThreadEvent.Update/NewReply, Timeline(Reset),
 *   Decrypted / Replaced (E2EE 수정 반영)
 * - loadOlder: backwards 페이지네이션
 */
export function useThreadTimeline(
  client: MatrixClient,
  room: Room,
  rootId: string,
) {
  const [events, setEvents] = useState<MatrixEvent[]>([]);
  const [initialising, setInitialising] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const backfillingRef = useRef(false);
  const loadingOlderRef = useRef(false);
  // D3 dedup: 마지막 커밋 서명. 같으면 setEvents 스킵 → 배열 참조 보존.
  const lastSigRef = useRef<string>("\u0000init");
  // receipt는 events 내용을 안 바꾸므로 epoch을 올려 서명을 강제로 흔들어
  // 리렌더를 유발한다(읽음 아바타 갱신). 룸 훅과 동일 패턴.
  const receiptEpochRef = useRef(0);

  useEffect(() => {
    setEvents([]);
    setInitialising(true);
    setHasMore(true);
    lastSigRef.current = "\u0000init";
    const thread =
      room.getThread(rootId) ??
      room.createThread(rootId, room.findEventById(rootId), [], true);

    /** 표시 이벤트를 state에 반영 — 서명이 직전과 같으면 스킵(참조 보존).
     *  precomputed: 호출부가 이미 visibleThreadEvents를 계산했으면 재사용. */
    const commit = (precomputed?: MatrixEvent[]) => {
      const next = precomputed ?? visibleThreadEvents(client, thread.events);
      const sig = `${receiptEpochRef.current}:${eventsSignature(next)}`;
      if (sig === lastSigRef.current) return;
      lastSigRef.current = sig;
      setEvents(next);
    };

    const refreshNow = () => {
      // 주의: liveTimeline 레퍼런스를 미리 잡아두면 안 됨 —
      // SDK가 초기화 시 resetLiveTimeline()으로 갈아끼움.
      // thread.events getter는 항상 현재 타임라인을 가리킴.
      commit();
      if (thread.initialEventsFetched) {
        setInitialising(false);
        void backfillUntilVisible();
      }
    };
    // 복호화/수정 이벤트 연쇄 → 프레임당 1회 배칭 (리렌더 폭주 방지)
    let refreshScheduled = false;
    const refresh = () => {
      if (refreshScheduled) return;
      refreshScheduled = true;
      requestAnimationFrame(() => {
        refreshScheduled = false;
        refreshNow();
      });
    };

    const backfillUntilVisible = async () => {
      if (backfillingRef.current) return;
      backfillingRef.current = true;
      const endFill = perfSpan("thread:fill");
      let pages = 0;
      // 적응형 limit — 리액션 많은 스레드도 왕복 수를 로그 스케일로 제한
      // (useRoomTimeline.fillUntilVisible과 동일 패턴)
      let limit = 50;
      const exhausted = backfillExhaustedThreads.has(rootId);
      const maxPages = exhausted ? 1 : 10;
      const deadline = performance.now() + THREAD_FILL_BUDGET_MS;
      try {
        // 조건용 카운트는 paginate 결과로만 갱신 — 매 반복 전체 필터+정렬
        // (visibleThreadEvents) 재계산을 피한다. 최초 1회만 현재 상태를 센다.
        let visibleCount = visibleThreadEvents(client, thread.events).length;
        let sawEnd = false;
        for (
          let i = 0;
          i < maxPages && visibleCount < 15 && performance.now() < deadline;
          i++
        ) {
          // backward 토큰이 없으면 스레드 시작 도달
          const more = await client.paginateEventTimeline(thread.liveTimeline, {
            backwards: true,
            limit,
          });
          pages++;
          limit = Math.min(limit * 2, 320);
          // paginate 후 한 번만 필터 — 조건용 카운트와 commit이 같은 배열 공유.
          const next = visibleThreadEvents(client, thread.events);
          visibleCount = next.length;
          commit(next);
          if (!more) {
            sawEnd = true;
            setHasMore(false);
            break;
          }
        }
        if (visibleCount < 15 && !sawEnd && pages >= maxPages) {
          backfillExhaustedThreads.add(rootId);
        }
        endFill(
          `pages=${pages} visible=${visibleCount}${exhausted ? " (exhausted-skip)" : ""}`,
        );
      } catch (e) {
        console.warn("[thread backfill] 실패:", e);
      } finally {
        backfillingRef.current = false;
      }
    };

    refreshNow();

    // SDK가 초기 fetch(리셋 + 최신 답글 로드)를 스스로 수행하고
    // 끝나면 ThreadEvent.Update / RoomEvent.TimelineReset을 emit함
    const onUpdate = () => refresh();
    thread.on(ThreadEvent.Update, onUpdate);
    thread.on(ThreadEvent.NewReply, onUpdate);
    thread.on(RoomEvent.Timeline, onUpdate);
    thread.on(RoomEvent.TimelineReset, onUpdate);
    const onDecrypted = (ev: MatrixEvent) => {
      if (ev.threadRootId === rootId || ev.getId() === rootId) refresh();
    };
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    // 수정(m.replace) 적용 신호. E2EE에선 수정 이벤트 복호화가 끝난 "뒤"에
    // 비동기로 원본에 makeReplaced 되므로, 이걸 안 들으면 스트리밍 봇
    // 메시지가 중간 버전에서 박제됨. (Replaced는 "수정된 원본" 이벤트가
    // emit → threadRootId 필터 사용 가능. 수정 이벤트 자체는 threadRootId가
    // 없어 Decrypted 필터로는 못 잡음 — 실측)
    const onReplaced = (ev: MatrixEvent) => {
      if (ev.threadRootId === rootId || ev.getId() === rootId) refresh();
    };
    client.on(MatrixEventEvent.Replaced, onReplaced);
    // 스레드 read receipt (MSC3771) 도착 — 읽음 아바타 갱신.
    // receipt는 events 내용을 안 바꾸므로 epoch을 올려 dedup을 우회한다.
    const onReceipt = (_ev: MatrixEvent, r: Room) => {
      if (r.roomId === room.roomId) {
        receiptEpochRef.current++;
        refresh();
      }
    };
    client.on(RoomEvent.Receipt, onReceipt);
    return () => {
      thread.off(ThreadEvent.Update, onUpdate);
      thread.off(ThreadEvent.NewReply, onUpdate);
      thread.off(RoomEvent.Timeline, onUpdate);
      thread.off(RoomEvent.TimelineReset, onUpdate);
      client.off(MatrixEventEvent.Decrypted, onDecrypted);
      client.off(MatrixEventEvent.Replaced, onReplaced);
      client.off(RoomEvent.Receipt, onReceipt);
    };
  }, [client, room, rootId]);

  /** 과거 답글 로드. 더 가져왔으면 true (동시 호출은 무시) */
  async function loadOlder(): Promise<boolean> {
    if (loadingOlderRef.current) return false;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const thread = room.getThread(rootId);
      if (!thread) return false;
      // 호출 시점의 liveTimeline 사용 (리셋 이후의 현재 타임라인)
      const more = await client.paginateEventTimeline(thread.liveTimeline, {
        backwards: true,
        limit: 60,
      });
      setHasMore(more);
      // 과거 답글을 실제로 붙였으니 배열이 바뀐다. lastSigRef도 갱신해
      // 이후 refresh()가 stale 서명과 비교해 중복 커밋하지 않게 한다.
      const next = visibleThreadEvents(client, thread.events);
      lastSigRef.current = `${receiptEpochRef.current}:${eventsSignature(next)}`;
      setEvents(next);
      return more;
    } catch (e) {
      console.warn("[thread loadOlder] 실패:", e);
      return false;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  return { events, initialising, loadingOlder, loadOlder, hasMore };
}
