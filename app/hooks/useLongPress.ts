import { useCallback, useEffect, useRef } from "react";

/**
 * Long-press(꾹 누르기) 핸들러. 모바일/터치 환경에서 데스크탑 hover 메뉴를
 * 대체하는 컨텍스트 액션 트리거로 사용한다.
 *
 * 동작:
 *  - touchstart에서 타이머(기본 500ms) 시작
 *  - 그 동안 손가락이 10px 이상 움직이면 스크롤로 간주 → 취소
 *  - touchend/touchcancel/touchmove(임계 초과) 시 취소
 *  - 데스크탑 환경(마우스)에선 contextmenu 이벤트로 동일 핸들러 실행 (우클릭)
 *
 * onLongPress는 PointerEvent의 clientX/Y를 인자로 받아 메뉴 앵커 위치 결정 가능.
 *
 * 사용: const bind = useLongPress((x, y) => openMenu(x, y));
 *       <div {...bind} ... />
 */
export function useLongPress(
  onLongPress: (x: number, y: number) => void,
  options: { delay?: number; moveThreshold?: number } = {},
) {
  const { delay = 500, moveThreshold = 10 } = options;
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      firedRef.current = false;
      startRef.current = { x: t.clientX, y: t.clientY };
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        // 햅틱 피드백 — 기기 지원 시
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(10);
        }
        onLongPress(t.clientX, t.clientY);
      }, delay);
    },
    [delay, onLongPress],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startRef.current || timerRef.current == null) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > moveThreshold) clear();
    },
    [clear, moveThreshold],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // long-press가 발화했으면 그 직후 click을 막아 \"꾹 눌렀더니 메뉴+클릭\"
      // 동시 발화를 방지 (iOS는 touchend 후 click이 따라옴)
      if (firedRef.current) {
        e.preventDefault();
      }
      clear();
    },
    [clear],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // 데스크탑 우클릭도 동일 트리거. 다만 .selectable이나 message-body 안에서
      // 기본 컨텍스트 메뉴(복사)가 필요한 곳은 호출부가 e.stopPropagation으로
      // 막아 여기까지 전파되지 않게 한다. 여기선 preventDefault만.
      e.preventDefault();
      onLongPress(e.clientX, e.clientY);
    },
    [onLongPress],
  );

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: clear,
    onContextMenu,
  };
}
