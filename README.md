# matrix-client

A clean, opinionated [Matrix](https://matrix.org) chat client.

Self-hosted, OIDC-first, end-to-end encrypted by default. Built as a single
React Router v7 app with [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk)
on Rust crypto.

## Features

- **OIDC (MAS) login** with dynamic client registration — works with any homeserver
  that exposes `m.authentication`.
- **End-to-end encryption** via Rust crypto (`initRustCrypto` + IndexedDB).
- **Cross-signing & key backup** (SAS verify, key backup restore from secret storage).
- **DMs / Rooms / Spaces** with full Space hierarchy navigation.
- **Threads, edits, replies, reactions, redactions, pins, forwards, mentions.**
- **Per-room search** (server-side for plaintext rooms, client-side for E2EE).
- **PWA** with native window controls overlay (macOS/Windows installable app).
- **Tri-lingual UI** (Korean / English / Japanese) with browser auto-detect + override.

## Stack

- React Router v7 (SSR + client islands)
- TypeScript, Tailwind CSS v4, Biome
- matrix-js-sdk + matrix-rust-sdk-crypto-wasm
- Bun (package manager + dev server)

## Getting started

```bash
bun install
bun run dev          # http://localhost:5173
bun run build        # production build
bun run typecheck    # tsc --noEmit
bun run lint         # biome check
```

> **Bun only.** Do not use `npm`/`yarn` — `package-lock.json` will conflict with `bun.lock`.

### Configuration

The login screen accepts any homeserver URL that exposes OIDC discovery
(`/.well-known/matrix/client` → `m.authentication`). The default points at
`https://matrix.krisam.in`; change it on the login page or hardcode in
`app/routes/login.tsx`.

## Project layout

```
app/
  components/    # UI components (Modal, Form, Sidebar, EventLine, …)
  hooks/         # React hooks (useRoomTimeline, useUserSearch, …)
  i18n/          # ko / en / ja dictionaries (1:1 keys, ko is master)
  lib/           # SDK wrappers, helpers (matrix.ts, mention.ts, locale.ts, …)
  routes/        # React Router v7 routes (room, login, verify, oidc/callback)
  app.css        # Tailwind base + tokens
  root.tsx
```

### Design system

Single-tier token system (`bg-bg-0..3`, `border-line[-strong]`, `fg-0..3`).
Modals share a small primitive set:

- `Modal / ModalHeader / ModalFooter` — backdrop + box + esc/click-out
- `Field / FieldGroup / TextInput / Select / TextArea` — form rows with
  prefix/suffix slots, padding lives on the input itself (row is fully
  clickable).
- `SectionHeader` — uppercase tracking band, optional onClick (for
  collapsible sections), optional right-aligned `actions`.
- `MenuItem` — icon + label + meta row (Sidebar / settings / context menus).

All form rows follow B-final tone:
`label: w-24 pl-5` + `input: py-2.5 pl-3 pr-5` + `divide-y` between rows.

## License

MIT
