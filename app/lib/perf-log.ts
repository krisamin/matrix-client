import { logLifecycle } from "./lifecycle-log";

/** 성능 구간 계측 — "느리다/버벅인다"를 추측 말고 숫자로 잡기 위한 유틸.
 *
 *  perfSpan("boot:crypto") 호출 시점부터 반환된 end() 호출까지의 소요 시간을
 *  lifecycle-log에 type="perf"로 남긴다. 열람은 기존 설정 → 진단 뷰어 그대로.
 *
 *  계측 구간 (2026-07 성능 조사):
 *   - boot:*   콜드 스타트 (store.startup / initRustCrypto / first-sync / total)
 *   - room:*   방 전환 (bind / filter / fill / total)
 *   - older:*  과거 메시지 페이지네이션 (loadOlder 1회)
 *
 *  오버헤드: 구간당 localStorage write 1회 — 방 전환당 ~4개, 스크롤 로드당
 *  1개 수준이라 계측 자체가 성능에 영향 주지 않는다. */
export function perfSpan(name: string): (detail?: string) => void {
  if (typeof performance === "undefined") return () => {};
  const t0 = performance.now();
  let ended = false;
  return (detail?: string) => {
    if (ended) return; // 이중 호출 무해화 (early-return 경로 중복 등)
    ended = true;
    const ms = Math.round(performance.now() - t0);
    logLifecycle("perf", `${name} ${ms}ms${detail ? ` ${detail}` : ""}`);
  };
}
