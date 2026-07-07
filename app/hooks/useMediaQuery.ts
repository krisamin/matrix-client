import { useSyncExternalStore } from "react";

/**
 * CSS 미디어 쿼리의 매치 여부를 구독하는 훅. SSR-safe(초기값 false).
 *
 * ★쿼리당 matchMedia 1개 공유(모듈 레벨 registry) — EventLine처럼 행마다
 * 호출되는 컴포넌트에서 훅 인스턴스마다 리스너를 달면 보이는 행 수만큼
 * 리스너가 쌓인다(30행=30개). useSyncExternalStore + 공유 store로 쿼리당
 * 리스너 1개, 구독자는 Set으로 팬아웃.
 *
 *   const isMobile = useMediaQuery("(max-width: 767.98px)");
 */
const registry = new Map<
  string,
  { mql: MediaQueryList; subs: Set<() => void> }
>();

function getEntry(query: string) {
  let entry = registry.get(query);
  if (!entry) {
    const mql = window.matchMedia(query);
    const subs = new Set<() => void>();
    mql.addEventListener("change", () => {
      for (const cb of subs) cb();
    });
    entry = { mql, subs };
    registry.set(query, entry);
  }
  return entry;
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const entry = getEntry(query);
      entry.subs.add(cb);
      return () => entry.subs.delete(cb);
    },
    () => getEntry(query).mql.matches,
    () => false, // SSR/프리렌더: 데스크탑 기본
  );
}

/** 모바일(좁은 화면) 여부 — Tailwind md 브레이크포인트(768px) 미만. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767.98px)");
}
