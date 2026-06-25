# pnpm + nginx 정적 SPA 빌드.
# install/build 모두 동일 node 런타임 — 일관성 우선.

FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run typecheck && pnpm run build

# Runtime: nginx serves the SPA build directly. /index.html is the app shell;
# all other unknown routes also fall back to it (client-side routing).
#
# Runtime config: DEFAULT_HOMESERVER env var (optional) is sed'd into the
# JS bundle at startup via docker/entrypoint.sh — empty/unset keeps the
# source default (matrix.org).  Generic image, no rebuild needed per site.
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/build/client /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /docker-entrypoint.d/40-default-homeserver.sh
RUN chmod +x /docker-entrypoint.d/40-default-homeserver.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1
