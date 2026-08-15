import {
  EventTimeline,
  type EventTimelineSet,
  type IRoomEvent,
  type MatrixClient,
  type Room,
} from "matrix-js-sdk";

/**
 * 스크롤백 캐시 — `/messages`로 받은 이벤트를 IndexedDB에 넣고 재방문 때 재생한다.
 *
 * ★왜 필요한가 (실측)
 * SDK의 IndexedDBStore는 **sync만** 영속화한다. 재방문하면 sync는 355KB→28KB로
 * 줄지만 `/messages`는 629,735B→628,628B로 **1KB도 안 줄었다**. 방을 열 때마다
 * 같은 스크롤백을 바이트까지 똑같이 다시 받고 있었다.
 *
 * ★왜 SDK 스토어를 안 쓰고 따로 두는가
 * IndexedDBStore의 타임라인 영속화는 SDK가 지원하지 않는다(sync accumulator만
 * 저장). 스토어를 확장하는 건 SDK 내부 계약에 손대는 일이라, 우리 쪽에서
 * "원본 JSON을 저장했다가 다시 먹인다"는 얕은 방식이 안전하다. 저장하는 건
 * 서버가 준 raw 이벤트 그대로라 복호화 결과/키는 건드리지 않는다.
 */

const DB_NAME = "matrix-client-scrollback";
const STORE = "pages";
const DB_VERSION = 1;

/** 방당 캐시할 최대 이벤트 수. 초기 화면(15행) + 여유분. */
const MAX_EVENTS_PER_ROOM = 120;

/**
 * 캐시 수명. 이보다 오래된 건 버린다 — 편집/삭제가 반영 안 된 낡은 본문을
 * 계속 보여주는 것보다 다시 받는 게 낫다.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** 스키마가 바뀌면 올린다. 옛 레코드는 읽는 즉시 폐기된다. */
const SCHEMA = 2;

type CachedPage = {
  roomId: string;
  schema: number;
  savedAt: number;
  /** 이 청크의 backward 페이지네이션 토큰(res.end). 재생 후 이어받기용. */
  paginationToken: string | null;
  /** 서버가 준 raw 이벤트 JSON. 시간 오름차순으로 저장. */
  events: IRoomEvent[];
};

const openDb = (): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "roomId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      // 시크릿 모드 등에서 무한 블록되는 경우 방어
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

const tx = <T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> =>
  new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

/**
 * 타임라인에 쌓인 이벤트를 캐시에 저장한다. fill이 끝난 뒤 호출.
 * 실패는 조용히 무시 — 캐시는 어디까지나 최적화다.
 */
export const saveScrollback = async (
  room: Room,
  timelineSet: EventTimelineSet | null,
): Promise<void> => {
  const db = await openDb();
  if (!db) return;
  try {
    const timeline = (
      timelineSet ?? room.getUnfilteredTimelineSet()
    ).getLiveTimeline();
    const events = timeline.getEvents();
    if (events.length === 0) return;

    // 가장 오래된 쪽부터 MAX_EVENTS_PER_ROOM개. 토큰은 그 앞을 가리켜야 하므로
    // 잘라낸 경우 이어받기 토큰을 쓸 수 없다(null로 두고 재생 후 정상 페이지네이션).
    const sliced = events.slice(-MAX_EVENTS_PER_ROOM);
    const truncated = sliced.length < events.length;
    const token = truncated
      ? null
      : timeline.getPaginationToken(EventTimeline.BACKWARDS);

    const raw: IRoomEvent[] = [];
    for (const ev of sliced) {
      // local echo(아직 서버에 없는 것)는 캐시하지 않는다 — 재생 시 유령이 된다.
      if (ev.status !== null) continue;
      if (!ev.getId()?.startsWith("$")) continue;
      raw.push(ev.event as IRoomEvent);
    }
    if (raw.length === 0) return;

    const page: CachedPage = {
      roomId: room.roomId,
      schema: SCHEMA,
      savedAt: Date.now(),
      paginationToken: token,
      events: raw,
    };
    await tx(db, "readwrite", (s) => s.put(page));
  } catch {
    // 저장 실패는 무시
  } finally {
    db.close();
  }
};

/**
 * 캐시를 타임라인에 재생한다. 방 진입 직후, fill 루프 **전에** 호출.
 * @returns 주입한 이벤트 수 (0이면 캐시 미스)
 */
export const restoreScrollback = async (
  client: MatrixClient,
  room: Room,
  timelineSet: EventTimelineSet | null,
): Promise<number> => {
  const db = await openDb();
  if (!db) return 0;
  try {
    const page = await tx<CachedPage>(db, "readonly", (s) =>
      s.get(room.roomId),
    );
    if (!page || page.schema !== SCHEMA) return 0;
    if (Date.now() - page.savedAt > MAX_AGE_MS) return 0;

    const set = timelineSet ?? room.getUnfilteredTimelineSet();
    const timeline = set.getLiveTimeline();

    // 이미 타임라인에 있는 건 제외. addEventsToTimeline은 중복을 막아주지만,
    // 중복 이벤트를 넘기면 토큰만 덮어써서 페이지네이션이 어긋날 수 있다.
    const known = new Set<string>();
    for (const ev of timeline.getEvents()) {
      const id = ev.getId();
      if (id) known.add(id);
    }
    const fresh = page.events.filter(
      (e) => e.event_id && !known.has(e.event_id),
    );
    if (fresh.length === 0) return 0;

    // ★SDK가 /messages 응답을 처리하는 순서를 그대로 재현한다
    //   (client.js paginateEventTimeline의 messages 분기).
    //   순서가 다르면 스레드 답글이 메인 타임라인에 섞이거나 편집/리액션
    //   집계가 누락된다.
    const mapper = client.getEventMapper();
    const mapped = fresh.map(mapper);
    const [timelineEvents, , unknownRelations] =
      room.partitionThreadedEvents(mapped);

    // backwards=true: 오래된 쪽으로 붙인다. 저장 순서가 시간 오름차순이므로
    // SDK가 기대하는 "역방향 청크"와 맞추기 위해 뒤집어 넘긴다.
    set.addEventsToTimeline(
      timelineEvents.slice().reverse(),
      true,
      false,
      timeline,
      page.paginationToken,
    );
    for (const ev of unknownRelations) room.relations.aggregateChildEvent(ev);

    return timelineEvents.length;
  } catch {
    return 0;
  } finally {
    db.close();
  }
};

/** 로그아웃/계정 전환 시 호출 — 남의 메시지가 남으면 안 된다. */
export const clearScrollbackCache = async (): Promise<void> => {
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {
    // 무시
  }
};
