import {
  Direction,
  type MatrixClient,
  MatrixEvent,
  RelationType,
  type Room,
  ThreadFilterType,
} from "matrix-js-sdk";
import { quotePreview } from "./reply";

/**
 * 사이드바 스레드 목록용 **경량** 요약.
 *
 * ★왜 SDK `room.fetchRoomThreads()`를 안 쓰는가 (2026-08 실측):
 *   fetchRoomThreads → processThreadRoots → `room.createThread()`를 루트마다
 *   호출한다. `new Thread()` 생성자는 `updateThreadMetadata()`를 즉시 돌리고,
 *   그 안의 `updateThreadFromRootEvent()`는 **rootEvent를 이미 갖고 있어도**
 *   `fetchRootEvent()`(GET /event/{id})를 무조건 호출하며, 이어서
 *   `paginateEventTimeline`(GET /relations/{id}?recurse=true)까지 돈다.
 *   → 방 하나 열 때 루트 30개면 **HTTP 61건 / ~2.0MB**.
 *   실측(krisam.in, DM 방 1개):
 *     /threads limit=30 ............   332,541 B  (1건)
 *     /event/{root} × 30 ...........   334,283 B  (30건)
 *     /relations/{root} × 30 .......  1,290,550 B (30건)
 *     ------------------------------------------------
 *     합계 .........................  1,957,374 B / 61건
 *   모바일에선 이 응답들의 JSON 파싱 + 이벤트 매핑 + E2EE 복호화가 메인
 *   스레드를 수 초 점유해 "메시지가 아무것도 안 뜨는" 상태가 된다.
 *
 * 여기서는 `/threads` **한 번**만 치고 렌더에 필요한 값(제목/정렬 ts/답글 수)만
 * 뽑는다. Thread 객체는 사용자가 실제로 스레드를 **열 때** useThreadTimeline이
 * 하나만 만든다. 라이브로 답글이 오는 스레드는 sync가 알아서 Thread를 만들고,
 * mergeThreadSummaries()가 그것들을 요약 목록에 얹어 최신 상태를 유지한다.
 */
export interface ThreadSummary {
  /** 스레드 루트 event id */
  id: string;
  /** 정렬 키 — 서버가 준 latest_event.origin_server_ts (없으면 루트 ts) */
  ts: number;
  /** 답글 수 (bundled relation의 count) */
  count: number;
  /** 사이드바에 표시할 한 줄 제목 (E2EE면 복호화 후 생성) */
  preview: string;
}

/** `/threads` 응답 chunk 원소 중 우리가 읽는 필드만. */
interface ThreadRootRaw {
  event_id?: string;
  origin_server_ts?: number;
  room_id?: string;
}

/** rootId → 복호화까지 끝낸 미리보기 텍스트. 방 재진입 시 재계산 방지.
 *  (복호화는 CPU 비용이 있고 결과는 불변) */
const previewCache = new Map<string, string>();

/** previewCache 무한 성장 방지 — 장기 세션에서 스레드가 계속 쌓이는 것 차단.
 *  LRU까진 과하고, 상한 넘으면 통째로 비운다(다음 조회 시 재계산). */
const PREVIEW_CACHE_MAX = 2000;

const setPreviewCache = (id: string, preview: string): void => {
  if (previewCache.size >= PREVIEW_CACHE_MAX) previewCache.clear();
  previewCache.set(id, preview);
};

/** 루트 이벤트 하나의 미리보기 생성. 암호화돼 있으면 복호화까지 기다린다.
 *  HTTP는 치지 않는다 — 이미 받은 raw JSON + 로컬 crypto만 사용. */
const buildPreview = async (
  client: MatrixClient,
  room: Room,
  raw: ThreadRootRaw,
): Promise<string> => {
  const id = raw.event_id ?? "";
  const cached = previewCache.get(id);
  if (cached !== undefined) return cached;
  // 이미 방 타임라인에 로드된 이벤트면 그 인스턴스를 재사용(복호화 상태 공유).
  // 없으면 raw로 임시 MatrixEvent를 만든다 — 타임라인에 넣지 않으므로
  // Thread 생성/HTTP 없이 렌더용 텍스트만 뽑는 용도.
  const ev =
    room.findEventById(id) ??
    new MatrixEvent(raw as ConstructorParameters<typeof MatrixEvent>[0]);
  if (ev.isEncrypted() && !ev.isRedacted()) {
    try {
      await client.decryptEventIfNeeded(ev);
    } catch {
      /* 세션키 없음 등 — 아래에서 빈 미리보기로 폴백 */
    }
  }
  let preview = "";
  try {
    preview = quotePreview(ev).trim();
  } catch {
    preview = "";
  }
  // 빈 값은 캐시하지 않는다 — 세션키가 나중에 도착하면 다시 시도해야 하므로.
  if (preview) setPreviewCache(id, preview);
  return preview;
};

export interface ThreadSummaryPage {
  item: ThreadSummary[];
  /** 다음 페이지 토큰 (없으면 끝) */
  next: string | null;
}

/**
 * 스레드 목록 한 페이지를 요약으로 가져온다 (HTTP 1건).
 * `from`을 주면 이어받기(더 보기).
 */
export const fetchThreadSummaryPage = async (
  client: MatrixClient,
  room: Room,
  from: string | null = null,
  limit = 30,
): Promise<ThreadSummaryPage> => {
  const res = await client.createThreadListMessagesRequest(
    room.roomId,
    from,
    limit,
    Direction.Backward,
    ThreadFilterType.All,
  );
  // SDK는 chunk를 reverse해서(오래된 → 최신) 주고 end=next_batch로 정규화한다.
  const chunk = (res.chunk ?? []) as unknown as ThreadRootRaw[];
  const item = await Promise.all(
    chunk
      .filter((raw) => !!raw.event_id)
      .map(async (raw): Promise<ThreadSummary> => {
        // bundled m.thread relation에서 정렬 키/답글 수를 읽는다.
        // MatrixEvent 래핑은 순수 파싱(HTTP 없음) — getServerAggregatedRelation
        // 이 unsigned["m.relations"] 접근을 대신 해준다.
        // (SDK 타입은 RelationType.Thread에 대해 `{}`를 주므로 여기서 좁힌다:
        //  스펙상 m.thread aggregation = {count, current_user_participated,
        //  latest_event} — spec.matrix.org/v1.8 server-side aggregation)
        const wrapper = new MatrixEvent(
          raw as ConstructorParameters<typeof MatrixEvent>[0],
        );
        const bundled = wrapper.getServerAggregatedRelation(
          RelationType.Thread,
        ) as
          | { count?: number; latest_event?: { origin_server_ts?: number } }
          | undefined;
        const latestTs = bundled?.latest_event?.origin_server_ts;
        return {
          id: raw.event_id ?? "",
          ts:
            typeof latestTs === "number"
              ? latestTs
              : (raw.origin_server_ts ?? 0),
          count: typeof bundled?.count === "number" ? bundled.count : 0,
          preview: await buildPreview(client, room, raw),
        };
      }),
  );
  return { item, next: res.end ?? null };
};

/**
 * 서버 요약 목록 + SDK가 라이브로 만든 Thread를 합쳐 최종 표시 목록을 만든다.
 *
 * - 서버 요약: 방 진입 시 1회 fetch한 과거 스레드 (Thread 객체 없음 = 가벼움)
 * - SDK Thread: sync로 답글이 도착해 SDK가 자동 생성한 것 (항상 최신)
 *
 * 같은 id면 SDK 쪽 ts가 더 최신이므로 큰 값을 취하고, 미리보기는 rootEvent가
 * 로드된 SDK 쪽을 우선하되 비어 있으면 요약 값을 유지한다.
 * 정렬은 ts 내림차순 + id tiebreak(안정 정렬 — 비동기 도착으로 순서가 흔들리지
 * 않게).
 */
export const mergeThreadSummaries = (
  room: Room,
  summary: ThreadSummary[],
): ThreadSummary[] => {
  const merged = new Map<string, ThreadSummary>();
  for (const s of summary) merged.set(s.id, s);
  for (const thread of room.getThreads()) {
    const prev = merged.get(thread.id);
    const liveTs =
      thread.replyToEvent?.getTs() ?? thread.rootEvent?.getTs() ?? 0;
    const root = thread.rootEvent;
    let livePreview = "";
    if (root) {
      const cached = previewCache.get(thread.id);
      if (cached) {
        livePreview = cached;
      } else {
        try {
          livePreview = quotePreview(root).trim();
        } catch {
          livePreview = "";
        }
        if (livePreview) setPreviewCache(thread.id, livePreview);
      }
    }
    merged.set(thread.id, {
      id: thread.id,
      ts: Math.max(liveTs, prev?.ts ?? 0),
      count: thread.length || (prev?.count ?? 0),
      preview: livePreview || prev?.preview || "",
    });
  }
  return [...merged.values()].sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
};
