import {
  type MatrixClient,
  type MatrixEvent,
  MatrixEventEvent,
  type Room,
  RoomEvent,
  ThreadEvent,
} from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import { visibleThreadEvents } from "../lib/timeline";

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

  useEffect(() => {
    setEvents([]);
    setInitialising(true);
    setHasMore(true);
    const thread =
      room.getThread(rootId) ??
      room.createThread(rootId, room.findEventById(rootId), [], true);

    const refreshNow = () => {
      // 주의: liveTimeline 레퍼런스를 미리 잡아두면 안 됨 —
      // SDK가 초기화 시 resetLiveTimeline()으로 갈아끼움.
      // thread.events getter는 항상 현재 타임라인을 가리킴.
      setEvents(visibleThreadEvents(client, thread.events));
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
      try {
        for (
          let i = 0;
          i < 10 && visibleThreadEvents(client, thread.events).length < 15;
          i++
        ) {
          // backward 토큰이 없으면 스레드 시작 도달
          const more = await client.paginateEventTimeline(thread.liveTimeline, {
            backwards: true,
            limit: 50,
          });
          setEvents(visibleThreadEvents(client, thread.events));
          if (!more) {
            setHasMore(false);
            break;
          }
        }
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
    // 스레드 read receipt (MSC3771) 도착 — 읽음 아바타 갱신
    const onReceipt = (_ev: MatrixEvent, r: Room) => {
      if (r.roomId === room.roomId) refresh();
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
        limit: 50,
      });
      setHasMore(more);
      setEvents(visibleThreadEvents(client, thread.events));
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
