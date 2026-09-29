# opencode server SSE events

Verified on **2026-09-27** against [`types.gen.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) (`dev` branch).

## Connection

| Endpoint | Scope | Usage |
|---|---|---|
| `GET /event` | Instance (server directory) | Only covers the instance's project; does **not** receive events from other directories |
| `GET /global/event` | Global (all projects) | **The one MasterHand uses** |

- The global stream wraps every event: `{ directory, project, payload: { id, type, properties } }`. The BFF unwraps `payload` and **drops `sync` events** (they duplicate `session.*`/`message.*`).
- The first event in the stream is `server.connected`.
- **No replay guarantee**: if the connection drops (mobile, background), lost events are not re-emitted. The client must refetch history and deduplicate by `part.id` on reconnect (see `ARCHITECTURE.md` §4.5).

## Events MasterHand consumes

| Event | `properties` (verified) | Usage |
|---|---|---|
| `server.connected` | — | Connection indicator with opencode |
| `session.created` | `{ info: Session }` | Add session to the list |
| `session.updated` | `{ info: Session }` | Update title/state in the list |
| `session.deleted` | `{ info: Session }` | Remove from the list |
| `session.status` | `{ sessionID, status: SessionStatus }` | "working / idle / retrying" indicator |
| `session.idle` | `{ sessionID }` | **In-app notification: the turn finished** |
| `session.error` | `{ sessionID?, error? }` | **In-app notification: agent error** |
| `session.compacted` | `{ sessionID }` | Context compaction notice |
| `message.updated` | `{ info: Message }` | Refresh a message (state, tokens, cost) |
| `message.removed` | `{ sessionID, messageID }` | Remove message from the view |
| `message.part.updated` | `{ part: Part, delta?: string }` | **Live streaming** (text, tool calls, reasoning) |
| `message.part.removed` | `{ sessionID, messageID, partID }` | Remove part from the view |
| `permission.asked` | `Permission` (see below) | **Approval modal + in-app notification** |
| `permission.replied` | `{ sessionID, requestID, reply }` | Sync the answer across devices |
| `todo.updated` | `{ sessionID, todos: Todo[] }` | Future: agent task list |
| `session.diff` | `{ sessionID, diff: FileDiff[] }` | Future: visual diffs |
| `file.edited` | `{ file }` | Future: refresh files |
| `file.watcher.updated` | `{ file, event: "add" \| "change" \| "unlink" }` | Future |
| `command.executed` | `{ name, sessionID, arguments, messageID }` | — |
| `vcs.branch.updated` | `{ branch? }` | Future: show git branch |
| `installation.updated` · `installation.update-available` | `{ version }` | opencode update notice |
| `pty.created` · `pty.updated` | `{ info: Pty }` | Future: terminal |
| `pty.exited` | `{ id, exitCode }` | Future: terminal |
| `server.instance.disposed` | `{ directory }` | Force client reconnection |

Also present (unused for now): `lsp.updated`, `lsp.client.diagnostics`, `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`, `pty.deleted`.

## Referenced types

### `Part` (content of `message.part.updated`)

Verified union of part types:

`text` · `reasoning` · `tool` · `step-start` · `step-finish` · `snapshot` · `patch` · `file` · `agent` · `retry` · `compaction` · `subtask`

> All share `id`, `sessionID`, `messageID` and `type`. Specific fields (e.g. `TextPart.text`, `ToolPart` with state/input/output) should be documented here while implementing rendering, consulting `types.gen.ts`.

### Subagents (`subtask` part and the `task` tool)

Verified on **1.18.32** against the task tool source and the SDK types:

- **`subtask` part**: `{ id, sessionID, messageID, type: "subtask", prompt, description, agent }` (also accepted as a prompt input part).
- **`task` tool**: a regular `ToolPart` with `tool: "task"` where
  - `state.input = { description, prompt, subagent_type, task_id?, command?, background? }`
  - `state.title = description`
  - `state.metadata = { parentSessionId, sessionId, model, background?, jobId? }`, with `sessionId` = the **child session** and `background: true` for asynchronous runs
  - `state.output` is wrapped as `<task id state><summary>…</summary><task_result>…</task_result></task>` (or `<task_error>`).
- The child session is returned by `GET /session` with `parentID` set (title `<description> (@<agent> subagent)`), so clients can drill into it.

### `Permission` (`permission.asked`)

Verified on **1.18.32** (the version pinned in `deploy/.env`). The event was renamed from `permission.updated` and the payload changed; the published SDK still describes the old shape, so MasterHand models this one.

```ts
{
  id: string
  sessionID: string
  permission: string                // permission kind (e.g. bash, edit)
  patterns: string[]                // affected resources (commands, paths, globs)
  metadata: Record<string, unknown> // extra tool context (e.g. { command: "ls" })
  always: string[]                  // patterns the "always" answer would persist
  tool?: { messageID: string; callID: string }
}
```

Real captured event (agent tool flow, `bash`):

```json
{
  "type": "permission.asked",
  "properties": {
    "id": "per_…",
    "sessionID": "ses_…",
    "permission": "bash",
    "patterns": ["ls"],
    "metadata": { "command": "ls" },
    "always": ["ls *"],
    "tool": { "messageID": "msg_…", "callID": "call_…" }
  }
}
```

### `SessionStatus` (`session.status`)

```ts
{ type: "idle" }
| { type: "busy" }
| { type: "retry"; attempt: number; message: string; next: number }
```

## Integration notes

- Answer a permission: `POST /session/:id/permissions/:permissionID` with body `{ response: "once" | "always" | "reject" }` (verified on 1.18.32). The session id resolves the request, so no `directory` override is required.
- List pending permissions: `GET /permission?directory=<abs-path>` returns `Permission[]`. It is **per instance/directory** — without `directory` it does not return requests from other project folders, so reconcile each workspace. There is also a v2 API and `permission.v2.asked` events used by `POST /api/session/:id/permission`; the agent tool flow emits the classic `permission.asked` treated above.
- `delta?` in `message.part.updated` carries the incremental text fragment when applicable; if missing, replace the whole part with `part`.
- The UI must not rely on SSE alone for consistency: on open or reconnect, load history with `GET /session/:id/message`.
