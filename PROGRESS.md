# PROGRESS — MasterHand

Project status: what is done, in progress, pending, and the changelog. Updated **when each task finishes** (see rules in `AGENTS.md`).

**Last updated:** 2026-10-01

## Overall status

| Field | Value |
|---|---|
| Current phase | Phase 3 completed. Deployment artifacts verified ready to launch. Phase 4 (public release polish) deferred; Phase 5 (host deployment/hardening) intentionally out of scope |
| Code | BFF (cookie + device tokens), web, Electron shell and React Native app; isolated sessions (git worktrees) with Finish & PR; session previews (Cloudflare quick tunnels) in web, desktop and mobile; 262 unit tests with an 80% coverage gate + 18 E2E green; Docker Compose stack re-verified (build, health, opencode auth) and smoke-tested; mobile bundle exported with Metro |
| Workflow | Git hooks (typecheck/unit on commit, full gate on push), Playwright E2E with a mocked opencode, GitHub Actions CI and PR template. See `WORKFLOW.md` |
| Documentation | Full English baseline ✅; `docs/bff/api.md` and `docs/runbooks/deployment.md` updated to the multi-platform design |
| Current blocker | None. Real-device verification (iOS/Android) and Electron packaging require a local GUI environment |

## Foundations (documentation) — ✅ Completed

- [x] Technical plan and security strategy
- [x] `AGENTS.md`, `SPEC.md`, `ARCHITECTURE.md`, `PROGRESS.md`, `CONTRIBUTING.md`, `LICENSE`
- [x] `docs/` — index, verified opencode reference, BFF API and deployment runbook
- [x] SSE event type verification against opencode's `types.gen.ts`
- [x] Re-architecture to multi-platform clients (web + Electron + React Native), no PWA, TLS left to the deployer, English docs

## Phase 0 — Host base — ⬜ Pending

- [ ] Host with Docker + Docker Compose installed (provider-agnostic)
- [ ] DNS for the deployer's domain → host IP
- [ ] Non-root user, SSH keys only, root disabled
- [ ] Host firewall (reverse-proxy port + SSH) + fail2ban
- [ ] **Verification:** `docker run --rm hello-world` and DNS resolves to the host IP

## Phase 1 — BFF (`apps/server`) — ✅ Completed

- [x] Monorepo scaffolding with npm workspaces
- [x] Dockerfiles + `deploy/docker-compose.yml` + `.env.example`
- [x] Login/logout with a signed cookie + rate limit + origin check
- [x] Proxy `/api/oc/*` → opencode (injects basic auth, SSE without buffering)
- [x] SSE relay `/api/events` (single hub with reconnection and backoff)
- [x] SQLite persistence
- [x] Tests with vitest and a mocked upstream
- [x] Docker images built and smoke-tested; `docker compose config` validated
- [ ] Provider authentication in the opencode container (manual action on the host: `docker compose run --rm opencode auth login`)

## Phase 2 — Web core (`apps/web`) — ✅ Completed

- [x] Web scaffolding (Vite + React 19 + TS + Tailwind v4)
- [x] Login + mobile-first layout (list and chat on mobile; two panels on desktop)
- [x] Session list with state (idle/busy) and creation from the UI
- [x] Session view: history and Part rendering (text, reasoning, tool calls)
- [x] Composer: text + agent and model selectors + effort variants
- [x] Live streaming via `message.part.updated` (delta/snapshot merge)
- [x] Multi-project real time with client self-recovery (watchdog, reconnection, fallback polling)
- [x] Permission modal with response (once / always / reject)
- [x] E2E with Playwright against a mocked opencode (pre-re-architecture; see Phase 3)

## Phase 3 — `client-core` + desktop and mobile clients — ✅ Completed

- [x] `packages/client-core`: typed client, TanStack Query hooks, SSE stream, shared event handler, chat/model helpers
- [x] Web migrated to `client-core` (all UI strings in English; PWA metadata removed)
- [x] BFF: `Authorization: Bearer` support, `POST /api/devices`, `GET /api/devices`, `DELETE /api/devices/:id`; push code removed
- [x] `apps/desktop`: Electron shell with hardened renderer and origin-locked navigation (`MASTERHAND_URL`)
- [x] `apps/mobile`: Expo app (login with device token, sessions, chat with streaming, permission modal, secure storage)
- [x] Mobile bundle verified with `expo export` (Metro resolves `client-core`)
- [x] Spanish code comments and user-facing strings translated to English
- [ ] Manual verification on iOS/Android devices and Electron packaging (`electron-builder`) — requires a GUI environment

## Post-MVP — Session previews — ✅ Completed

- [x] BFF: fixed preview port per session (`preview_ports` table), configurable via `PREVIEW_PORT_RANGE` (plus `PREVIEW_ENABLED`, `PREVIEW_ORIGIN`, `CLOUDFLARED_BIN`)
- [x] BFF: `cloudflared` quick-tunnel manager with explicit Start/Stop, TCP reachability probe, URL capture, and cleanup on session delete/workspace delete/shutdown
- [x] BFF: per-prompt `system` injection of the reserved port (append semantics verified against opencode v1.18.34)
- [x] `client-core`: `PreviewStatus` types, `preview`/`startPreview`/`stopPreview` client methods, `usePreview` hook
- [x] Web/desktop preview panel (sandboxed iframe, Start/Stop, open in new tab) and mobile preview modal (`react-native-webview`)
- [x] Deploy: `cloudflared` bundled in the server image; Compose publishes `PREVIEW_ORIGIN=opencode`; `.env.example` documents the public/ephemeral tradeoff
- [x] Tests: unit coverage for the manager, proxy injection, config and store; E2E spec driven by a fake `cloudflared` binary

## Testing & workflow — ✅ Completed

- [x] `WORKFLOW.md`: one feature per branch/PR, gates, squash merge to `main`
- [x] Git hooks (`.githooks`): `pre-commit` (typecheck + unit), `commit-msg` (Conventional Commits), `pre-push` (full gate)
- [x] E2E workspace `e2e/` with Playwright: mocked `opencode serve` + BFF serving the built web app
- [x] E2E specs: invalid login and login → new session → prompt → live stream → permission approval
- [x] GitHub Actions CI (typecheck + unit/coverage + E2E + build) and PR template
- [x] `npm run prepare` wires `core.hooksPath` automatically on install
- [x] Coverage: vitest v8 with an 80% threshold (lines/statements/branches/functions) on `apps/server` and `packages/client-core`; `npm run test:coverage`; enforced in hooks and CI with `lcov` artifacts
- [x] Filled test gaps: `parseSseStream`, `EventHub`, `config`, token/rate-limiter units, `client` error paths, `createEventHandler`/`invalidateOnReconnect`, chat message helpers, and React query hooks via `renderHook` (RTL + jsdom, `client-core` only)

## Phase 4 — Open-source readiness — ⏸️ Deferred

Deferred by the maintainer; revisit before a public release.

- [x] MIT license (`ToguDV`), `CONTRIBUTING.md` with Conventional Commits
- [x] Hardcoded domain and bundled Caddy removed from docs, deploy and env files
- [x] Generic `.env.example` (`MASTERHAND_BIND`, `MASTERHAND_PORT`, `ALLOWED_ORIGINS`)
- [x] Workflow, git hooks, E2E harness and CI (`.github/workflows/ci.yml`)
- [ ] First public release: versioning, screenshots, issue/PR templates (PR template done)

## Phase 5 — Deployment + hardening — 🚫 Out of scope

Running the actual host and hardening it is deliberately **not** part of this
project: whoever deploys it decides provider, TLS and hardening. The repo only
needs to be **deploy-ready**, which is done (Docker Compose stack + deployment
runbook, both verified). These items stay as a checklist for the deployer, not
as project tasks:

- [x] Documented reverse-proxy/TLS examples and host checklist (runbook exists)
- [ ] Deployer: restrictive agent permissions in `opencode.json` (`bash: ask`)
- [ ] Deployer: scheduled backups of volumes (`masterhand_data`, `opencode_data`, `opencode_config`)
- [ ] Deployer: upgrade plan (pinned opencode, `docker compose build && docker compose up -d`)
- [ ] Deployer: external scan (only the proxy port + SSH) + end-to-end demo from a mobile network (`SPEC.md` §8)

## Open decisions

None blocking. Resolved: **npm workspaces**, session/device token TTL configurable with `SESSION_TTL_HOURS`, **custom opencode image with a pinned version** (`OPENCODE_VERSION`), **MIT license**, **Conventional Commits**, **shared `client-core` + per-platform UI**, **device tokens for native**, **desktop loads the deployed web app**.

## Post-MVP backlog

- Native push notifications (FCM/APNs)
- TOTP / two-factor authentication
- Automated E2E suite (Playwright) against a mocked opencode in the repo
- Terminal in the browser (`pty.*` events already exist in the API)
- Full visual diffs
- Multi-run, session goals, scheduled tasks
- Stricter agent sandbox (resource limits, restricted network)
- Multi-user (only if the instance is ever shared)
- Light/dark theme and localization

## Changelog

- **2026-09-27** — Technical plan defined: BFF over `opencode serve`, MVP scope and security strategy. SSE event types verified. Base documentation created.
- **2026-09-27** — Domain and deployment defined (Docker Compose). Updated docs; added `README.md`, `.gitignore` and git repository initialization.
- **2026-09-27** — **Phase 1 completed.** npm workspaces scaffolding. BFF Node 22 + Hono: signed-cookie auth with rate limit and origin checks, `/api/oc/*` proxy with injected basic auth, SSE hub with reconnection, SQLite store. Minimal frontend. 21 tests. Docker images built and verified.
- **2026-09-27** — **Phase 2 completed.** Chat UI: sessions, conversation view, composer with agent/model selectors, live SSE streaming, permission modal, reconnection. 32 tests. Playwright E2E against a mocked opencode.
- **2026-09-27** — **Effort selector (model variants)** verified against opencode 1.18.32; composer third selector; 43 tests.
- **2026-09-27** — **Multi-project real-time fix**: hub moved to `/global/event`; client self-recovery (watchdog, reconnect, polling). 47 tests.
- **2026-09-27** — **Architecture change to multi-platform clients** (docs-first iteration): web + Electron + React Native, shared `client-core`, no PWA, no bundled Caddy, cookie + Bearer auth, in-app notifications only. All documentation translated to English; added `LICENSE` (MIT, ToguDV), `CONTRIBUTING.md` and `docs/runbooks/deployment.md`.
- **2026-09-27** — **Phase 3 completed (code).** Extracted `packages/client-core` (typed client, query hooks, SSE stream, event handler, chat/model helpers). Migrated the web app to it; removed PWA metadata and translated the UI to English. BFF now accepts device Bearer tokens (`POST/GET /api/devices`, `DELETE /api/devices/:id`), keeps cookie auth for web/desktop, exempts Bearer requests from CSRF origin checks and drops all web-push code and dependencies. Added `apps/desktop` (Electron shell with origin-locked navigation) and `apps/mobile` (Expo app with login, sessions, chat, permissions and `expo/fetch` streaming). `deploy/` updated: no Caddy, BFF port published with `MASTERHAND_BIND`/`MASTERHAND_PORT`, Dockerfile installs only server/web workspaces. Verified: 56 tests green, typecheck across all workspaces, web/server/desktop builds, Docker image built and smoke-tested (`/api/health`, web, device login), mobile bundle exported with Metro.
- **2026-09-27** — **Code minimalism policy.** Added the YAGNI ladder to `AGENTS.md` and recorded ADR-10: adopt minimalism as a written guideline, do not install the third-party `ponytail` plugin (always-on prompt injection that would conflict with documented decisions and subagent behavior).
- **2026-09-27** — **Workflow, testing infrastructure and CI.** Defined `WORKFLOW.md` (one feature per branch/PR, gates, squash merge to `main`). Added native git hooks under `.githooks` (`pre-commit`: typecheck + unit; `commit-msg`: Conventional Commits; `pre-push`: full gate) activated by the npm `prepare` script. Created the `e2e/` workspace with Playwright, a typed `mock-opencode.ts` and specs for invalid login and the full chat/permission flow (2 E2E green). Added GitHub Actions CI (typecheck + unit + E2E + build), a PR template and a root `test:e2e` script; translated `.gitignore` to English.
- **2026-09-28** — **Single-command dev stack.** Added `scripts/dev.mjs` and rewired `npm run dev:server|web|desktop|mobile` so each starts `opencode serve` (skipped when the port is already listening; `MASTERHAND_SKIP_OPENCODE=1` to force-reuse), the BFF and the requested front end together, stopping the whole group on exit or `Ctrl+C` and forwarding extra args (`npm run dev:web -- --host`). Updated `README.md` and `AGENTS.md`.
- **2026-09-28** — **Unified development and deployment environments.** Added `apps/server/.env.example` and made `npm run dev:server` load `apps/server/.env.local` automatically (`tsx watch --env-file-if-exists`). The README now separates the source-based development quick start from the Docker deployment and states that `deploy/.env` is only consumed by Docker Compose (the BFF host `opencode:4096` does not exist in development).
- **2026-09-28** — **Deploy readiness verified.** End-to-end `docker compose` smoke test on the stack: build, `GET /api/health`, opencode basic-auth enforcement (`401` without creds, `200` with) and persistence. Fixed two real deploy bugs: (1) `opencode.Dockerfile` now creates and `chown`s `/home/node/.config/opencode` and `/home/node/.local/share/opencode` so Docker initializes the named volumes as `node` (previously `auth login` and normal operation failed with `EACCES`); (2) removed `env_file: .env` from the opencode service so BFF secrets (`MASTERHAND_PASSWORD`, `SESSION_SECRET`) no longer leak into the opencode container — it now receives only `OPENCODE_SERVER_PASSWORD`/`OPENCODE_SERVER_USERNAME`. Phase 5 (host deployment/hardening) recorded as out of scope and Phase 4 (public release polish) deferred; the repo stays deploy-ready.
- **2026-09-27** — **Coverage gate and test hardening.** Added `@vitest/coverage-v8` to `apps/server` and `packages/client-core` with an 80% threshold on lines/statements/branches/functions, plus `test:coverage` scripts (root + workspaces) and a CI/hook gate that uploads `lcov` artifacts. Scope excludes entry points and type-only modules; `apps/web`/`mobile`/`desktop` stay out of the metric (covered by E2E). New tests: SSE parser (`parseSseStream`, both copies), `EventHub` (reconnect/backoff/listeners/auth header), `loadConfig`, token/rate-limiter units, `/api/status` health, device-body and origin edge cases, the full `client` route map plus network/error paths, `createEventHandler`/`invalidateOnReconnect`, chat helpers (`messageText`, `isStreaming`, `hasVisibleParts`, `toolTitle`, `formatRelative`), and the React query hooks via `@testing-library/react` `renderHook` under jsdom (adopted for hooks only). Server 96.3/92.8/100/97.8, client-core 98.8/87.7/100/100. 147 unit tests + 2 E2E green.
- **2026-09-28** — **`npm run dev:stop`.** A plain `Ctrl+C` only stops what the current `dev.mjs` run started: it deliberately spawns children detached and reuses an already-listening `opencode`, so a leftover/orphaned `opencode serve` (it re-parents into its own session) survives and keeps ports busy. Added `scripts/stop.mjs` (`dev:stop`): it stops the orchestrator, the repo's Vite/tsx/Expo/Electron binaries and whatever listens on the opencode/BFF ports, excluding its own process tree, with SIGTERM then SIGKILL. Verified end-to-end; README/AGENTS updated.
- **2026-09-28** — **Last used model as default.** opencode persists the `model` (and `agent`) per session and returns it from `GET /session`; there is no global "last used" endpoint, so clients derive it from the most recently updated session instead of duplicating storage. Added `sessionModelValue`/`recentModelValue` and a `preferred` argument to `defaultModelValue` in `client-core` (plus unit tests), augmented the SDK `Session` type with the runtime fields, and wired both composers to preselect the active session's model, falling back to the most recent one, then to the config default. New E2E spec proves the remembered model is applied to a new session.
- **2026-09-28** — **Searchable selectors (web + mobile).** Replaced the native `<select>`s in the web composer with a new `SearchSelect` component: it previews a few options (6, with the active one pinned first), adds a search bar over the full list and a "Show all N" expander, and stacks full-width on mobile (no horizontal overflow). It now drives the agent, model and effort selectors. On mobile, `ChoiceModal` gains a search field when a list is long. Added an E2E spec (`model-select.spec.ts`) and expanded the mock providers to nine models. 3 E2E green.
- **2026-09-29** — **Workspaces + session/workspace deletion (web).** Added a MasterHand-side workspace registry: `workspaces` table in SQLite (`store.ts`), `GET/POST/DELETE /api/workspaces` (absolute-path validation, optional `WORKSPACES_ROOT` containment, `409` on duplicates), and the `x-opencode-directory` header to the proxy whitelist. `client-core` now mirrors the SDK directory override (query on GET, header on mutations), adds a `workspaces` API namespace, directory-aware session calls and `useWorkspaces`/scoped session query keys. Web gains a workspace picker with add/remove dialogs and per-session delete (with confirmation); sessions are filtered by the selected workspace. Verified against real opencode 1.18.33 (directory create/filter, `DELETE /session/:id`). New server/client-core unit tests and a `workspaces.spec.ts` E2E (add workspace → create session → delete session → remove workspace, plus workspace scoping). Docs (`docs/bff/api.md`, `docs/opencode/http-api.md`, `ARCHITECTURE.md` ADR-11 + §4.6) and `deploy/` (`PROJECTS_ROOT`, `WORKSPACES_ROOT`) updated.
- **2026-09-29** — **Workspaces on mobile.** Follow-up to the web workspaces PR, reusing the same `client-core` directory plumbing. The Expo app now has a workspace bar and a bottom-sheet `WorkspaceModal` (select, add by absolute path, remove with a native confirmation), persists the selected workspace in SecureStore, scopes sessions to it and deletes a session from a row action (`Alert` confirmation). `ChatScreen`/`Composer` pass the workspace directory to messages, prompts, aborts and permission replies. Metro bundle verified with `expo export` (649 modules); mobile stays out of the unit-coverage gate (no native GUI in CI).
- **2026-09-29** — **Fix: silent agent errors + invalid workspace paths.** Registering a workspace whose folder does not exist (e.g. the container path `/workspace` while running in dev) made every prompt fail with a generic"the agent reported an error" banner. `POST /api/workspaces` now verifies the folder is a real directory (`404 not_found`) and the BFF mounts the projects root read-only in Compose so validation also works in Docker; the add dialogs explain the error. `client-core` now extracts the real first line of an opencode `session.error` (new `opencodeErrorMessage`, suppressing user aborts) and the web/mobile banner shows it instead of a generic message.
- **2026-09-29** — **Workspaces create isolated subfolders under one root.** Reworked the model: clients now send only a **name**, the BFF sanitizes it to a single path segment, derives `<WORKSPACES_ROOT>/<name>` and creates it with `mkdir -p`, so arbitrary existing absolute paths can no longer be registered and every project stays isolated under the root. The root defaults to `./workspace` (repo `projects/` renamed to `workspace/`; `/workspace` in Docker, now mounted read-write so the BFF can create folders) and `WORKSPACES_ROOT` is always defined. `DELETE /api/workspaces/:id?deleteFiles=1` optionally removes the folder and its files, guarded to paths inside the root (`403` otherwise) and `404` for unknown workspaces. Web gets a name-only add dialog and a remove dialog with a "also delete files from disk" checkbox; mobile's `WorkspaceModal` mirrors both. Updated `client-core` types/API, server/`client-core` unit tests, E2E specs and `playwright.config.ts`, `deploy/` (`WORKSPACES_DIR`, read-write mount), `docs/bff/api.md`, `docs/runbooks/deployment.md` and ADR-11/§4.6.
- **2026-09-29** — **Session total cost/usage near the chat.** The SDK `Session` type has no `cost`/`tokens`, so the total is derived client-side from the assistant messages that `useMessages` already loads (and keeps live via `message.updated`). Added `sessionUsage(messages)` to `client-core` (sums `cost` and `output` tokens over assistant replies) with unit tests; web `ChatView` and mobile `ChatScreen` render a compact `Session · $0.XXXX · N tok` line just above the composer when the session has cost > 0. The E2E mock now returns a non-zero cost/tokens and `chat.spec.ts` asserts the total.
- **2026-09-29** — **Dev/prod data-directory unification.** The BFF resolved its default `./data` and `./workspace` against `process.cwd()`, so `npm run dev:server` (whose cwd is `apps/server` under npm workspaces) wrote under `apps/server/` while Docker used `/workspace` and the repo root had an unused `workspace/`. `loadConfig` now anchors both defaults to the repo root (`<repo-root>/data`, `<repo-root>/workspace`) — computed from `import.meta.url`, valid from both `src/` and `dist/` — and relative env values resolve against the repo root too, so the paths no longer depend on the cwd; Docker keeps overriding them with absolute paths (`/data`, `/workspace`). Migrated the local artifacts (active `apps/server/data` promoted to `data/`, stale root DB backed up to `/tmp`, orphan `apps/server/workspace` removed), updated the `loadConfig` tests for the cwd-independent defaults and documented the new resolution in `apps/server/.env.example`, `docs/bff/api.md` and `ARCHITECTURE.md` §4.6. Verified with a live BFF smoke test: workspace created and deleted under `<repo-root>/workspace`.
- **2026-09-29** — **Fix: permission approvals were never shown against opencode 1.18.32.** The client only handled the legacy `permission.updated` event, which the pinned server (1.18.32) no longer emits — verified against a live server that the agent tool flow emits `permission.asked` with `{ id, sessionID, permission, patterns, metadata, always, tool }` and replies with `permission.replied` (`{ sessionID, requestID, reply }`); the SDK types are stale. `client-core` now models the real `Permission` shape, accepts both event names and reply payloads, and exposes `api.permissions(directory)` (`GET /permission`, per-instance). Since SSE never replays, web and mobile reconcile pending requests on (re)connect and when workspaces load, so an approval asked while offline or before a reload is recovered instead of leaving the agent silently blocked. Replies no longer send the active workspace's directory (the session id resolves the request) and the modal stays open on failure for retry. Updated both permission dialogs, the E2E mock (plus `GET /permission`), unit tests, a new "recovers a pending permission after a reload" E2E spec, `docs/opencode/{events,http-api}.md`, `docs/bff/api.md` and `ARCHITECTURE.md` §4.2/§4.4/§4.5. Verified: 191 unit tests + 8 E2E green, typecheck and build across workspaces.
- **2026-09-29** — **Custom subagent visualization (web + mobile).** Subagent runs (opencode's `task` tool, plus `subtask` parts) previously fell into the generic tool card and showed a plain `task` label. Added `isTaskTool`, `subagentInfo` and `subagentOutput` to `client-core`: they normalize the tool input (`subagent_type`, `description`, `prompt`), the child `metadata.sessionId` and the running-in-background flag, and strip the `<task>`/`<summary>`/`<task_result>` wrapper from the output (with unit tests). Web `MessageContent` and mobile `MessageBubble` now render a dedicated indigo "Subagent" card — agent name, description, status dot and background badge — with an expandable prompt/result body and an "Open session" action that navigates to the child session; `subtask` parts get the same card. `onOpenSession` is threaded from both `App` roots through the chat views. While viewing a subagent session (a session with `parentID`), a floating "← Back to main agent" control (top-center on web, top-center overlay on mobile) returns to the parent. New E2E spec (`subagent.spec.ts`) backed by a mock that spawns a child session and a completed `task` part, and asserts the drill-in and the floating return.
- **2026-09-29** — **Per-session auto-accept of permission requests.** Added an `Auto-accept` toggle next to the composer (web + mobile) that, for the sessions where it is enabled, answers incoming `permission.asked` automatically with `once` and drains the queue on (re)connect (covering recovered requests). It is reversible (no rule persisted in opencode), scoped per session and stored client-side (`masterhand.autoAcceptSessions` in `localStorage` on web, SecureStore on mobile). Both `App` handlers use refs so the memoized event handler stays current without resubscribing the stream, with an in-flight guard to avoid double answers. New E2E spec proves a configured session never shows the modal while another session still does. `ARCHITECTURE.md` §4.2 updated. Verified: 10 E2E green.
- **2026-09-29** — **Isolated sessions (git worktrees).** Agents sharing a workspace no longer overwrite each other: an opt-in "Isolated" session runs in its own git worktree and branch, owned by the BFF and addressed through opencode's `directory` override (ADR-12, `ARCHITECTURE.md` §4.7). Server: `worktrees.ts` (git CLI wrapper with injectable runners: init/ensure repo, add/remove/prune, commit, remote/push, `gh`/`glab` PR or compare URL), `isolated_sessions` table in SQLite, endpoints `POST|GET /api/workspaces/:id/sessions`, `GET /api/workspaces/:id/directories`, `DELETE /api/workspaces/:id/sessions/:sessionID` and `POST /api/isolated-sessions/:sessionID/finish`, plus startup reconciliation of stale records/orphan worktrees. Worktrees live at `<WORKSPACES_ROOT>/.worktrees/<workspace>/<token>` (shared mount, outside the repo); workspaces are `git init`-ed with an empty commit when needed. `client-core`: `api.sessions.*` (list/create/remove/finish/directories), `SessionIsolation` type, `filterSessions`/`sessionDirectory` helpers, `useSessionDirectories` and workspace-scoped session keys. Web and mobile: isolated toggle at creation, branch badge per session, All/Isolated/Standard filter, worktree bar with an explicit **Finish & PR** action (commit always; push + PR when a remote and `gh`/`glab` exist, else compare URL), and permission reconciliation across worktree directories. Deploy: `git` + `gh` in the BFF image, `WORKTREES_ROOT`/`GIT_COMMIT_*` env, credential instructions in the runbook. Verified: 231 unit tests, coverage gate green, 14 E2E green (new `isolated.spec.ts`), typecheck and build across workspaces.
- **2026-09-30** — **Per-session composer selections (agent, model, effort).** The agent, model and effort (`variant`) chosen in the composer are now remembered **per session**, mirroring the auto-accept preference: stored client-side (`masterhand.sessionPreferences` in `localStorage` on web, SecureStore on mobile) and restored when the session is reopened or the app reloads. New sessions still fall back to the last used model, and stale stored values are validated against the available agents/models before being applied. Web's per-session view remounts on switch; mobile keys the `Composer` by session and loads asynchronously. `ARCHITECTURE.md` §4.1 updated. New E2E spec proves the selections survive a reload and stay scoped to their session.
- **2026-09-30** — **Security fix: SSRF in the opencode proxy + login rate-limit bypass.** A pentest (`H-1`, `H-2`) found two exploitable issues. (1) The proxy built its upstream URL with `new URL(path, opencodeUrl)`, so a path like `/api/oc//host/x` was read as a protocol-relative URL and the BFF made authenticated (with `Authorization: Basic <OPENCODE_SERVER_PASSWORD>`) requests to an arbitrary host, leaking the opencode credential — it now keeps the upstream origin fixed and only replaces `pathname`. (2) The login/device rate limiter keyed on the leftmost `X-Forwarded-For` value, which the client controls, enabling brute force by header rotation — it now uses the real socket peer address via `getConnInfo`. Added regression tests (SSRF host pinning, XFF rotation still hits `429`).
- **2026-09-30** — **Fix: flaky `isolated.spec.ts` on repeated local E2E runs.** The mock opencode seeded its id counter at 0 every run (`e2e/mock-opencode.ts`), while the BFF reuses a persistent `DATA_DIR` (`/tmp/masterhand-e2e`) locally, so the first isolated test recreated `ses_1` and hit `UNIQUE constraint failed: isolated_sessions.session_id` (a `500 isolation_failed` and a timeout waiting for the composer). The counter is now seeded from `Date.now()`, so session ids stay unique across runs regardless of reused state. Verified with three consecutive `test:e2e` runs sharing the same persistent `DATA_DIR`, all 17 E2E green.
- **2026-10-01** — **Session previews via Cloudflare quick tunnels.** Any web project the agent runs can now be previewed from web, desktop and mobile without publishing ports. The BFF reserves a **fixed port per session** from the configurable `PREVIEW_PORT_RANGE` (persisted in a new `preview_ports` table, recycled when the pool drains) and appends a per-prompt `system` instruction telling the agent to bind its dev server to `0.0.0.0:<port>` (opencode merges `system` into the system prompt; verified against v1.18.34). `preview.ts` spawns `cloudflared tunnel --no-autoupdate --url http://<PREVIEW_ORIGIN>:<port>` on an explicit Start, probes the port over TCP first (`409 preview_not_running` when nothing listens), captures the random `https://*.trycloudflare.com` URL from its output and kills the process on Stop, session deletion, workspace deletion or shutdown. New routes `GET|POST|DELETE /api/sessions/:sessionID/preview` plus `preview: { enabled, available, portRange }` on `/api/status`; `PREVIEW_ENABLED`, `PREVIEW_ORIGIN`, `PREVIEW_PORT_RANGE` and `CLOUDFLARED_BIN` configure it. `client-core` gains `PreviewStatus`, the three client methods and `usePreview`. Web/desktop add a preview panel (sandboxed iframe, port badge, Open ↗, Start/Stop) and mobile a full-screen `react-native-webview` modal. The `masterhand` image bundles a pinned `cloudflared` (build arg `CLOUDFLARED_VERSION`) and Compose sets `PREVIEW_ORIGIN=opencode`, so the tunnel targets the dev server inside the opencode container over the internal network with outbound Internet only; `.env.example` documents that quick tunnels are public and ephemeral (testing only). Docs: `SPEC.md` FR-10 (out of the MVP out-of-scope list), `ARCHITECTURE.md` §4.8 + ADR-13/14 + risk row, `docs/bff/api.md` endpoints/env/prompt-injection note. Verified: 262 unit tests, coverage gate green, 18 E2E green (new `preview.spec.ts` driven by `e2e/fake-cloudflared.sh` and a fake dev-server listener in the mock), typecheck and build across all workspaces.
- **2026-10-01** — **Fix: dev servers behind the preview tunnel returned `403`.** Vite (and other dev servers) reject requests whose `Host` is the random `*.trycloudflare.com` hostname (`server.allowedHosts`: *"Blocked request. This host is not allowed"*). The tunnel now starts with `--http-host-header localhost:<port>`, so the origin always sees an allowed host without touching the project's config, and the injected prompt also warns the agent to allow tunnel hosts when the framework checks origins (e.g. Vite `allowedHosts`, Next.js `allowedDevOrigins`). The preview toggle is now shown even when `cloudflared` is missing, with an explanatory message instead of silently disappearing. Also hardened the E2E mock (clean SIGTERM shutdown, non-fatal busy preview port) after an `EADDRINUSE` flake. Verified: 153 server unit tests, 18 E2E green across repeated runs, and a live quick tunnel serving the Vite app with `200`.
- **2026-10-01** — **Fix: CI E2E failed on a busy preview port.** GitHub's runner already had `127.0.0.1:32950` in use, so the mock's dedicated fake dev-server listener hit `EADDRINUSE`, the BFF's reachability probe failed and `Start` returned `409` (`preview_not_running`). The E2E harness now reuses the mock's own port (`4097`) as the session's preview port (`PREVIEW_PORT_RANGE=4097-4097`), removing the second hardcoded port entirely, and the BFF only reports `running` after the tunnel URL answers (skipped in E2E with `PREVIEW_READINESS_MS=0`).
