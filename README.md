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

The only knob is `DEFAULT_HOMESERVER`, the homeserver the login form starts
with. At container startup the entrypoint writes it to `/config.js`, which
`index.html` loads before the app bundle. Leave it unset and the image stays
generic (falls back to `matrix.org`); users can always type their own
homeserver on the login screen, and the last one they used is sticky.

Prefer a bare server name over a URL. The client resolves the real API base
URL through `.well-known` delegation, so `example.com` keeps the login form
showing your apex even when Synapse actually lives at `matrix.example.com`.

```bash
# Docker
docker run -e DEFAULT_HOMESERVER=example.com \
  -p 8080:80 ghcr.io/krisamin/matrix-client:latest

# Helm (chart in charts/matrix-client)
helm install my-chat ./charts/matrix-client \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=chat.example.com \
  --set config.defaultHomeserver=example.com
```

Both default to the `latest` tag, which tracks `main`. There are no semver
releases yet, so pin the short commit SHA if you want reproducible deploys —
every push to `main` publishes one (e.g. `7882c3e`):

```bash
helm install my-chat ./charts/matrix-client \
  --set image.tag=7882c3e \
  --set config.defaultHomeserver=example.com
```

Running with `readOnlyRootFilesystem: true` is supported — the entrypoint
writes its config under `/run` (the chart mounts an `emptyDir` there) instead
of the read-only html directory.

After touching the Dockerfile, nginx config, or the entrypoint, run the
container-level check — the unit tests can't see this layer:

```bash
scripts/verify-runtime-config.sh
```

It builds the image and asserts that `DEFAULT_HOMESERVER` actually reaches the
browser, that an unset value degrades to a plain 404 (not an HTML page served
as JavaScript), that the app still boots under `readOnlyRootFilesystem`, and
that `gzip_static` still fires. Every one of those has broken silently before.

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
