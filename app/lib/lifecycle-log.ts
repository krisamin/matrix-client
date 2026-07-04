import { ls } from "./storage";

/** 페이지 라이프사이클 계측 — 모바일 PWA에서 "저절로 새로고침" 원인 추적용.
 *
 *  홈 화면 이탈/복귀(visibilitychange), 백그라운드 freeze/resume(Page
 *  Lifecycle API), 페이지 로드/언로드, 네트워크 on/off, sync 상태 전이를
 *  localStorage 링 버퍼에 남긴다. 재로드 후에도 직전 세션의 마지막 순간이
 *  남아 있어 "OS discard였는지 / 렌더러 크래시였는지 / 코드 문제인지"를
 *  boot 항목(nav type, wasDiscarded)과 대조해 판별할 수 있다.
 *  열람: 설정 → 진단 → 앱 동작 기록. */

export interface LifecycleEntry {
  /** 고유 id (같은 세션 내 순번 + timestamp — 리스트 key용) */
  id: string;
  /** Date.now() */
  t: number;
  type: string;
  detail?: string;
}

const KEY = "lifecycle-log";
const MAX_ENTRIES = 200;

let buffer: LifecycleEntry[] | null = null;
let seq = 0;

function load(): LifecycleEntry[] {
  if (buffer) return buffer;
  buffer = ls.getJSON<LifecycleEntry[]>(KEY, []);
  return buffer;
}

export function logLifecycle(type: string, detail?: string): void {
  if (typeof window === "undefined") return;
  const buf = load();
  buf.push({
    id: `${Date.now()}-${seq++}`,
    t: Date.now(),
    type,
    ...(detail ? { detail } : {}),
  });
  if (buf.length > MAX_ENTRIES) buf.splice(0, buf.length - MAX_ENTRIES);
  try {
    ls.setJSON(KEY, buf);
  } catch {
    /* quota 초과 등 — 로그는 최선노력 */
  }
}

/** 최신 항목 먼저 반환 */
export function getLifecycleLog(): LifecycleEntry[] {
  return [...load()].reverse();
}

export function clearLifecycleLog(): void {
  buffer = [];
  ls.remove(KEY);
}

let attached = false;

export function attachLifecycleLogger(): void {
  if (typeof window === "undefined" || attached) return;
  attached = true;

  // boot: 이 로드가 어떤 종류였는지 기록.
  //  - nav=navigate: 새 진입(아이콘 실행 등) / reload: 새로고침(크래시 자동
  //    리로드 포함) / back_forward: BFCache 아님 히스토리 이동
  //  - discarded=true: OS가 백그라운드 탭을 discard했다가 다시 로드한 것
  //    (Chromium 전용 document.wasDiscarded)
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const discarded =
    (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true;
  const controlled = !!navigator.serviceWorker?.controller;
  logLifecycle(
    "boot",
    `nav=${nav?.type ?? "?"} discarded=${discarded} sw=${controlled} vis=${document.visibilityState}`,
  );

  document.addEventListener("visibilitychange", () => {
    logLifecycle(document.visibilityState);
  });
  // Page Lifecycle API (Chromium): 백그라운드 CPU 정지/해제
  document.addEventListener("freeze", () => logLifecycle("freeze"));
  document.addEventListener("resume", () => logLifecycle("resume"));
  window.addEventListener("pagehide", (e) => {
    logLifecycle("pagehide", e.persisted ? "bfcache" : "unload");
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) logLifecycle("pageshow", "bfcache");
  });
  window.addEventListener("online", () => logLifecycle("online"));
  window.addEventListener("offline", () => logLifecycle("offline"));

  // 크래시 전조 추적: 리로드 직전 마지막 항목이 error면 "렌더러 크래시 →
  // 자동 리로드" 시나리오의 강한 신호가 된다.
  window.addEventListener("error", (e) => {
    logLifecycle("error", String(e.message ?? "").slice(0, 200));
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason =
      e.reason instanceof Error ? e.reason.message : String(e.reason);
    logLifecycle("unhandledrejection", reason.slice(0, 200));
  });
}
