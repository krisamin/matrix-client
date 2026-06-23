# Changelog

All notable changes to this project will be documented in this file. The
format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Authentication.** Login screen now auto-discovers homeserver capabilities
  (`.well-known/matrix/client`, `m.authentication`, `loginFlows`) and renders
  the matching UI:
  - **OIDC** (matrix-authentication-service) with dynamic client registration
    and PKCE.
  - **Password** flow with username, MXID (`@user:server`), or email
    identifier (3PID via `m.id.thirdparty`).
  - **Sign-up** for homeservers that allow open registration via
    `m.login.dummy` UIA stage; servers requiring CAPTCHA / email verification
    are detected and surfaced with a helpful message.
- **Toast notifications** (`components/Toast.tsx`). Connection issues, device
  verification, and notification permission prompts now appear as dismissible
  cards in the lower-left corner instead of taking horizontal space at the
  top.
- **Docker / Helm.** Static SPA shipped via `nginx:alpine`. Helm chart in
  `charts/matrix-client/` with Ingress, security context, and `postStart`
  homeserver-default rewrite.
- **CI.** GitHub Actions workflows for lint/typecheck/build, multi-arch
  Docker build pushed to GHCR, and Helm chart lint + template render.

### Changed
- **Design system.** Modal/Form primitives (`Modal`, `Field`, `TextInput`,
  `Select`, `SectionHeader`, `MenuItem`) drive all dialogs. Background tokens
  (`bg-bg-0..3`), border tokens (`border-line[-strong]`), and B-final row
  rhythm (`label w-24 pl-5` + `input py-2.5 pl-3 pr-5` + `divide-y`) are
  consistent across NewRoom, NewSpace, NewDm, RoomSettings, AppSettings,
  ProfileEdit, RoomInfoPane, SpaceView, and SearchPane.
- **i18n.** ~280 keys covering Korean / English / Japanese, with browser
  auto-detect and explicit override in Settings.

### Removed
- Legacy `gray-300/700`, `blue-600`, `bg-bg-2/40` shade leftovers.
- Top horizontal banner stack — replaced with the toast pattern.

## [0.1.0] — initial public release

First public version. The app feature set covers:

- DMs, rooms, and Spaces with hierarchy navigation
- Threads, edits, replies, reactions, redactions, pins, forwards
- Mentions with `@user` autocomplete + matrix.to fallback
- Per-room search (server for plaintext, client for E2EE)
- File / image / video upload + URL preview
- Read receipts, typing indicators
- PWA with native window controls overlay
- E2EE via Rust crypto + cross-signing + key backup restore
