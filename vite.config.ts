import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
    // React 단일 복사본 강제 — dev dep 재최적화 중 두 번째 React가
    // 끼어들어 "Invalid hook call / dispatcher null"이 나는 것 방지
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  // rust crypto WASM은 vite dep optimizer가 망가뜨리므로 제외.
  // react 스택은 명시적으로 함께 사전번들 → 한 번에 일관되게 묶여
  // 런타임 중 추가 dep로 인한 부분 재최적화에도 복사본이 갈라지지 않음
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    exclude: ["@matrix-org/matrix-sdk-crypto-wasm"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["dev-matrix-client.kirby.so"],
    // https 프록시 뒤에서 HMR websocket이 wss://<host>:443으로 붙도록
    hmr: {
      host: "dev-matrix-client.kirby.so",
      protocol: "wss",
      clientPort: 443,
    },
  },
});
