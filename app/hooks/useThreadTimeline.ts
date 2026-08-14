import {
  EventTimeline,
  type MatrixClient,
  type MatrixEvent,
  MatrixEventEvent,
  type Room,
  RoomEvent,
  ThreadEvent,
} from "matrix-js-sdk";
import { useEffect, useReducer, useRef, useState } from "react";
import {
  clearFillExhausted,
  isFillExhausted,
  markFillExhausted,
} from "../lib/fill-memo";
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
    // (삭제된 루트는 스킵 — ciphertext prune으로 복호화 대상 자체가 없음)
    if (root && !root.isRedacted()) client.decryptEventIfNeeded(root);
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
 *  향해 10페이지 풀 소진). 소진 확인한 스레드는 재진입 시 1페이지만.
 *  ★lib/fill-memo로 localStorage 영속 — 모듈 메모리였을 땐 PWA 콜드 스타트마다
 *  메모가 비어 같은 낭비를 반복했다. */
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

    // initialising 해제 1회 가드 — 정상 경로(refreshNow)로 해제되면 워치독
    // 타이머를 취소해 중복 발화를 막는다.
    //
    // ★백필은 SDK 초기 fetch 완료(initialEventsFetched) 후에만 건다.
    //   초기 fetch 전에 paginate를 걸면 SDK updateThreadMetadata의
    //   resetLiveTimeline()과 경합한다: 우리 요청이 리셋 "직후"에 도착하면
    //   이벤트들이 고아가 된 옛 타임라인에 붙고 이벤트 맵이 그쪽을 가리켜,
    //   SDK의 초기 fetch는 전부 중복 판정("already in a different timeline")
    //   → live 타임라인이 빈 채로 initialEventsFetched=true가 박제된다.
    //   결과: 스레드 내용이 영영 안 보임 + 이후 백필도 전부 중복 스킵.
    //   (실측 재현: events=0, backToken=null, 동일 relations 요청 10연발)
    let initialResolved = false;
    // ★★초기 백필 1회 가드 — 예전엔 resolveInitial()이 sync 틱마다 재실행되며
    //   (refresh → refreshNow → resolveInitial) backfillUntilVisible()을 매번
    //   다시 킥했다. 스레드가 "고아 타임라인" 상태(위 주석의 레이스 후유증)에
    //   빠지면 매 킥이 새 이벤트 0개짜리 동일 /relations 페이지(수백 KB)를
    //   영원히 재다운로드 → 서버 로그에 같은 relations 요청 폭주 + 메인 스레드가
    //   틱마다 JSON 파싱/중복검사로 점유돼 앱 전체 로딩이 버벅였다(실측 2026-07-28:
    //   동일 요청 100회/시간, 매번 519,248B 동일 바이트). 초기 채움은 1회만.
    let initialBackfilled = false;
    // 고아 타임라인 자가복구 1회 가드 (backfillUntilVisible 안에서 사용).
    let orphanRecovered = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const resolveInitial = () => {
      if (!initialResolved) {
        initialResolved = true;
        clearTimeout(watchdog);
        setInitialising(false);
      }
      if (thread.initialEventsFetched && !initialBackfilled) {
        initialBackfilled = true;
        void backfillUntilVisible();
      }
    };

    const refreshNow = () => {
      // 주의: liveTimeline 레퍼런스를 미리 잡아두면 안 됨 —
      // SDK가 초기화 시 resetLiveTimeline()으로 갈아끼움.
      // thread.events getter는 항상 현재 타임라인을 가리킴.
      commit();
      // initialising 해제 조건 완화:
      //  - 기존엔 thread.initialEventsFetched만 봤는데, 오래된 스레드는 루트가
      //    메인 타임라인에 없어 SDK가 fetchRootEvent를 먼저 돈다. 이 과정에서
      //    updateThreadMetadata의 processRootEventPromise가 지연/실패로 굳으면
      //    initialEventsFetched가 영영 true가 안 돼 LoadingPane이 무한히 돈다.
      //  - 이미 표시할 이벤트가 하나라도 잡혔으면 초기 fetch 완료를 기다리지
      //    말고 즉시 해제 → 최신 답글부터 보여주고 나머지는 백필로 채운다.
      if (thread.initialEventsFetched || thread.events.length > 0) {
        resolveInitial();
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
      const exhausted = isFillExhausted(rootId);
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
          // ★진행 없음 브레이커 재료 — paginate 전 back 토큰/원시 이벤트 수.
          //   고아 타임라인 상태(레이스 후유증)에선 서버가 매번 같은 첫 페이지를
          //   주고(from 토큰이 영영 null) 이벤트는 전부 중복 판정이라 한 개도 안
          //   붙는다: 토큰 제자리 + 개수 제자리 = 진행 0. 계속 돌면 수백 KB짜리
          //   동일 응답만 영원히 재다운로드하므로 즉시 중단한다.
          const tokenBefore = thread.liveTimeline.getPaginationToken(
            EventTimeline.BACKWARDS,
          );
          const rawCountBefore = thread.events.length;
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
          if (
            thread.liveTimeline.getPaginationToken(EventTimeline.BACKWARDS) ===
              tokenBefore &&
            thread.events.length === rawCountBefore
          ) {
            // 고아 타임라인 시그니처(진행 0 + 라이브가 텅 빔)면 1회 자가복구:
            // thread.resetLiveTimeline()(토큰 없이 → HTTP 없음)이 timelineSet의
            // _eventIdToTimeline 맵을 비우고 새 라이브 타임라인을 만들어,
            // "모든 이벤트가 고아 타임라인을 가리켜 전부 중복 판정"되던 오염을
            // 푼다. 다음 반복의 paginate가 같은 페이지를 새 타임라인에 정상 삽입.
            if (!orphanRecovered && thread.events.length === 0) {
              orphanRecovered = true;
              console.warn(
                `[thread backfill] 고아 타임라인 감지 → 라이브 타임라인 리셋 후 재시도: root=${rootId}`,
              );
              await thread.resetLiveTimeline();
              continue;
            }
            console.warn(
              `[thread backfill] 진행 없음 중단: root=${rootId} page=${pages}`,
            );
            markFillExhausted(rootId);
            break;
          }
        }
        if (visibleCount < 15 && !sawEnd && pages >= maxPages) {
          markFillExhausted(rootId);
        } else if (visibleCount >= 15 && exhausted) {
          // 이번엔 채워짐 = 스레드가 활성화됨 → 메모 해제(정상 예산 복귀).
          clearFillExhausted(rootId);
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

    // ★ 오래된 스레드 무한로딩 방어 — 워치독 (최후수단)
    //
    // SDK updateThreadMetadata의 processRootEventPromise가 pending에 굳으면
    // initialEventsFetched가 영영 false로 남아 LoadingPane이 무한히 돈다.
    // 일정 시간 뒤에도 initialising이 안 풀렸으면 강제로 해제한다.
    //
    // ※ "4초 = SDK가 굳었다"는 가정은 폐기 — 답글 수백 개짜리 큰 스레드는
    //   초기 fetch가 4초를 그냥 넘기기도 한다(굳은 게 아니라 느린 것).
    //   그때 직접 paginate를 킥하면 진행 중인 초기 fetch의
    //   resetLiveTimeline()과 레이스 → 고아 타임라인 재발.
    //   → liveTimeline.paginationRequests로 in-flight 여부를 실제 확인:
    //     - 요청이 살아있으면(느린 케이스) 그 완료만 기다렸다가 정상 경로로.
    //     - 없으면(진짜 굳은 케이스) 그때만 직접 백필. 이 시점엔 SDK가 초기
    //       fetch를 시작조차 못 한 상태라 리셋과 경합할 대상이 없고, 만에
    //       하나 오염돼도 backfillUntilVisible의 고아 복구가 자가치유한다.
    if (!initialResolved) {
      watchdog = setTimeout(() => {
        commit();
        if (!initialResolved) {
          initialResolved = true;
          setInitialising(false);
        }
        if (!thread.initialEventsFetched) {
          const pending =
            thread.liveTimeline.paginationRequests[EventTimeline.BACKWARDS];
          if (pending) {
            void pending.then(() => refreshNow()).catch(() => {});
          } else if (!initialBackfilled) {
            initialBackfilled = true;
            void backfillUntilVisible();
          }
        }
      }, 4000);
    }

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
      clearTimeout(watchdog);
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
      // ★진행 없음 브레이커 — backfillUntilVisible과 동일 처방. 고아 타임라인
      //   상태에선 more=true가 영원히 유지되는데, Timeline의 상단 자동 트리거
      //   (LOAD_TRIGGER_PX)가 hasMore=true를 보고 loadOlder를 계속 재호출해
      //   같은 페이지 재다운로드 루프가 된다. 토큰/개수 제자리면 hasMore를
      //   내려 트리거를 멈춘다.
      const tokenBefore = thread.liveTimeline.getPaginationToken(
        EventTimeline.BACKWARDS,
      );
      const rawCountBefore = thread.events.length;
      // 호출 시점의 liveTimeline 사용 (리셋 이후의 현재 타임라인)
      const more = await client.paginateEventTimeline(thread.liveTimeline, {
        backwards: true,
        limit: 60,
      });
      const noProgress =
        more &&
        thread.liveTimeline.getPaginationToken(EventTimeline.BACKWARDS) ===
          tokenBefore &&
        thread.events.length === rawCountBefore;
      if (noProgress) {
        console.warn(`[thread loadOlder] 진행 없음 → hasMore 해제: ${rootId}`);
      }
      setHasMore(more && !noProgress);
      // 과거 답글을 실제로 붙였으니 배열이 바뀐다. lastSigRef도 갱신해
      // 이후 refresh()가 stale 서명과 비교해 중복 커밋하지 않게 한다.
      const next = visibleThreadEvents(client, thread.events);
      lastSigRef.current = `${receiptEpochRef.current}:${eventsSignature(next)}`;
      setEvents(next);
      return more && !noProgress;
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
