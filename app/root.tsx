import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
// 이모지 폰트(Tossface) @font-face — 원본 CDN css의 깨진 unicode-range를 고친
// 자동 생성본. 갱신: `node scripts/gen-tossface-css.mjs`
import "./tossface.css";
import { I18nProvider } from "./lib/i18n";
import { registerServiceWorker } from "./lib/register-sw";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "preconnect",
    href: "https://cdn.jsdelivr.net",
    crossOrigin: "anonymous",
  },
  // 본문: Wanted Sans Variable / 고정폭(시간·코드): Fira Code
  //
  // ★`complete` 대신 `split` (2026-08 실측): complete는 전 글리프를 담은 단일
  //   woff2 1.29MB를 **무조건** 받는다. split은 unicode-range로 92조각이라
  //   화면에 실제 등장한 글자의 조각만 받는다 — 한국어 채팅 화면 기준 5조각
  //   64.7KB로 **1.22MB(95%) 절감**. 폰트 모양은 동일(같은 v1.0.3 소스).
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Fira+Code:wght@300..700&display=swap",
  },
  // 이모지: Tossface — OS 기본 대신 통일된 이모지 렌더링 (unicode-range 분할 로드)
  //   ※ @font-face 선언은 CDN css 대신 app/tossface.css(자동 생성본)를 쓴다.
  //     원본 css는 chunk 11의 unicode-range가 스펙 위반이라 파서가 range를 통째로
  //     버리고 "전 범위 매칭"이 돼, 이모지가 없는 화면에서도 532KB를 받았다.
  //     woff2 실체는 여전히 jsDelivr에서 받으므로 preconnect는 유지.
  // PWA: 설치형 앱 (macOS Safari "Dock에 추가" / iOS "홈 화면에 추가")
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/icon-192.png", type: "image/png" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
        {/* PWA: standalone 앱 외형 (Safari/iOS) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="matrix-client" />
        <meta name="theme-color" content="#111113" />
        <Meta />
        <Links />
      </head>
      <body className="font-sans text-[14px] leading-[1.5] antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // SW 등록 — injectRegister("auto")가 RR v7 프리렌더 index.html에 주입을
  // 못 해서 (sw=false 실측) 앱 코드에서 직접. 상세는 lib/register-sw.ts.
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return (
    <I18nProvider>
      <Outlet />
    </I18nProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1 className="text-xl font-bold text-fg-0">{message}</h1>
      <p className="text-fg-1">{details}</p>
      {stack && (
        <pre className="mt-4 w-full overflow-x-auto rounded-lg border border-line bg-bg-2 p-4 font-mono text-[12.5px]">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
