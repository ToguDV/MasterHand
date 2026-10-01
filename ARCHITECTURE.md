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
                       │ SSE /api/event (permanent connection)
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
| `packages/client-core` | TypeScript (framework-agnostic + React hooks) | API client, TanStack Query hooks, SSE handling, auth adapters, opencode v2 generated client and types |
| BFF | `apps/server` | Node 22 + Hono (`@hono/node-server`) | Auth (cookie + token), proxy to opencode, SSE relay, device/token storage, rate limit, workspaces and git worktrees |
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
| API client | `@opencode/client` (v2, Promise) pointed at the BFF proxy | Generated client and types from opencode's v2 contract; the BFF injects auth |
| State | TanStack Query | Event-driven server cache (SSE → `setQueryData`); works on web and React Native |
| BFF | Node 22 + Hono | Lightweight `streamSSE` and proxying |
| Auth | Signed HttpOnly cookie (web) + signed Bearer token (native) | Best fit per platform; single signing secret |
| Persistence | SQLite | Real persistence without extra infrastructure |
| Deploy | Docker Compose | Reproducible, one command; TLS stays with the deployer |

## 4. Main flows

### 4.1 Prompt submission and streaming

1. The client sends `POST /api/oc/api/session/:id/prompt` through the BFF (which adds opencode's basic auth). Model and agent are **not** part of the prompt: when the composer selection differs from the session's remembered `agent`/`model`, the client first calls `POST /api/oc/api/session/:id/agent` and/or `/model` (with the variant inside `Model.Ref`) and only then prompts.
2. opencode admits the input and returns the inbox item; the agent runs.
3. The BFF keeps a permanent SSE connection to opencode's `GET /api/event` (all locations; each frame is one v2 event object) and re-emits it on the BFF's `GET /api/events`.
4. The client renders live streaming from the granular events: `session.text.*` and `session.reasoning.*` deltas (keyed by `assistantMessageID` + `ordinal`, numbered per kind), `session.tool.*` for tool cards and `session.step.ended` for cost/tokens.
5. When the turn ends, opencode emits `session.execution.succeeded` (or `failed`/`interrupted`); the client refetches the projected messages, which replace the live state.
6. While a step is streaming, the projection includes the in-flight assistant message but omits its accumulated text (verified against a live 2.0.21 server); a mid-step refetch therefore merges the live text/reasoning parts instead of dropping them (`mergeLiveMessages`).
7. Each composer remembers the agent, model and effort (`variant`) chosen **per session**, stored client-side (`localStorage` on web, SecureStore on mobile) and restored when the session is reopened; new sessions keep falling back to the last used model.

### 4.2 Permission approvals

1. The agent requests permission → `permission.asked` event with `Permission.Request` (`id`, `sessionID`, `action`, `resources`, `save?`, `metadata?`, `source?`).
2. The client shows a modal with the action and affected resources.
3. The user answers → `POST /api/oc/api/session/:id/permission/:requestID/reply` with `{ decision }` (`once` / `always` / `reject`). The session id resolves the request.
4. opencode emits `permission.replied` (`{ sessionID, requestID, reply }`) and all devices sync.
5. SSE does not replay across reconnects, so on (re)connect clients reconcile pending requests with `GET /api/oc/api/permission/request?location[directory]=<workspace>` for every workspace; otherwise a missed `permission.asked` would leave the agent blocked with no UI. Reconciliation is authoritative per directory: requests answered elsewhere are pruned, requests outside the queried directories are kept, and a directory that failed to answer never prunes anything.
6. Optional per-session **auto-accept** (a toggle next to the composer, stored client-side): incoming requests for that session are answered `once` automatically and the queue is drained on (re)connect. It is reversible — `once` never persists a rule in opencode — and only affects sessions the user enabled it for.

### 4.3 Authentication (single user, multiple devices)

- **Web / desktop (`apps/web`, `apps/desktop`)**: `POST /api/login` validates the password and sets a signed `HttpOnly`, `Secure`, `SameSite=Strict` cookie. The password never reaches the client code.
- **Mobile (`apps/mobile`)**: `POST /api/devices` validates the same password and returns a signed Bearer token plus a device record. The app stores the token in secure storage (Expo SecureStore) and sends `Authorization: Bearer <token>` on every request.
- The BFF accepts either credential on protected routes. Both are signed with `SESSION_SECRET` and share the TTL configured by `SESSION_TTL_HOURS`.
- Device records live in SQLite (`GET /api/devices`, `DELETE /api/devices/:id`); multiple devices may be signed in at once for the same single user.
- Origin checks apply only to cookie-based mutations; Bearer requests are exempt (tokens are never attached automatically by browsers, so there is no CSRF risk).

### 4.4 Notifications (in-app)

- The BFF's SSE relay drives in-app notifications in every client: `session.idle`, `session.execution.failed` (agent error) and `permission.asked` update a badge/indicator.
- Tapping a notification opens the corresponding session.
- Native push (FCM/APNs) is out of scope for the MVP and listed in the backlog.

### 4.5 Reconnection (mobile / background)

- SSE does not guarantee event replay.
- On reconnect (or when returning from background), clients refetch `GET /api/oc/api/session/:id/message` and replace their live state with the projection, except for the text/reasoning parts of a message still streaming (the projection does not carry them until the step closes).
- Streaming events are keyed: text/reasoning by `assistantMessageID` + `ordinal` (numbered per kind), tool parts by their call `id`. Deltas append; `*.ended` carries the final text; tool `success`/`failed` carries the result `content`.
- Client inactivity watchdog (60s without bytes → forced reconnect), reconnect when the tab/app becomes visible (`visibilitychange`) and when the network returns (`online`).
- On (re)connect, `sessions`, `messages` and `statuses` are invalidated to reconcile missed events.
- Pending permissions are reconciled too (`GET /api/oc/api/permission/request` per workspace): a `permission.asked` lost while offline would otherwise leave the agent blocked with no prompt.
- Fallback without SSE: connection down → polling (messages every 5s, statuses every 4s); active turn → messages every 3s.

### 4.6 Workspaces (isolated project folders)

- There is a single **workspaces root** (`WORKSPACES_ROOT`, default `<repo-root>/workspace`; `/workspace` in Docker), the folder opencode works in. Every **workspace** is a subfolder of it, tracked in the BFF (`workspaces` table in SQLite: `id`, `name`, `path`). Relative values are resolved against the repo root, so the path does not depend on the process `cwd`.
- Clients only send a **name**; the BFF sanitizes it to a single path segment (no separators, traversal or leading dots), derives `<root>/<name>` and creates the folder with `mkdir -p`. The name and the folder are the same, so arbitrary absolute paths can never be registered and everything stays isolated under the root.
- Clients pick a workspace; every opencode **location-scoped** call carries its `path` as `?location[directory]=`, session listing uses `?directory=` and session creation sends `location: { directory }` in the body. Sessions are therefore created in and listed for the selected folder.
- Deleting a workspace forgets it in MasterHand. With `?deleteFiles=1` (a checkbox in the UI) the BFF also removes the folder and its files; it refuses (`403`) when the stored path lies outside the root. Deleting a session calls `DELETE /api/session/:id` (the session id resolves its location) and removes its data.
- The BFF persists the list and owns folder creation/deletion; opencode works inside the same mounted root.

### 4.7 Isolated sessions (git worktrees)

Several agents working in the same workspace share its folder, so they can overwrite each other's files. **Isolated mode** gives an opt-in session its own git worktree and branch; everything else stays as in §4.6.

1. At creation the client sends `{ isolated: true }` to `POST /api/workspaces/:id/sessions`. The BFF `git init`s the workspace (with an empty first commit) when it is not a repo yet, then creates the worktree at `<WORKTREES_ROOT>/<workspace>/<token>` — inside the shared mount (opencode sees it) but outside the repo (git requires it) — with branch `masterhand/<slug>-<token>` from the current HEAD.
2. The BFF creates the opencode session in that worktree directory and stores the mapping in the `isolated_sessions` table (`session_id`, `workspace_id`, `path`, `branch`, `base_ref`, `pushed`, `pr_url`).
3. `GET /api/workspaces/:id/sessions` aggregates the workspace folder and every worktree of that workspace and annotates each isolated session (and its subagent children, which share the parent directory) with `isolation: { worktreePath, branch, baseRef }`. Clients resolve the `directory` override per session from it; `GET /api/workspaces/:id/directories` lists the directories for permission reconciliation.
4. **Finish & PR** (`POST /api/isolated-sessions/:id/finish`, an explicit action) commits everything in the worktree; when the repo has a remote it pushes the branch and tries `gh`/`glab` for the PR, falling back to a provider compare URL. There is **no auto-merge**.
5. Deleting the session (or its workspace) removes the worktree and the branch and drops the record. A startup reconciliation drops records whose folder disappeared and removes orphan worktrees under the root.
6. Clients show an isolated toggle at creation, a branch badge per session, an All/Isolated/Standard filter and the worktree bar with the Finish action.

### 4.8 Session previews (Cloudflare quick tunnels)

The agent usually runs a web project's dev server inside its own process/container, whose port the user's browser cannot reach. **Previews** expose it without publishing any port:

1. On first use, the BFF reserves a **fixed port** per session from `PREVIEW_PORT_RANGE` (persisted in the `preview_ports` table). Fixed ports survive BFF restarts and let a running dev server be re-exposed without restarting it. The allocator recycles the oldest mapping without a live tunnel when the pool is drained.
2. While previews are enabled, the BFF writes one session instruction entry (`PUT /api/experimental/session/:id/instructions/entries/masterhand.preview`, key `masterhand.preview`) telling the agent to bind any web server to `0.0.0.0:<port>`; opencode includes instruction entries in the model's system context on every turn. No project files (`AGENTS.md`, `opencode.json`) are touched and the proxy stays a byte-for-byte passthrough.
3. On an explicit **Start**, the BFF probes `PREVIEW_ORIGIN:<port>` over TCP and then spawns `cloudflared tunnel --no-autoupdate --url http://<origin>:<port> --http-host-header localhost:<port>` inside the BFF container, capturing the random `https://<name>.trycloudflare.com` URL from its output. The `Host` rewrite is what makes framework dev servers work through the tunnel: Vite's `server.allowedHosts` (and similar origin checks) reject the public hostname with `403`, while `localhost` is always allowed. The URL is served to clients, which embed it in an iframe (web/desktop) or a WebView (mobile). **Stop** kills the process; session deletion and BFF shutdown clean up too.
4. `PREVIEW_ORIGIN` is the host of the dev server as seen by the BFF: `opencode` on the Compose network, `127.0.0.1` in native dev. The quick tunnel makes an **outbound** connection to Cloudflare, so no inbound ports or DNS/certificates are needed.

Quick tunnels are **public and ephemeral** (random URL per start, no authentication at the edge): an explicit testing feature, not a production hosting path. See the Risks table.

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
| `opencode` | `opencode.Dockerfile` (pinned version) | none (internal `4096`) | `opencode_config`, `opencode_data`, `./workspace` (shared with the BFF, which creates each workspace folder) |

- `restart: unless-stopped` on all services → the host restarts and the stack comes back on its own.
- The deployer points their own TLS/domain at the published BFF port and sets `ALLOWED_ORIGINS` if a different origin proxies to it. Bind to `127.0.0.1` with `MASTERHAND_BIND` when the reverse proxy runs on the host.
- Provider authentication: `docker compose run --rm opencode auth login` (persists to a volume).
- Agents work under `./workspace` (bind mount) so files can be inspected/versioned from the host; the BFF creates one subfolder per workspace there and per-session git worktrees under `.worktrees/` (same mount, so opencode sees them).
- Backups: volumes `masterhand_data`, `opencode_data` and `opencode_config`.
- Session previews: the `masterhand` image bundles `cloudflared`; Compose sets `PREVIEW_ORIGIN=opencode`, so the tunnel targets the dev server inside the opencode container. The BFF needs **outbound Internet** and the agent must bind the reserved port to `0.0.0.0`. Set `PREVIEW_ENABLED=false` to disable the feature.
- Upgrade: opencode is pinned (`OPENCODE_VERSION`, v2); `docker compose build && docker compose up -d`. **Back up the `opencode_data` volume before the first v2 start**: v2 migrates v1 session data on boot and the beta warns data may be reset. Track the migration with `GET /api/experimental/migration/v1`.
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
| ADR-11 | Workspaces are subfolders MasterHand creates under a single configured root; the BFF owns the records and the folders, and opencode is targeted per request with its `directory` override | opencode has no project-deletion endpoint, so a deletable "workspace" must be owned by MasterHand; deriving the path from a sanitized name keeps every project isolated under one root and removes unsafe absolute paths | Registering arbitrary existing absolute paths (escapes the root, requires the user to pre-create folders), listing `GET /project` directly (no deletion possible), opencode's experimental v2 workspaces (git worktrees, not folders, unstable) |
| ADR-12 | Isolated sessions use BFF-managed git worktrees, opt-in per session, with a branch per session and an explicit Finish & PR action (no auto-merge) | Git worktrees are the natural way to give concurrent agents disjoint files; the BFF already owns workspaces and opencode accepts a per-request `directory`, so no unstable opencode API is needed. Opt-in avoids a worktree/branch per throwaway session, and a manual finish avoids surprising merges | Automatic worktree per session (branch/disk bloat), one workspace per session (no merge path, manual), opencode v2 worktree/workspace API (experimental, not in the pinned version), per-workspace lock (kills parallelism) |
| ADR-13 | Previews use Cloudflare quick tunnels managed by the BFF, with a fixed reserved port injected per session through the prompt's `system` field and an explicit Start/Stop | Quick tunnels need no DNS, certificates or published ports and work from any network (web, desktop and native clients), which is exactly the "show me the dev server" use case. A fixed per-session port survives restarts and lets the agent be told once, while the BFF stays the only process managing the tunnel. | BFF reverse proxy with path prefixes (breaks absolute asset paths and HMR), wildcard preview subdomain (requires deployer DNS/TLS work), publishing host ports (mixed content, exposed surface), named tunnels (account/API token) |
| ADR-14 | Preview instructions are written by the BFF as a **session instruction entry** (`masterhand.preview`), not as a per-prompt `system` and not by editing workspace files | opencode v2 has no per-prompt `system`; instruction entries are per session (isolated worktrees run concurrently) and become part of the system context without touching project files or making the proxy parse bodies | Writing `AGENTS.md`/`opencode.json` into the workspace (mutates user files, per-workspace not per-session), client-side injection (duplicated in every client), `session.synthetic` messages (visible in the transcript) |
| ADR-15 | Champion opencode **v2 only**: `@opencode/client` (generated), the `/api/*` server API and the granular `session.*` events; the BFF stays a passthrough + single-upstream hub | v2 is the released engine (v1 is no longer installed side by side), the generated client removes hand-rolled location/query/SSE drift, and the granular events are the native streaming contract. A dual v1/v2 adapter would double the test matrix for a superseded API | Dual v1+v2 compatibility layer (more code/tests, no user value), staying on v1 (unsupported, pinned old server), adopting v2's experimental worktree/workspace APIs (BFF-owned worktrees already work) |

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Poorly secured public exposure | Critical (RCE) | BFF with auth, rate limit, opencode on the internal network only, `ask` permissions, unprivileged containers |
| Public preview tunnel | High (data exposure) | Quick tunnels are opt-in per session and explicitly for testing; the random URL is unknown until started, and `PREVIEW_ENABLED=false` disables the feature server-wide. Previews are never for production data |
| SSE drops on mobile/background | High (stale UI) | Refetch + dedupe by `part.id`, fallback polling |
| Missing native push reduces awareness | Medium | In-app notifications plus a visible connection status; native push in the backlog |
| SSE streaming from React Native | Medium | Mobile uses `expo/fetch` (streaming-capable) as the fetch implementation; polling is the fallback |
| Incompatible changes in opencode's API | Medium | Pinned version + regenerated SDK types |
| Uncontrolled model cost | Medium | Visibility of active sessions; abort sessions from any client (`/session/:id/abort`) |
