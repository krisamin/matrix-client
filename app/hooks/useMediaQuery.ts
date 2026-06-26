import { useEffect, useState } from "react";

/**
 * CSS 미디어 쿼리의 매치 여부를 구독하는 훅. SSR-safe(초기값 false).
 * matchMedia 변화에 반응해 리렌더 → 레이아웃 분기에 사용.
 *
 *   const isMobile = useMediaQuery("(max-width: 767.98px)");
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // 마운트 시 현재 값 동기화 (초기 SSR 값과 어긋날 수 있어)
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** 모바일(좁은 화면) 여부 — Tailwind md 브레이크포인트(768px) 미만. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767.98px)");
}
