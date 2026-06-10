import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
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
