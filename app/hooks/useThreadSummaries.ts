import { type MatrixClient, type Room, ThreadEvent } from "matrix-js-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { perfSpan } from "../lib/perf-log";
import {
  fetchThreadSummaryPage,
  mergeThreadSummaries,
  type ThreadSummary,
} from "../lib/thread-list";

/** 방별 스레드 요약 캐시 — 세션 동안 유지.
 *  방을 왔다갔다 할 때마다 /threads(수백 KB)를 다시 치지 않게 한다.
 *  캐시가 있어도 라이브 갱신은 mergeThreadSummaries(SDK Thread 머지)가
 *  담당하므로 목록이 낡지 않는다. */
const summaryCache = new Map<
  string,
  { item: ThreadSummary[]; next: string | null }
>();

/** 같은 방에 대한 fetch 중복 발사 방지 (StrictMode 이중 마운트 포함). */
const inflight = new Map<string, Promise<void>>();

/**
 * 사이드바 스레드 목록 훅 — **HTTP 1건**으로 요약만 가져온다.
 *
 * 기존엔 `room.createThreadsTimelineSets()` + `room.fetchRoomThreads()`를 썼는데,
 * 그 경로는 루트마다 SDK Thread 객체를 만들면서 `/event/{root}`와
 * `/relations/{root}`를 각각 호출해 방 진입 한 번에 **61 HTTP / ~2MB**를
 * 유발했다(실측). 상세 근거는 lib/thread-list.ts 주석.
 *
 * @param active 이 방이 현재 열려 있는지. false면 아무것도 안 한다
 *               (방 100개 사이드바가 동시에 fetch를 쏘는 것 방지).
 */
export function useThreadSummaries(
  client: MatrixClient,
  room: Room,
  active: boolean,
) {
  const roomId = room.roomId;
  const [, force] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // 방이 바뀌면 이전 방의 async 결과를 무시하기 위한 세대 토큰.
  const genRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const gen = ++genRef.current;
    let cancelled = false;
    const bump = () => {
      if (!cancelled && gen === genRef.current) force((n) => n + 1);
    };

    // 1) 캐시 없으면 1페이지 fetch (방당 1회).
    if (!summaryCache.has(roomId)) {
      let job = inflight.get(roomId);
      if (!job) {
        const end = perfSpan(`threads:list ${roomId.slice(0, 12)}`);
        job = fetchThreadSummaryPage(client, room)
          .then((page) => {
            summaryCache.set(roomId, page);
            end(`count=${page.item.length}`);
          })
          .catch((e) => {
            // 실패해도 SDK가 sync로 만든 Thread는 그대로 보인다.
            // 캐시를 안 남기므로 다음 진입 때 재시도된다.
            console.warn("[threads] 목록 조회 실패:", e);
            end("failed");
          })
          .finally(() => {
            inflight.delete(roomId);
          });
        inflight.set(roomId, job);
      }
      void job.then(bump);
    }

    // 2) 라이브 갱신 — 새 스레드/답글/삭제 시 목록 재계산.
    //    (실제 병합은 렌더에서 mergeThreadSummaries가 수행)
    let scheduled = false;
    const onThread = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        bump();
      });
    };
    room.on(ThreadEvent.New, onThread);
    room.on(ThreadEvent.NewReply, onThread);
    room.on(ThreadEvent.Update, onThread);
    room.on(ThreadEvent.Delete, onThread);
    return () => {
      cancelled = true;
      room.off(ThreadEvent.New, onThread);
      room.off(ThreadEvent.NewReply, onThread);
      room.off(ThreadEvent.Update, onThread);
      room.off(ThreadEvent.Delete, onThread);
    };
  }, [client, room, roomId, active]);

  const cached = summaryCache.get(roomId);
  // active가 아닌 방도 SDK가 sync로 만들어둔 Thread는 보여준다(기존 동작 유지).
  const thread = mergeThreadSummaries(room, cached?.item ?? []);
  const hasMore = !!cached?.next;

  const loadMore = useCallback(async () => {
    const entry = summaryCache.get(roomId);
    if (!entry?.next || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchThreadSummaryPage(client, room, entry.next);
      const seen = new Set(entry.item.map((s) => s.id));
      summaryCache.set(roomId, {
        item: [...entry.item, ...page.item.filter((s) => !seen.has(s.id))],
        next: page.next,
      });
      force((n) => n + 1);
    } catch (e) {
      console.warn("[threads] 다음 페이지 조회 실패:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [client, room, roomId, loadingMore]);

  return { thread, hasMore, loadingMore, loadMore };
}
