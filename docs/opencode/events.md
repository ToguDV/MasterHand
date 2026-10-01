# opencode server SSE events

Verified on **2026-10-01** against a live **opencode v2.0.6** server and the generated types of [`@opencode/client@2.0.21`](https://www.npmjs.com/package/@opencode/client).

## Connection

| Endpoint | Scope | Usage |
|---|---|---|
| `GET /api/event` | All server locations | **The one MasterHand uses** |

- Each SSE frame is `data: <json>` where the JSON is one event object:
  `{ id, created?, type, location?: { directory }, data, durable?: { aggregateID, seq, version } }`.
  MasterHand's hub parses the JSON and re-emits the object unchanged on `/api/events` (see `docs/bff/api.md`).
- `location.directory` tells which project the event belongs to; session-scoped events also carry `data.sessionID`.
- The first event in the stream is `server.connected`; heartbeats are SSE comments (`: heartbeat`) and must be ignored.
- **No replay guarantee**: if the connection drops, lost events are not re-emitted. Clients refetch history on reconnect (see `ARCHITECTURE.md` §4.5).
- There is no `sync` stream anymore; every event is delivered once.

## Events MasterHand consumes

| Event | `data` (verified) | Usage |
|---|---|---|
| `server.connected` | `{}` | Connection indicator |
| `session.created` | `{ sessionID, projectID, location, parentID?, title?, agent?, model? }` | Add session to the list |
| `session.renamed` | `{ sessionID, title }` | Update title in the list |
| `session.metadata.updated` | `{ sessionID, metadata }` | Refresh session metadata |
| `session.deleted` | `{ sessionID }` | Remove from the list |
| `session.agent.selected` / `session.model.selected` | `{ sessionID, agent? / model? }` | Refresh the session's remembered selection |
| `session.permissions` | `{ sessionID, permissions }` | Session permission ruleset changed |
| `session.status` | `{ sessionID, status: SessionStatus }` | Working / idle / retrying indicator |
| `session.execution.started` | `{ sessionID }` | Turn started (client marks busy and refreshes messages) |
| `session.execution.succeeded` | `{ sessionID }` | Turn finished successfully |
| `session.execution.interrupted` | `{ sessionID }` | User aborted the turn |
| `session.execution.failed` | `{ sessionID, error: Session.StructuredError }` | **In-app notification: agent error** (`error.type === "MessageAbortedError"` is ignored) |
| `session.retry.scheduled` | `{ sessionID, assistantMessageID, attempt, at, error }` | Retry indicator |
| `session.idle` | `{ sessionID }` | Session went idle |
| `session.step.ended` | `{ sessionID, assistantMessageID, finish, cost, tokens, snapshot?, files? }` | Step usage (cost/tokens) live |
| `session.text.started` / `.delta` / `.ended` | `{ sessionID, assistantMessageID, ordinal, delta? / text? }` | **Live assistant text streaming** |
| `session.reasoning.started` / `.delta` / `.ended` | `{ sessionID, assistantMessageID, ordinal, delta? / text? }` | **Live reasoning streaming** |
| `session.tool.input.started` | `{ sessionID, assistantMessageID, id, name }` | Tool card appears (input streaming) |
| `session.tool.input.delta` / `.input.ended` | `{ …, id, delta } / { …, id, text }` | Streamed tool input (raw JSON → parsed on end) |
| `session.tool.called` | `{ sessionID, assistantMessageID, id, input, executed, state? }` | Tool running |
| `session.tool.progress` | `{ …, id, metadata }` | Tool progress metadata |
| `session.tool.success` | `{ …, id, content: Tool.Content[], metadata?, executed }` | Tool completed (result `content`) |
| `session.tool.failed` | `{ …, id, error, content?, metadata? }` | Tool failed |
| `permission.asked` | `Permission.Request` (see below) | **Approval modal + in-app notification** |
| `permission.replied` | `{ sessionID, requestID, reply }` | Sync the answer across devices |
| `session.usage.updated` | `{ sessionID, cost, tokens }` | Session totals |

Not consumed yet (present in v2): `session.compaction.*`, `session.shell.*`, `session.revert.*`, `session.skill.*`, `session.inbox.*`, `filesystem.changed`, `worktree.*`, `vcs.branch.updated`, `pty.*`, `mcp.*`, `form.*`, `installation.*`, `tui.*`.

## Streaming model

- Text and reasoning parts are identified by `assistantMessageID` + `ordinal`; deltas append and the matching `*.ended` carries the final text.
- Tool parts are identified by their call `id`; the tool name only arrives in `session.tool.input.started`, so a tool event that appears first is shown with the call id until the name arrives.
- `session.step.ended` closes a step with authoritative `cost`/`tokens`; `session.execution.succeeded` (or `failed`/`interrupted`) ends the turn, after which the client refetches `GET /api/session/:id/message` and replaces its live state with the projected history.
- Live messages are only merged when the session's message list is already cached; the authoritative projection always wins on refetch.

## Referenced types

### `Permission.Request` (`permission.asked`)

```ts
{
  id: string
  sessionID: string
  action: string                 // e.g. "shell", "edit", "websearch", "subagent"
  resources: string[]            // affected commands/paths/globs
  save?: string[]                // rules the "always" answer would persist
  metadata?: Record<string, unknown>
  source?: { type: "tool", messageID: string, id: string }
  message?: string
}
```

Real captured event:

```json
{
  "id": "evt_…",
  "created": 1790849…,
  "type": "permission.asked",
  "location": { "directory": "/workspace/my-app" },
  "data": {
    "id": "per_…",
    "sessionID": "ses_…",
    "action": "shell",
    "resources": ["ls"],
    "save": ["ls *"]
  }
}
```

Answer with `POST /api/session/:id/permission/:requestID/reply` and body `{ "decision": "once" | "always" | "reject" }`.

### `SessionStatus` (`session.status`)

```ts
{ type: "idle" }
| { type: "busy" }
| { type: "retry"; attempt: number; message: string; next: number; action?: { … } }
```

### Subagents (`subagent` tool)

Verified on **2.0.6** with a live run:

- The tool is named **`subagent`** (v1's `task` no longer exists).
- `input = { agent, description, prompt }`.
- `metadata = { sessionID, status, … }` points at the **child session**; the child is returned by `GET /api/session` with `parentID` set.
- The result is wrapped as `<subagent sessionID="…" state="completed">…</subagent>` (MasterHand strips the wrapper for display and offers "Open session" navigation).

## Integration notes

- List pending permissions: `GET /api/permission/request?location[directory]=<abs-path>` returns `Permission.Request[]`. It is per location — reconcile each workspace (base folder and worktrees), because SSE never replays.
- The UI must not rely on SSE alone for consistency: on open or reconnect, load history with `GET /api/session/:id/message` and pending permissions with the endpoint above.
