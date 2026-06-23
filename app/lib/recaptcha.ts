/** Google reCAPTCHA v2 동적 로더 + render 헬퍼.
 *  Matrix 서버는 UIA `m.login.recaptcha` stage에서 `params.public_key`로
 *  sitekey를 내려준다. 사용자가 위젯을 풀면 토큰을 콜백으로 받아 다시
 *  registerRequest({ auth: { type: 'm.login.recaptcha', response, session }})
 *  로 보낸다.
 *
 *  - script는 한 번만 로드 (캐싱).
 *  - widget render는 명시적 promise — `loadRecaptcha()` 후 `renderRecaptcha(...)`.
 *  - 마운트 컨테이너가 unmount되면 자동 reset.
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (
        container: HTMLElement | string,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark";
          size?: "normal" | "compact";
        },
      ) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

const SCRIPT_SRC = "https://www.google.com/recaptcha/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

export function loadRecaptcha(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Not in a browser"));
      return;
    }
    if (window.grecaptcha) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      const wait = () => {
        if (window.grecaptcha) {
          window.grecaptcha.ready(() => resolve());
        } else {
          setTimeout(wait, 50);
        }
      };
      wait();
    };
    s.onerror = () => reject(new Error("Failed to load reCAPTCHA script"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function renderRecaptcha(
  container: HTMLElement,
  sitekey: string,
  onToken: (token: string) => void,
): { reset: () => void; widgetId: number } {
  if (!window.grecaptcha) {
    throw new Error("reCAPTCHA not loaded — call loadRecaptcha() first");
  }
  const widgetId = window.grecaptcha.render(container, {
    sitekey,
    callback: onToken,
    "expired-callback": () => {
      // 만료되면 부모가 새 토큰을 받기 전까지 진행 못함
    },
    theme: "dark",
  });
  return {
    widgetId,
    reset: () => window.grecaptcha?.reset(widgetId),
  };
}
