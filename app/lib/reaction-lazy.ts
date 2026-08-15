import {
  EventType,
  type MatrixClient,
  type MatrixEvent,
  RelationType,
  type Room,
} from "matrix-js-sdk";

/**
 * 리액션 지연 로딩 — 메인 타임라인 필터에서 `m.reaction`을 뺀 대가를 갚는 곳.
 *
 * ## 왜 필요한가 (실측 근거)
 * 대화가 스레드 위주로 이뤄지는 방에서는 메인 타임라인 필터가 스레드 답글을
 * 걷어내고 나면 **남는 게 거의 리액션뿐**이다. 실측(`!xomvnz…` 방):
 * `/messages?limit=80` 한 장에 리액션 74~78개 / 메시지 1~6개 —
 * 즉 받은 바이트의 91%가 화면에 직접 그려지지 않는 이벤트였다.
 * 15행을 채우려고 8장(699KB)을 돌았고, 그중 메시지는 20여 개뿐이었다.
 *
 * 필터에서 리액션을 빼면 같은 15행이 1장(198KB)에 끝난다. 대신 칩이 사라지니
 * **보이는 메시지에 한해** 여기서 되받아온다. 실측 평균 **메시지당 477B**
 * (리액션이 달린 메시지 19개 기준 총 9,080B) — 타임라인에 리액션을 섞어
 * 받는 것보다 압도적으로 싸고, 무엇보다 **화면에 보이는 만큼만** 낸다.
 *
 * ## 왜 이 방식이 안전한가
 * - `room.relations`(방 단위 컨테이너)에 주입하므로 `ReactionBar`가 쓰는
 *   `getChildEventsForEvent()` 경로가 그대로 살아있다. 컴포넌트 수정 불필요.
 * - `Relations.addEvent()`는 `relationEventIds`로 중복을 막는다(SDK 확인) →
 *   sync로 이미 들어온 리액션과 겹쳐도 칩이 두 번 세지지 않는다.
 * - 실시간 리액션은 여전히 sync가 처리한다. 여기는 **과거분 보충 전용**.
 * - 타임라인은 virtua 가상 스크롤이라 `ReactionBar`는 보이는 행만 마운트된다
 *   → 스크롤한 만큼만 요청이 나간다.
 *
 * ## 함정
 * `client.relations()`를 쓰면 안 된다 — 내부에서 `fetchRoomEvent()`를 **함께**
 * 호출해 원본 이벤트를 한 번 더 GET한다(client.js: `Promise.all([fetchRoomEvent,
 * fetchRelations])`). 원본은 이미 손에 있으므로 `fetchRelations()`를 직접 부른다.
 */

/** 이미 조회한 이벤트 (성공/빈 결과 모두 기록 — 리액션 0개인 메시지 재조회 방지) */
const fetched = new Set<string>();
/** 진행 중 요청 — 같은 이벤트에 대한 동시 호출 합류 */
const inflight = new Map<string, Promise<void>>();

/** 테스트/방 전환용 초기화 (프로덕션 경로에선 쓰지 않는다) */
export const resetReactionFetchState = (): void => {
  fetched.clear();
  inflight.clear();
};

export const hasFetchedReactions = (eventId: string): boolean =>
  fetched.has(eventId);

/**
 * 한 메시지의 과거 리액션을 받아 room.relations에 주입한다.
 * 이미 받았거나 받는 중이면 재요청하지 않는다. 실패는 조용히 무시(칩만 안 보임).
 */
export const loadReactionsFor = async (
  client: MatrixClient,
  room: Room,
  ev: MatrixEvent,
): Promise<void> => {
  const eventId = ev.getId();
  // 아직 서버에 안 올라간 로컬 에코는 조회 대상이 아니다.
  if (!eventId || eventId.startsWith("~") || ev.isSending?.()) return;
  if (fetched.has(eventId)) return;
  const running = inflight.get(eventId);
  if (running) return running;

  const task = (async () => {
    try {
      const res = await client.fetchRelations(
        room.roomId,
        eventId,
        RelationType.Annotation,
        EventType.Reaction,
        { limit: 100 },
      );
      const mapper = client.getEventMapper();
      for (const raw of res.chunk ?? []) {
        const child = mapper(raw);
        // 방 단위 relations 컨테이너에 직접 주입 — ReactionBar가 읽는
        // `room.relations.getChildEventsForEvent()`와 같은 컨테이너다.
        // (`room.aggregateNonLiveRelation()`은 같은 일을 하지만 타입상 private.
        //  `room.relations`는 public readonly, `aggregateChildEvent`도 public이라
        //  이쪽이 캐스팅 없이 쓸 수 있는 정식 경로다.)
        room.relations.aggregateChildEvent(child);
      }
    } catch {
      // 네트워크/권한 실패 — 칩이 안 보일 뿐 타임라인은 정상.
    } finally {
      fetched.add(eventId);
      inflight.delete(eventId);
    }
  })();

  inflight.set(eventId, task);
  return task;
};
