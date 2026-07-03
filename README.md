# matrix-client

A Matrix chat client I built because I wanted something cleaner than Element
for my own homeserver. It's a React Router v7 SPA on top of
[matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk) with Rust crypto —
the SDK does the heavy lifting (sync, rooms, E2EE), this repo is the UI.

## Features

- OIDC (MAS) login with dynamic client registration + PKCE, password login as
  fallback — the login screen auto-detects what the homeserver supports
- E2EE by default (Rust crypto), cross-signing, SAS verification, key backup
- DMs, rooms, and spaces with full hierarchy navigation
- Threads, edits, replies, reactions, redactions, pins, forwards, mentions
- Per-room search — server-side for plaintext rooms, client-side for E2EE
- Installable PWA with native window controls overlay
- UI in Korean, English, and Japanese (auto-detected, overridable)

## Development

pnpm only — don't mix in `npm`/`yarn`, the lockfile is `pnpm-lock.yaml`.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build
pnpm typecheck
pnpm lint         # biome
```

## Deploy

The build is a static SPA — no server runtime. All session state lives in the
browser (localStorage + IndexedDB), so any static file server works. Images
are published to `ghcr.io/krisamin/matrix-client` (nginx serving the bundle,
SPA fallback wired in `docker/nginx.conf`).

The only knob is `DEFAULT_HOMESERVER`: an entrypoint script rewrites the
baked-in `https://matrix.org` default in the JS bundle at container startup.
Leave it unset and the image stays generic; users can always type their own
homeserver on the login screen (last used one is sticky).

```bash
# Docker
docker run -e DEFAULT_HOMESERVER=https://matrix.example.com \
  -p 8080:80 ghcr.io/krisamin/matrix-client:latest

# Helm (chart in charts/matrix-client)
helm install my-chat ./charts/matrix-client \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=chat.example.com \
  --set config.defaultHomeserver=https://matrix.example.com
```

`docker compose up --build` runs the Vite dev server with HMR;
`docker compose -f docker-compose.prod.yml up --build` mirrors the production
image locally.

## Project layout

```
app/
  components/    # UI (Modal, Form, Sidebar, EventLine, …)
  hooks/         # useRoomTimeline, useUserSearch, …
  i18n/          # ko / en / ja dictionaries (1:1 keys, ko is master)
  lib/           # SDK wrappers and helpers (matrix.ts, mention.ts, …)
  routes/        # room, login, verify, oidc/callback
```

## License

MIT
