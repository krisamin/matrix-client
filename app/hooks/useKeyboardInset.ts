import { useEffect } from "react";

/**
 * 모바일 가상 키보드가 올라온 만큼의 높이(px)를 CSS 변수 `--keyboard-inset`로
 * 발행한다. `interactive-widget=resizes-content` (iOS 16.4+)가 먹는 환경에선
 * layout viewport 자체가 줄어들어 따로 처리 안 해도 되지만, 그 미만 iOS 사파리
 * / 일부 안드 WebView는 layout viewport가 그대로라 입력창이 키보드에 가린다.
 * 이 훅은 VisualViewport API로 실제 보이는 높이를 측정해 root에 padding을 줄
 * 수 있도록 CSS 변수를 publish한다.
 *
 * 사용: AppLayout root에 `style={{ paddingBottom: 'var(--keyboard-inset, 0px)' }}`.
 * 또는 입력창 컨테이너에 직접 transform/padding을 변수로 적용해도 됨.
 *
 * - 데스크탑/터치 없는 환경: VisualViewport 변화가 거의 없어 거의 0px 유지.
 *   해 끼치지 않음.
 * - WebView/safari 주소창 토글 같은 자연 변화(< 100px): 키보드로 간주하지
 *   않도록 임계값(120px)으로 필터.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return; // 미지원 브라우저 — no-op
    const root = document.documentElement;
    const update = () => {
      // window.innerHeight = layout viewport, vv.height = visible viewport.
      // 키보드 올라오면 vv.height만 줄어든다(layout은 그대로 또는 보정 후).
      // offsetTop은 사파리에서 키보드와 함께 0이 아닌 값이 되기도 해 같이 반영.
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // 임계값 미만(주소창 토글 등 자연 변화)은 0 처리 — 잘못된 padding 방지.
      // 모바일 키보드는 보통 200~350px이라 120px이면 충분히 구분 가능.
      const effective = inset > 120 ? inset : 0;
      root.style.setProperty("--keyboard-inset", `${effective}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);
}
