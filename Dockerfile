FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# build는 node 런타임으로 — react-router의 build pipeline이 react-dom/server를
# resolve할 때 bun runtime이 server.bun.js를 잡아 'renderToPipeableStream'
# export 누락 에러를 냄. node에서는 server.node.js를 정상 resolve.
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node node_modules/@react-router/dev/dist/cli.js typegen \
  && node node_modules/@react-router/dev/dist/cli.js build

# Runtime: nginx serves the SPA build directly. /index.html is the app shell;
# all other unknown routes also fall back to it (client-side routing).
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/build/client /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1