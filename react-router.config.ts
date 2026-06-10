import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode — matrix-js-sdk(+ rust crypto WASM)는 브라우저 전용이라 SSR 끔
  ssr: false,
  future: {
    v8_middleware: true,
    v8_passThroughRequests: true,
    v8_splitRouteModules: true,
    v8_trailingSlashAwareDataRequests: true,
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
