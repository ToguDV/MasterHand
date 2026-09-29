# opencode HTTP API (subset for MasterHand)

Verified on **2026-09-27** against the [official server docs](https://opencode.ai/docs/server/) and [`types.gen.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts).

> The full contract (OpenAPI 3.1) is at `http://127.0.0.1:4096/doc` on the server. When in doubt, that is the source of truth.

## Authentication

- Basic auth with `OPENCODE_SERVER_PASSWORD` (default user `opencode`, configurable with `OPENCODE_SERVER_USERNAME`).
- In MasterHand, **only the BFF** knows these credentials and injects them when proxying. Clients never see them.

## Endpoints MasterHand uses

### Health and events

| Method | Route | Usage in MasterHand |
|---|---|---|
| `GET` | `/global/health` | BFF and UI healthcheck |
| `GET` | `/event` | Instance SSE → relayed on `/api/events` |
| `GET` | `/global/event` | Global SSE (**what MasterHand uses**) |

### Sessions

| Method | Route | Usage in MasterHand |
|---|---|---|
| `GET` | `/session` | List sessions |
| `POST` | `/session` | Create session; body `{ parentID?, title? }` |
| `GET` | `/session/:id` | Session detail |
| `DELETE` | `/session/:id` | Delete session |
| `PATCH` | `/session/:id` | Rename; body `{ title? }` |
| `GET` | `/session/status` | State of all sessions (idle/busy) |
| `GET` | `/session/:id/message` | History; returns `{ info, parts }[]` |
| `POST` | `/session/:id/prompt_async` | **Send prompt without waiting (204); main UI flow** |
| `POST` | `/session/:id/message` | Send prompt and wait for the full response (alternative) |
| `POST` | `/session/:id/abort` | Stop an in-progress turn |
| `POST` | `/session/:id/permissions/:permissionID` | Answer permission; body `{ response, remember? }` |
| `GET` | `/session/:id/diff` | Session diffs (post-MVP) |
| `POST` | `/session/:id/summarize` | Summary (post-MVP) |
| `POST` | `/session/:id/revert` · `/unrevert` | Revert/restore messages (post-MVP) |
| `GET` | `/session/:id/todo` | Session tasks (post-MVP) |

### Messages and commands

| Method | Route | Usage |
|---|---|---|
| `GET` | `/session/:id/message/:messageID` | Message detail |
| `POST` | `/session/:id/command` | Run slash command |
| `POST` | `/session/:id/shell` | Run shell command (permission required) |

### Projects and working directories

| Method | Route | Usage |
|---|---|---|
| `GET` | `/project` | List known projects (`{ id, worktree, vcs?, time }`) |
| `GET` | `/project/current` | Current project |

opencode resolves each request against a **directory** (project root) override, so MasterHand can work on several folders with one server:

- `GET`/`HEAD` requests take `?directory=/abs/path`.
- Mutations (`POST`/`PATCH`/`DELETE`) take the `x-opencode-directory: <url-encoded path>` header (this mirrors `@opencode-ai/sdk`'s client interceptor).
- Sessions created with a `directory` are stored with that `directory`; `GET /session?directory=/abs/path` filters by it. The BFF forwards the header and the query parameter unchanged.

Verified on 1.18.32: creating a session with a `directory` registers the project; `DELETE /session/:id` deletes the session and its data.

### Agents, configuration and providers

| Method | Route | Usage |
|---|---|---|
| `GET` | `/agent` | Available agents (composer selector) |
| `GET` | `/config` | Current configuration |
| `GET` | `/config/providers` | Providers and default models (selector) |
| `GET` | `/provider` | Connected providers |

### Files (post-MVP)

| Method | Route | Usage |
|---|---|---|
| `GET` | `/find?pattern=` | Search text in files |
| `GET` | `/find/file?query=` | Search files by name |
| `GET` | `/file/content?path=` | Read file |
| `GET` | `/file/status` | State of tracked files |

## JavaScript SDK

- Package: `@opencode-ai/sdk`; client: `createOpencodeClient({ baseUrl })`.
- In MasterHand clients, `baseUrl` points at the BFF's same-origin proxy (e.g. `/api/oc`), so the session cookie is sent automatically (native clients use the Bearer token instead).
- The SDK includes all generated types (`Session`, `Message`, `Part`, `Permission`, …).

## Integration notes

- `prompt_async` replies `204` and progress arrives over SSE (`message.part.updated`) — the recommended UI flow.
- Sessions persist the `model` (`{ providerID, id, variant? }`) and `agent` they last ran with, and `GET /session` returns them (verified on 1.18.32). MasterHand uses the most recently updated session to preselect the last used model. Note: the published SDK `Session` type does not declare these fields yet, so `client-core` augments it.
- The `prompt` body accepts `{ messageID?, model?, agent?, noReply?, system?, tools?, variant?, parts }`; for text: `parts: [{ type: "text", text: "..." }]`.
- `variant` is a string selecting a model variant (reasoning effort levels, e.g. `low`/`medium`/`high`/`xhigh`/`max`). Available variants per model come from `GET /config/providers` (`providers[].models[].variants`); the prompt also accepts `model.variant` in `POST /session`.
- **Do not** use `--cors` in production: clients only talk to the BFF.
- In MasterHand it runs as the `opencode` Docker Compose service: it listens on `0.0.0.0:4096` **inside the internal network** (no published ports), with `OPENCODE_SERVER_PASSWORD` in `.env`. Binding to `127.0.0.1` only applies to native execution, not in a container.
