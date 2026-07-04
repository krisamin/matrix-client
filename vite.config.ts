import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    reactRouter(),
    // PWA SW는 production build에서만. dev에선 outDir=build/client를 watch
    // 하다가 vite dev 서버 라우팅과 충돌 ("Cannot GET /") — devOptions.enabled
    // false만으론 부족, plugin 자체를 dev에서 제외해야 함.
    ...(command === "build"
      ? [
          VitePWA({
            registerType: "autoUpdate",
            injectRegister: "auto",
            srcDir: "app",
            outDir: "build/client",
            manifest: false,
            workbox: {
              navigateFallback: "/index.html",
              navigateFallbackDenylist: [/^\/_/, /^\/oidc/, /^\/.well-known/],
              globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm}"],
              // crypto WASM(~5.5MB)까지 precache에 포함 — 오프라인 cold boot
              // 시에도 E2EE 스택이 뜨도록 (4MB 캡이면 wasm이 빠짐)
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              runtimeCaching: [
                {
                  urlPattern: ({ url }) =>
                    url.pathname.endsWith(".wasm") ||
                    url.pathname.includes("matrix_sdk_crypto_wasm"),
                  handler: "CacheFirst",
                  options: {
                    cacheName: "matrix-wasm",
                    expiration: {
                      maxEntries: 4,
                      maxAgeSeconds: 30 * 24 * 60 * 60,
                    },
                  },
                },
                {
                  urlPattern: ({ url }) =>
                    url.pathname.startsWith("/_matrix/media/") ||
                    url.pathname.startsWith("/_matrix/client/v1/media/"),
                  handler: "StaleWhileRevalidate",
                  options: {
                    cacheName: "matrix-media",
                    expiration: {
                      maxEntries: 200,
                      maxAgeSeconds: 7 * 24 * 60 * 60,
                      purgeOnQuotaError: true,
                    },
                  },
                },
                {
                  urlPattern: ({ url }) =>
                    url.hostname === "fonts.gstatic.com" ||
                    url.hostname === "fonts.googleapis.com",
                  handler: "CacheFirst",
                  options: {
                    cacheName: "google-fonts",
                    expiration: {
                      maxEntries: 30,
                      maxAgeSeconds: 365 * 24 * 60 * 60,
                    },
                  },
                },
                {
                  // 본문/이모지 폰트 CDN (Wanted Sans, Tossface) — 이게 없으면
                  // 오프라인 부팅 시 폰트가 전부 fallback으로 깨짐
                  urlPattern: ({ url }) => url.hostname === "cdn.jsdelivr.net",
                  handler: "CacheFirst",
                  options: {
                    cacheName: "cdn-fonts",
                    expiration: {
                      maxEntries: 60,
                      maxAgeSeconds: 365 * 24 * 60 * 60,
                      purgeOnQuotaError: true,
                    },
                  },
                },
              ],
              skipWaiting: true,
              clientsClaim: true,
            },
            devOptions: { enabled: false },
          }),
        ]
      : []),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    exclude: ["@matrix-org/matrix-sdk-crypto-wasm"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["dev-matrix-client.kirby.so"],
    // dev가 build/ 폴더(production 빌드 결과물)를 watch하면 'pnpm run build' 후
    // 빌드된 index.html 변경을 감지해 dev 페이지를 무한 reload함. drag-drop 같은
    // 인터랙션 중에도 새로고침 유발 — ignore 명시.
    watch: {
      ignored: ["**/build/**", "**/dist/**"],
    },
    hmr: {
      host: "dev-matrix-client.kirby.so",
      protocol: "wss",
      clientPort: 443,
    },
  },
}));
