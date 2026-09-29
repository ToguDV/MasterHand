# MasterHand BFF API

Verified on **2026-09-27** against the implementation (`apps/server/src/app.ts`).

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
| `GET` | `/api/status` | `{ ok: true, opencode: { healthy, version? } }` | Calls opencode's `/global/health` with a 3s timeout; on failure returns `healthy: false` |
| `GET` | `/api/events` | SSE | Re-emits opencode events from **all projects** (hub on `/global/event`); first event `hello` with `{ connected }`; `ping` every 25s |
| `GET` | `/api/devices` | `{ devices: DeviceRecord[] }` | Lists registered devices |
| `DELETE` | `/api/devices/:id` | `{ ok: true }` | Revokes a device token |
| `GET` | `/api/workspaces` | `{ workspaces: WorkspaceRecord[] }` | Workspaces, oldest first |
| `POST` | `/api/workspaces` | `201 { workspace }` | Body: `{ "name": "my-project" }`. The BFF creates `<WORKSPACES_ROOT>/<name>` (mkdir -p) and returns it. `name` becomes both the folder and the display name. `400` invalid name (separators, traversal, leading dot, >64 chars), `409` already registered |
| `DELETE` | `/api/workspaces/:id` | `{ ok: true }` | Removes the workspace from MasterHand's list. With `?deleteFiles=1` it also deletes the folder and its files from disk (only when the path is inside `WORKSPACES_ROOT`, otherwise `403`); without it, files and opencode sessions are untouched. `404` unknown workspace |

`workspace` shape: `{ id, name, path, createdAt }`. Each workspace is a subfolder that MasterHand creates and owns under `WORKSPACES_ROOT`, so it is always a single, isolated directory. opencode has no project-deletion endpoint, so deleting the record in MasterHand (optionally with its files) is how a workspace goes away.

## Proxy to opencode

| Method | Route | Notes |
|---|---|---|
| `*` | `/api/oc/*` | Forwards to `OPENCODE_URL` (e.g. `http://opencode:4096`) injecting `Authorization: Basic` with `OPENCODE_SERVER_PASSWORD`. The `/api/oc` prefix is removed: `/api/oc/global/health` → `GET /global/health`. Preserves method, body, query and `content-type`. Forwards the `x-opencode-directory` header (used to target a workspace on mutations) and preserves the `directory` query parameter (used on GET). SSE streaming without buffering (`cache-control: no-cache`, `x-accel-buffering: no`). `502` if opencode does not answer. |

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
| `DATA_DIR` | `./data` | SQLite path (`/data` in Docker) |
| `WORKSPACES_ROOT` | `./workspace` | Base directory where workspaces are created as subfolders. Point it at the same folder opencode sees (e.g. `/workspace` in Docker) |
| `WEB_DIST` | `apps/web/dist` | Web build served by the BFF |
