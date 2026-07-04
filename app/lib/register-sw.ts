import { logLifecycle } from "./lifecycle-log";

/** 서비스워커 명시 등록.
 *
 *  vite-plugin-pwa의 injectRegister("auto")는 index.html에 등록 스크립트를
 *  주입하는 방식인데, react-router v7 framework mode는 index.html을 RR이
 *  프리렌더해서 주입이 조용히 실패한다 (registerSW.js만 생성되고 아무도
 *  안 불러 sw=false — 실기기 라이프사이클 로그로 확인). 앱 코드에서 직접
 *  등록하는 게 확실한 경로.
 *
 *  dev에선 sw.js가 없으므로 PROD에서만. 등록/실패를 라이프사이클 로그에
 *  남겨 진단 화면에서 확인 가능. */
let attempted = false;

export function registerServiceWorker(): void {
  if (attempted || typeof window === "undefined") return;
  attempted = true;
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then((reg) => {
      logLifecycle("sw-registered", `scope=${reg.scope}`);
      // registerType: "autoUpdate" — waiting 워커는 skipWaiting+clientsClaim
      // 으로 즉시 활성화되므로 별도 프롬프트/리로드 처리 불필요.
    })
    .catch((e) => {
      logLifecycle("sw-register-failed", String(e).slice(0, 200));
    });
}
