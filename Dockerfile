# pnpm + nginx 정적 SPA 빌드.
# install/build 모두 동일 node 런타임 — 일관성 우선.

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run typecheck && pnpm run build
# ★정적 자산 사전 압축 — nginx gzip_static이 이 .gz를 그대로 전송한다.
#   특히 matrix_sdk_crypto_wasm(5.4MB)이 무압축으로 나가던 걸 1.77MB로 줄인다.
#   -k(원본 유지): gzip 미지원 클라이언트용 fallback이 필요하다.
RUN find build/client -type f \
      \( -name '*.js' -o -name '*.css' -o -name '*.wasm' -o -name '*.svg' -o -name '*.json' \) \
      -size +1k -exec gzip -9 -k -f {} \;

# Runtime: nginx serves the SPA build directly. /index.html is the app shell;
# all other unknown routes also fall back to it (client-side routing).
#
# Runtime config: the optional DEFAULT_HOMESERVER env var is written to
# /config.js at startup by docker/entrypoint.sh, and index.html loads it before
# the app bundle.  Unset leaves the built-in default (matrix.org).  The image
# stays generic — no rebuild needed per deployment.
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/build/client /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1
