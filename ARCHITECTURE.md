# ARCHITECTURE — MasterHand

Technical design. For scope and requirements see `SPEC.md`; for status see `PROGRESS.md`.

## 1. Overview

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Web         │  │  Desktop     │  │  Mobile      │
│  React 19    │  │  Electron    │  │  React Native│
│  + Vite      │  │  (web build) │  │  (Expo)      │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │ HTTPS — TLS provided by the deployer
                         │ (Caddy / Nginx / Traefik / tunnel / ...)
                  ┌──────▼───────┐
                  │  MasterHand  │  Node 22 + Hono — apps/server
                  │  BFF         │  · login: signed cookie (web) / token (native)
                  │              │  · proxy /api/oc/* → opencode (injects basic auth)
                  │              │  · SSE relay /api/events
                  │              │  · SQLite (devices/tokens)
                  └────┬─────────┘
                       │ SSE /global/event (permanent connection)
                       ▼
                  ┌──────────────┐
                  │ opencode     │  4096 (internal network only)
                  │ serve        │  OPENCODE_SERVER_PASSWORD
                  └──────┬───────┘
                         ▼
             Model providers · agents · MCP servers
```

> In production the BFF and opencode run as Docker containers orchestrated with Compose (see §6). TLS termination is **not** part of this repository.

**Guiding principle:** clients never talk to opencode directly. The BFF is the only bridge; it centralizes security and exposes a single origin for every platform.

## 2. Components

| Component | Location | Technology | Responsibility |
|---|---|---|---|
| Web client | `apps/web` | React 19 + Vite + TS + Tailwind | Browser UI: sessions, chat, streaming, permission modal |
| Desktop client | `apps/desktop` | Electron (main process, hardened renderer) | Thin shell that loads the BFF-served web app (`MASTERHAND_URL`, default `http://localhost:8787`) with navigation locked to that origin |
| Mobile client | `apps/mobile` | React Native + Expo | Native iOS/Android UI (login with device token, workspace picker, sessions with delete, chat, permissions) |
| `packages/client-core` | TypeScript (framework-agnostic + React hooks) | API client, TanStack Query hooks, SSE handling, auth adapters, generated opencode types |
| BFF | `apps/server` | Node 22 + Hono (`@hono/node-server`) | Auth (cookie + token), proxy to opencode, SSE relay, device/token storage, rate limit |
| Agent engine | `opencode` container | `opencode serve` (pinned version) | Runs agents and tools; OpenAPI 3.1 + SSE; data on volumes |
| TLS / reverse proxy | Deployer-owned | Any | TLS termination and security headers; out of the repository's scope |
| BFF persistence | `masterhand` container | SQLite (better-sqlite3) | Device/token records; minimal config |
| Orchestration | Host | Docker Compose | Brings up BFF + opencode, internal network, volumes, auto-restart |

## 3. Stack and rationale

| Layer | Choice | Rationale |
|---|---|---|
| Web UI | React 19 + Vite + TS | Ecosystem, fast iteration |
| Mobile UI | React Native + Expo | One language across platforms, native distribution |
| Desktop | Electron loading the deployed web app | Reuses the whole web UI with minimal extra code; keeps cookies same-origin |
| Shared logic | `packages/client-core` | One API/query/SSE layer reused by all clients; platform UI stays free |
| UI styling | Tailwind v4 (web) / RN primitives (mobile) | Mobile-first, no lock-in |
| API client | `@opencode-ai/sdk` pointed at the BFF proxy | Generated types from opencode's OpenAPI; the BFF injects auth |
| State | TanStack Query | Event-driven server cache (SSE → `setQueryData`); works on web and React Native |
| BFF | Node 22 + Hono | Lightweight `streamSSE` and proxying |
| Auth | Signed HttpOnly cookie (web) + signed Bearer token (native) | Best fit per platform; single signing secret |
| Persistence | SQLite | Real persistence without extra infrastructure |
| Deploy | Docker Compose | Reproducible, one command; TLS stays with the deployer |

## 4. Main flows

### 4.1 Prompt submission and streaming

1. The client sends `POST /api/oc/session/:id/prompt_async` through the BFF (which adds opencode's basic auth). The body may include `model`, `agent` and `variant` (model variant = reasoning effort, e.g. `low`/`high`/`max`).
2. opencode returns `204` and runs the agent.
3. The BFF keeps a permanent SSE connection to opencode's `GET /global/event` (all projects; unwraps the `{ directory, project, payload }` envelope and drops `sync` events) and re-emits it on the BFF's `GET /api/events`.
4. The client listens for `message.part.updated` (`{ part, delta? }`) and renders live streaming.
5. When the turn ends, opencode emits `session.idle` (`{ sessionID }`).

### 4.2 Permission approvals

1. The agent requests permission → `permission.updated` event with `properties: Permission` (`id`, `type`, `pattern?`, `sessionID`, `messageID`, `callID?`, `title`, `metadata`, `time.created`).
2. The client shows a modal with the context.
3. The user answers → `POST /api/oc/session/:id/permissions/:permissionID` with `{ response, remember? }`.
4. opencode emits `permission.replied` (`{ sessionID, permissionID, response }`) and all devices sync.

### 4.3 Authentication (single user, multiple devices)

- **Web / desktop (`apps/web`, `apps/desktop`)**: `POST /api/login` validates the password and sets a signed `HttpOnly`, `Secure`, `SameSite=Strict` cookie. The password never reaches the client code.
- **Mobile (`apps/mobile`)**: `POST /api/devices` validates the same password and returns a signed Bearer token plus a device record. The app stores the token in secure storage (Expo SecureStore) and sends `Authorization: Bearer <token>` on every request.
- The BFF accepts either credential on protected routes. Both are signed with `SESSION_SECRET` and share the TTL configured by `SESSION_TTL_HOURS`.
- Device records live in SQLite (`GET /api/devices`, `DELETE /api/devices/:id`); multiple devices may be signed in at once for the same single user.
- Origin checks apply only to cookie-based mutations; Bearer requests are exempt (tokens are never attached automatically by browsers, so there is no CSRF risk).

### 4.4 Notifications (in-app)

- The BFF's SSE relay drives in-app notifications in every client: `session.idle`, `permission.updated` and `session.error` update a badge/indicator.
- Tapping a notification opens the corresponding session.
- Native push (FCM/APNs) is out of scope for the MVP and listed in the backlog.

### 4.5 Reconnection (mobile / background)

- SSE does not guarantee event replay.
- On reconnect (or when returning from background), clients refetch `GET /session/:id/message` and deduplicate by `part.id`.
- `message.part.updated` is applied with a merge by `part.id`: if the incoming text matches the local text, `delta` is appended; if a full snapshot arrives, it replaces (supports both server modes).
- Client inactivity watchdog (60s without bytes → forced reconnect), reconnect when the tab/app becomes visible (`visibilitychange`) and when the network returns (`online`).
- On (re)connect, `sessions`, `messages` and `statuses` are invalidated to reconcile missed events.
- Fallback without SSE: connection down → polling (messages every 5s, statuses every 4s); active turn → messages every 3s.

### 4.6 Workspaces (multiple project folders)

- A **workspace** is a project folder registered in the BFF (`workspaces` table in SQLite: `id`, `name`, `path`). Registration validates that the path is absolute and, when `WORKSPACES_ROOT` is set, that it lives under that root (the directory is mounted into the opencode container).
- Clients pick a workspace; every opencode call carries its `path` as the `directory` override (query on GET, `x-opencode-directory` header on mutations). Sessions are therefore created in and listed for the selected folder.
- Deleting a workspace only forgets it in MasterHand: **files and opencode sessions are untouched** (opencode has no project deletion). Deleting a session calls `DELETE /session/:id` with the workspace directory and removes its data.
- The BFF persists the list; the filesystem and project data remain owned by opencode.

## 5. Security model

| Layer | Measure |
|---|---|
| Network | Only the deployer's reverse-proxy port (and SSH) is public; BFF and opencode publish no ports, they live on the Compose internal network |
| Auth | Single password → signed cookie (web/desktop) or Bearer token (native); login rate limit; CSRF origin check on cookie mutations |
| Secrets | `OPENCODE_SERVER_PASSWORD` and API keys only in the host `.env` / volumes; never in client code |
| Agent permissions | `opencode.json` with `bash` in `ask` mode for dangerous commands → every sensitive action goes through remote approval |
| System | Unprivileged containers; opencode isolated from the public network; host firewall recommended |
| Future | TOTP, agent container/sandbox |

> Note: an agent with shell access on the host is RCE by design. The mitigation is not to remove the feature but to limit the blast radius (unprivileged user, `ask` permissions, minimal surface).

## 6. Deployment (Docker Compose)

The stack deploys with a single command (`docker compose up -d`) on any host with Docker. **TLS is the deployer's responsibility** and can be provided by any reverse proxy or tunnel; the repository does not ship a proxy configuration.

```
deploy/
├── docker-compose.yml     # masterhand (BFF) + opencode, BFF port published
├── opencode.Dockerfile     # pinned opencode + tooling (git, ripgrep, ...)
└── .env.example            # OPENCODE_SERVER_PASSWORD, MASTERHAND_PASSWORD, SESSION_SECRET, ...
```

| Service | Image | Ports | Volumes |
|---|---|---|---|
| `masterhand` | build of `apps/server` (also serves the static web build) | `${MASTERHAND_BIND:-0.0.0.0}:${MASTERHAND_PORT:-8787}` → `8787` | `masterhand_data` (SQLite) |
| `opencode` | `opencode.Dockerfile` (pinned version) | none (internal `4096`) | `opencode_config`, `opencode_data`, `./projects` |

- `restart: unless-stopped` on all services → the host restarts and the stack comes back on its own.
- The deployer points their own TLS/domain at the published BFF port and sets `ALLOWED_ORIGINS` if a different origin proxies to it. Bind to `127.0.0.1` with `MASTERHAND_BIND` when the reverse proxy runs on the host.
- Provider authentication: `docker compose run --rm opencode auth login` (persists to a volume).
- Agents work on `./projects` (bind mount) so files can be inspected/versioned from the host.
- Backups: volumes `masterhand_data`, `opencode_data` and `opencode_config`.
- Upgrade: opencode pinned; `docker compose build && docker compose up -d`.
- See `docs/runbooks/deployment.md` for concrete TLS options.

## 7. Decisions (ADR-lite)

| ID | Decision | Reason | Discarded alternatives |
|---|---|---|---|
| ADR-1 | BFF between clients and opencode | Centralizes auth, provides one origin for every platform and hides opencode's password | Direct client access with `--cors` + basic auth (exposes the password) |
| ADR-2 | Signed HttpOnly cookie for web/desktop | The password never reaches client code; own logout and rate limiting | OAuth proxy (more moving parts; viable later) |
| ADR-3 | Node 22 + Hono | Simple SSE and proxying | Bun (uncertain compatibility), Fastify/Express (more boilerplate for SSE) |
| ADR-4 | SQLite for device/token storage | Real persistence without extra infrastructure | Flat JSON (fragile), Postgres (overkill) |
| ADR-5 | Native multi-platform clients (web + Electron + React Native) instead of a PWA | Better mobile UX, native distribution and storage | PWA (superseded: rejected for this project) |
| ADR-6 | Docker Compose deployment, TLS left to the deployer | Reproducible, one command, host-independent; keeps certificates out of the repo | Bundled Caddy (forces one TLS solution), systemd native (host-dependent) |
| ADR-7 | Shared `packages/client-core` + per-platform UI | Reuses API/query/SSE logic without coupling to a rendering layer | One UI via React Native Web (rewrite + DOM limitations), fully independent clients (duplication) |
| ADR-8 | Bearer tokens for native clients, cookie for web | React Native does not handle cookies like a browser; tokens enable revocable multi-device access | Cookie-only (fragile on native), token-only everywhere (loses HttpOnly/CSRF benefits on web) |
| ADR-9 | In-app SSE notifications for the MVP; native push deferred | No APNs/FCM accounts or extra infrastructure required | Native push now (cost), Web Push (implies service worker / PWA) |
| ADR-10 | Adopt the YAGNI ladder as a written guideline in `AGENTS.md`; do not install the third-party `ponytail` plugin | Keeps the minimalism principle without an always-on external prompt that would fight documented decisions or alter subagent behavior | Installing the `ponytail` plugin (third-party supply chain, injects rules into every turn and subagent, conflicts with the spec-driven approach) |
| ADR-11 | Workspaces are a MasterHand-side registry (SQLite) of project folders; opencode is targeted per request with its `directory` override | opencode has no project-deletion endpoint, so a deletable "workspace" must be owned by MasterHand; the same server already supports multiple projects via `directory` (query on GET, `x-opencode-directory` header on mutations) | Listing `GET /project` directly (no deletion possible), opencode's experimental v2 workspaces (git worktrees, not folders, unstable) |

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Poorly secured public exposure | Critical (RCE) | BFF with auth, rate limit, opencode on the internal network only, `ask` permissions, unprivileged containers |
| SSE drops on mobile/background | High (stale UI) | Refetch + dedupe by `part.id`, fallback polling |
| Missing native push reduces awareness | Medium | In-app notifications plus a visible connection status; native push in the backlog |
| SSE streaming from React Native | Medium | Mobile uses `expo/fetch` (streaming-capable) as the fetch implementation; polling is the fallback |
| Incompatible changes in opencode's API | Medium | Pinned version + regenerated SDK types |
| Uncontrolled model cost | Medium | Visibility of active sessions; abort sessions from any client (`/session/:id/abort`) |
