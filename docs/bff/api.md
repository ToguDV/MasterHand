# MasterHand BFF API

Verified on **2026-10-01** against the implementation (`apps/server/src/app.ts`).

Base URL: the deployer's origin (in development, `http://127.0.0.1:8787`).

## Authentication

MasterHand accepts two credential types on protected routes:

- **Web / desktop:** `POST /api/login` validates the password and sets a session cookie.
  - Cookie `mh_session`: `HttpOnly`, `Secure` (configurable with `COOKIE_SECURE`), `SameSite=Strict`, HMAC-signed (`SESSION_SECRET`), TTL `SESSION_TTL_HOURS` (30 days by default).
- **Native (mobile):** `POST /api/devices` validates the password and returns a signed Bearer token plus a device record. Clients send `Authorization: Bearer <token>` on every request. Tokens are revoked by deleting the device.

Other rules:

- Rate limit: 5 attempts per IP every 15 minutes (`429` when exceeded) shared by both login routes. Counted by `x-forwarded-for` or `unknown`.
- Mutations (`POST`/`PATCH`/...) with an `Origin` header must match the `Host`; otherwise `403`. Origins listed in `ALLOWED_ORIGINS` are also allowed (in development the Vite origins are added automatically). Bearer requests are exempt: browsers never attach tokens automatically, so they carry no CSRF risk.
- Protected routes: everything under `/api/*` except `/api/health`, `/api/login`, `/api/logout` and `POST /api/devices`.

## Public endpoints

| Method | Route | Response | Notes |
|---|---|---|---|
| `GET` | `/api/health` | `{ ok: true }` | BFF healthcheck (no auth) |
| `POST` | `/api/login` | `{ ok: true }` + `Set-Cookie` | Body: `{ "password": "..." }`; `400` without body, `401` wrong password, `429` rate limit |
| `POST` | `/api/devices` | `201 { token, device }` | Body: `{ "password": "...", "name": "Pixel 9" }`; issues a device token. `400` invalid, `401` wrong password, `429` rate limit |
| `POST` | `/api/logout` | `{ ok: true }` | Clears the session cookie |

`device` shape: `{ id, name, createdAt, lastUsedAt }`.

## Protected endpoints (cookie or Bearer required; `401` without credentials)

| Method | Route | Response | Notes |
|---|---|---|---|
| `GET` | `/api/status` | `{ ok: true, opencode: { healthy, version? }, preview: { enabled, available, portRange } }` | Calls opencode's `/global/health` with a 3s timeout; on failure returns `healthy: false`. `preview.available` reports whether the `cloudflared` binary can be executed |
| `GET` | `/api/events` | SSE | Re-emits opencode events from **all projects** (hub on `/global/event`); first event `hello` with `{ connected }`; `ping` every 25s |
| `GET` | `/api/devices` | `{ devices: DeviceRecord[] }` | Lists registered devices |
| `DELETE` | `/api/devices/:id` | `{ ok: true }` | Revokes a device token |
| `GET` | `/api/workspaces` | `{ workspaces: WorkspaceRecord[] }` | Workspaces, oldest first |
| `POST` | `/api/workspaces` | `201 { workspace }` | Body: `{ "name": "my-project" }`. The BFF creates `<WORKSPACES_ROOT>/<name>` (mkdir -p) and returns it. `name` becomes both the folder and the display name. `400` invalid name (separators, traversal, leading dot, >64 chars), `409` already registered |
| `DELETE` | `/api/workspaces/:id` | `{ ok: true }` | Removes the workspace from MasterHand's list and cleans up its isolated worktrees and records. With `?deleteFiles=1` it also deletes the folder and its files from disk (only when the path is inside `WORKSPACES_ROOT`, otherwise `403`); without it, files and opencode sessions are untouched. `404` unknown workspace |
| `GET` | `/api/workspaces/:id/directories` | `{ directories: string[] }` | Workspace folder plus every isolated worktree of the workspace (used to reconcile pending permissions per directory) |
| `GET` | `/api/workspaces/:id/sessions` | `{ sessions: Session[] }` | Aggregates opencode sessions from the workspace folder and every worktree. Isolated sessions (and subagent children) carry `isolation: { isolated: true, worktreePath, branch, baseRef, pushed, prUrl }`. `502` when opencode is unreachable |
| `POST` | `/api/workspaces/:id/sessions` | `201 { session, isolation }` | Body: `{ "isolated": true }` optional. Standard sessions are created in the workspace folder (`isolation: null`). Isolated sessions `git init` the workspace when needed, create a worktree under `WORKTREES_ROOT`, create the opencode session there and return the `isolation` metadata. On failure the worktree is rolled back (`500 isolation_failed`) |
| `DELETE` | `/api/workspaces/:id/sessions/:sessionID` | `{ ok: true }` | Deletes the opencode session. For isolated sessions it also removes the worktree and the branch. Optional `?directory=` targets the session's directory (worktree for subagent children); `403` when it is not one of the workspace directories. `404` unknown workspace |
| `POST` | `/api/isolated-sessions/:sessionID/finish` | `{ committed, pushed, prUrl, branch, path, error }` | Commits everything in the worktree. With a remote it pushes the branch and tries `gh`/`glab` for the PR, falling back to a provider compare URL; `error` reports a failed push. `404` for unknown/non-isolated sessions |
| `GET` | `/api/sessions/:sessionID/preview` | `{ preview: PreviewStatus }` | Current preview state for the session. `404 preview_disabled` when `PREVIEW_ENABLED=false` |
| `POST` | `/api/sessions/:sessionID/preview` | `{ preview: PreviewStatus }` | Starts a Cloudflare quick tunnel to the session's reserved port. `409 preview_not_running` when nothing listens on the port, `503 preview_unavailable` when `cloudflared` is missing, `503 preview_ports_exhausted` when the pool is drained, `502` on tunnel failure. Idempotent while running |
| `DELETE` | `/api/sessions/:sessionID/preview` | `{ ok: true }` | Stops the tunnel (the reserved port is kept for a later restart) |

`workspace` shape: `{ id, name, path, createdAt }`. Each workspace is a subfolder that MasterHand creates and owns under `WORKSPACES_ROOT`, so it is always a single, isolated directory. opencode has no project-deletion endpoint, so deleting the record in MasterHand (optionally with its files) is how a workspace goes away.

`isolation` shape: `{ isolated: true, worktreePath, branch, baseRef, pushed?, prUrl? }`. Worktrees live at `<WORKTREES_ROOT>/<workspace>/<token>` (default `<WORKSPACES_ROOT>/.worktrees`) with branch `masterhand/<slug>-<token>`; one branch per worktree (git forbids checking out the same branch twice).

## Session previews

Each session gets a **fixed port** from `PREVIEW_PORT_RANGE` on first use (persisted in SQLite so it survives BFF restarts and the same dev server can be re-exposed). While previews are enabled, the proxy appends a `system` instruction to every prompt of that session telling the agent to bind any web server to `0.0.0.0:<port>`. The BFF then starts `cloudflared tunnel --no-autoupdate --url http://<PREVIEW_ORIGIN>:<port>` (a Cloudflare **quick tunnel**, see `deploy/server.Dockerfile`) and captures the random `https://<name>.trycloudflare.com` URL from its output.

`PreviewStatus` shape: `{ status: "stopped" | "starting" | "running" | "error", url, port, error }`. The tunnel process lives in the BFF container; `PREVIEW_ORIGIN` is the host where the dev server listens as seen from there (`opencode` in Compose, `127.0.0.1` in native dev). Tunnels stop on `DELETE`, on session deletion and on BFF shutdown.

> Quick tunnels are **public and ephemeral**: anyone with the random URL can reach the preview, and the URL changes on every start. Use them for testing only.

## Proxy to opencode

| Method | Route | Notes |
|---|---|---|
| `*` | `/api/oc/*` | Forwards to `OPENCODE_URL` (e.g. `http://opencode:4096`) injecting `Authorization: Basic` with `OPENCODE_SERVER_PASSWORD`. The `/api/oc` prefix is removed: `/api/oc/global/health` → `GET /global/health`. Preserves method, body, query and `content-type`. Forwards the `x-opencode-directory` header (used to target a workspace on mutations) and preserves the `directory` query parameter (used on GET). SSE streaming without buffering (`cache-control: no-cache`, `x-accel-buffering: no`). `502` if opencode does not answer. On `POST /api/oc/session/:id/prompt_async` and `/message` it appends the session's preview instruction to the JSON `system` field (see *Session previews*); every other request is byte-for-byte passthrough. |

Examples:

```bash
# create session
curl -X POST https://your-origin.example/api/oc/session -H 'content-type: application/json' -d '{}'
# send prompt (async; progress arrives over /api/events)
curl -X POST https://your-origin.example/api/oc/session/<id>/prompt_async \
  -H 'content-type: application/json' \
  -d '{"parts":[{"type":"text","text":"hello"}],"agent":"build","model":{"providerID":"opencode-go","modelID":"grok-4.7"},"variant":"high"}'
# answer permission
curl -X POST https://your-origin.example/api/oc/session/<id>/permissions/<permissionID> \
  -H 'content-type: application/json' -d '{"response":"once"}'
# list pending permissions for a workspace (to reconcile missed SSE events)
curl 'https://your-origin.example/api/oc/permission?directory=/workspace/my-app'
# native login (device token)
curl -X POST https://your-origin.example/api/devices \
  -H 'content-type: application/json' -d '{"password":"...","name":"Pixel 9"}'
```

## Relevant environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MASTERHAND_PASSWORD` | — (required) | Access password |
| `SESSION_SECRET` | — (required) | Cookie and token signing |
| `SESSION_TTL_HOURS` | `720` | Session/device token lifetime |
| `COOKIE_SECURE` | `true` | Cookie `Secure` flag |
| `ALLOWED_ORIGINS` | — | Comma-separated extra origins allowed on mutations (in dev the Vite origins are added) |
| `PORT` | `8787` | BFF port |
| `OPENCODE_URL` | `http://127.0.0.1:4096` | opencode upstream |
| `OPENCODE_SERVER_PASSWORD` / `OPENCODE_SERVER_USERNAME` | — / `opencode` | Basic auth to opencode |
| `DATA_DIR` | `<repo-root>/data` | SQLite path (`/data` in Docker). Relative values resolve against the repo root |
| `WORKSPACES_ROOT` | `<repo-root>/workspace` | Base directory where workspaces are created as subfolders. Point it at the same folder opencode sees (e.g. `/workspace` in Docker). Relative values resolve against the repo root |
| `WORKTREES_ROOT` | `<WORKSPACES_ROOT>/.worktrees` | Base directory for per-session git worktrees. Must stay inside the mount opencode sees |
| `GIT_COMMIT_NAME` / `GIT_COMMIT_EMAIL` | `MasterHand` / `masterhand@localhost` | Author for commits MasterHand creates in isolated worktrees |
| `PREVIEW_ENABLED` | `true` | Enables session previews (quick tunnels). When `false`, the preview routes return `404` and prompts are untouched |
| `PREVIEW_ORIGIN` | host of `OPENCODE_URL` | Host where the agent's dev server listens, as seen by the tunnel process (`opencode` in Compose, `127.0.0.1` in native dev) |
| `PREVIEW_PORT_RANGE` | `3200-3299` | Inclusive port pool reserved per session. Falls back to the default when malformed or outside 1024–65535 |
| `CLOUDFLARED_BIN` | `cloudflared` | `cloudflared` executable name or path (bundled in the server image) |
| `GH_TOKEN` / `GITLAB_TOKEN` | — | Optional: credentials for `gh`/`glab` and git push inside the BFF container (see the deployment runbook) |
| `WEB_DIST` | `apps/web/dist` | Web build served by the BFF |
