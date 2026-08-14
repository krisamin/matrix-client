import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";

/**
 * ★스레드 지연 생성 (lazy thread) — 방 진입 시 HTTP 폭탄 차단.
 *
 * ## 문제
 * matrix-js-sdk는 타임라인에서 **스레드 루트를 발견할 때마다** SDK `Thread`
 * 객체를 즉시 만든다:
 *   - `paginateEventTimeline`(일반 /messages) → `client.processThreadRoots(...)`
 *     → `room.processThreadRoots` → `room.createThread` (client.js:3957)
 *   - `room.fetchRoomThreads()` (스레드 목록) → 동일 경로
 *
 * 그리고 `new Thread()` 생성자는 `updateThreadMetadata()`를 즉시 돌리는데,
 * 그 안에서 루트당 **HTTP 2건**이 나간다:
 *   1. `updateThreadFromRootEvent` → `fetchRootEvent()`
 *      = `GET /rooms/{id}/event/{root}` — **루트 이벤트를 이미 갖고 있어도
 *        무조건** 호출한다(unsigned 최신화 목적).
 *   2. `initialEventsFetched`가 false면 초기 답글 fetch
 *      = `GET /rooms/{id}/relations/{root}?recurse=true` (스레드당 수십~수백 KB)
 *
 * 즉 **화면에 보이지도 않는 스레드 30개 때문에 60건의 HTTP와 수 MB**가 방
 * 진입마다 나갔다. 모바일에선 이 응답들의 JSON 파싱 + 이벤트 매핑 + E2EE
 * 복호화가 메인 스레드를 수 초간 점유해 "메시지가 아무것도 안 뜨는" 증상이 된다.
 *
 * 실측(krisam.in, 방 1개 진입, 스레드 루트 30개):
 *   - SDK 기본 동작 ....... 92 요청 / 2,835,831 B
 *   - /threads 요약 1건만 ..  7 요청 /   464,169 B
 *
 * ## 해법
 * `client.processThreadRoots`를 no-op으로 덮어 **"타임라인에서 루트를 봤다"는
 * 이유만으로는 Thread를 만들지 않게** 한다. Thread는 정말 필요할 때만 생긴다:
 *   - 사용자가 스레드를 **열 때** → `useThreadTimeline`의 `room.createThread`
 *   - **라이브 답글**이 도착할 때 → SDK `room.addThreadedEvents`(sync 경로,
 *     여기서 만드는 건 실제로 대화가 진행 중인 스레드뿐이라 비용이 작다)
 *
 * ## 안전성 (왜 이래도 되는가)
 * - **사이드바 목록**: 더 이상 SDK Thread에 의존하지 않는다. `/threads` 요약
 *   1건(lib/thread-list.ts)이 제목·정렬 ts·답글 수를 모두 준다.
 * - **안 읽음 배지**: `room.getThreadUnreadNotificationCount()`는 sync의
 *   `unread_thread_notifications`로 채워지는 `threadNotifications` 맵을 읽는다
 *   (sync.js) — Thread 객체 존재 여부와 무관.
 * - **답글이 메인 타임라인에 새는 것**: 이벤트 배치는 `eventShouldLiveIn()`이
 *   `m.relates_to`와 같은 배치의 루트 id 집합으로 판정하므로 Thread 객체가
 *   없어도 정상 동작한다. 추가로 우리 `visibleEvents()`가 `threadRootId`로
 *   한 번 더 거른다.
 * - **스레드 열기**: `useThreadTimeline`이 `room.getThread() ?? createThread()`
 *   이므로 그 시점에 정상 생성 + SDK 초기 fetch가 돈다(기존과 동일 경로).
 *
 * client당 1회만 적용 (WeakSet 가드).
 */
const _lazyThreadsAttached = new WeakSet<MatrixClient>();

export function attachLazyThreads(client: MatrixClient): void {
  if (_lazyThreadsAttached.has(client)) return;
  _lazyThreadsAttached.add(client);

  // 시그니처는 SDK와 동일하게 유지 — 호출부(client.js paginate 경로)가
  // 인자 3개로 부른다. 우리는 아무것도 하지 않는다(지연 생성).
  const noop = (
    _room: Room,
    _threadedEvent: MatrixEvent[],
    _toStartOfTimeline: boolean,
  ): void => {
    /* 지연 생성: 스레드를 열거나 라이브 답글이 올 때만 Thread를 만든다 */
  };
  (
    client as unknown as { processThreadRoots: typeof noop }
  ).processThreadRoots = noop;
}
