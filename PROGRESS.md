# PROGRESS — MasterHand

Project status: what is done, in progress, pending, and the changelog. Updated **when each task finishes** (see rules in `AGENTS.md`).

**Last updated:** 2026-09-28

## Overall status

| Field | Value |
|---|---|
| Current phase | Phase 3 completed. Deployment artifacts verified ready to launch. Phase 4 (public release polish) deferred; Phase 5 (host deployment/hardening) intentionally out of scope |
| Code | BFF (cookie + device tokens), web, Electron shell and React Native app; 147 unit tests with an 80% coverage gate + 2 E2E green; Docker Compose stack re-verified (build, health, opencode auth) and smoke-tested; mobile bundle exported with Metro |
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
- Full visual diffs and dev-server previews
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
- **2026-09-28** — **Searchable selectors (web + mobile).** Replaced the native `<select>`s in the web composer with a new `SearchSelect` component: it previews a few options (6, with the active one pinned first), adds a search bar over the full list and a "Show all N" expander, and stacks full-width on mobile (no horizontal overflow). It now drives the agent, model and effort selectors. On mobile, `ChoiceModal` gains a search field when a list is long. Added an E2E spec (`model-select.spec.ts`) and expanded the mock providers to nine models. 3 E2E green.
