/**
 * 타임라인 명령형 핸들 계약 — **레이어 경계 타입**.
 *
 * `Timeline` 컴포넌트가 `forwardRef`로 노출하고, 부모 라우트(room/room.thread)와
 * `useJumpToEvent` 훅이 소비한다.
 *
 * ★여기(lib)에 두는 이유: 이 타입이 `components/Timeline.tsx`에 있던 시절
 * `hooks/useJumpToEvent.ts`가 컴포넌트를 import해야 했다 — 훅(하위 레이어)이
 * 컴포넌트(상위 레이어)를 참조하는 **유일한 레이어 역방향 의존**이었다.
 * 타입뿐이라 런타임 영향은 없었지만, 의존 방향이 뒤집힌 곳은 나중에 값 import가
 * 섞여 들어오는 통로가 된다. 순수 계약이므로 공용 레이어가 제자리.
 */
export interface TimelineHandle {
  /** 로드된 범위에 해당 이벤트가 있으면 그 행으로 스크롤하고 true 반환 */
  scrollToEvent: (eventId: string) => boolean;
  /** 무조건 바닥으로 + stick 복구. 전송 직후 호출용. */
  scrollToBottom: () => void;
}
