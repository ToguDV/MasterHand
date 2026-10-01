import { createServer, type IncomingMessage, type ServerResponse } from "node:http"

const port = Number(process.env.MOCK_PORT ?? 4097)

interface Part {
  id: string
  sessionID: string
  messageID: string
  type: string
  text?: string
  tool?: string
  callID?: string
  state?: Record<string, unknown>
}

interface MessageInfo {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time: { created: number; completed?: number }
  [key: string]: unknown
}

interface ConversationEntry {
  info: MessageInfo
  parts: Part[]
}

interface PendingPermission {
  request: Record<string, unknown>
  sessionID: string
  resolve: (response: unknown) => void
}

const sseClients = new Set<ServerResponse>()
const sessions = new Map<string, Record<string, unknown>>()
const conversations = new Map<string, ConversationEntry[]>()
const pendingPermissions = new Map<string, PendingPermission>()

// Seed from the clock so ids never repeat across runs: the BFF reuses a
// persistent SQLite DATA_DIR locally, so restarting at `ses_1` every time
// collided with the `isolated_sessions.session_id` primary key.
let sequence = Date.now()
const nextId = (prefix: string): string => `${prefix}_${(++sequence).toString(36)}`
const now = (): number => Date.now()
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) })
  res.end(payload)
}

function broadcast(event: unknown): void {
  const frame = `data: ${JSON.stringify({ directory: "/e2e", project: "global", payload: event })}\n\n`
  for (const client of sseClients) client.write(frame)
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = ""
    req.on("data", (chunk) => (raw += chunk))
    req.on("end", () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      } catch {
        resolve({})
      }
    })
  })
}

function openStream(res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  })
  res.write(
    `data: ${JSON.stringify({ directory: "/e2e", payload: { type: "server.connected", properties: {} } })}\n\n`,
  )
  sseClients.add(res)
  res.on("close", () => sseClients.delete(res))
}

function requestDirectory(req: IncomingMessage, url: URL): string {
  const query = url.searchParams.get("directory")
  if (query) return query
  const header = req.headers["x-opencode-directory"]
  if (typeof header === "string") return decodeURIComponent(header)
  return "/e2e/project"
}

function createSession(directory = "/e2e/project"): Record<string, unknown> {
  const session = {
    id: nextId("ses"),
    slug: "e2e-session",
    projectID: "global",
    directory,
    title: "",
    version: "1.0.0",
    time: { created: now(), updated: now() },
  }
  sessions.set(session.id, session)
  conversations.set(session.id, [])
  broadcast({ type: "session.created", properties: { info: session } })
  return session
}

function appendPart(sessionID: string, entry: ConversationEntry, part: Part): void {
  const existing = entry.parts.find((item) => item.id === part.id)
  if (existing) Object.assign(existing, part)
  else entry.parts.push(part)
  broadcast({ type: "message.part.updated", properties: { part: { ...part } } })
}

async function runSubagentPrompt(sessionID: string, text: string): Promise<void> {
  const conversation = conversations.get(sessionID)
  if (!conversation) return

  broadcast({ type: "session.status", properties: { sessionID, status: { type: "busy" } } })

  const user: ConversationEntry = {
    info: {
      id: nextId("msg"),
      sessionID,
      role: "user",
      time: { created: now() },
      agent: "build",
      model: { providerID: "test", modelID: "test-model" },
    },
    parts: [],
  }
  conversation.push(user)
  broadcast({ type: "message.updated", properties: { info: user.info } })
  appendPart(sessionID, user, { id: nextId("prt"), sessionID, messageID: user.info.id, type: "text", text })

  await delay(40)

  const child = createSession(sessions.get(sessionID)?.directory as string | undefined)
  const childID = child.id as string
  child.parentID = sessionID
  child.title = "Explore the repository (@explore subagent)"
  broadcast({ type: "session.updated", properties: { info: child } })

  const childConversation = conversations.get(childID)
  if (childConversation) {
    const childAssistant: ConversationEntry = {
      info: {
        id: nextId("msg"),
        sessionID: childID,
        role: "assistant",
        time: { created: now(), completed: now() },
        modelID: "test-model",
        providerID: "test",
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts: [],
    }
    childConversation.push(childAssistant)
    broadcast({ type: "message.updated", properties: { info: childAssistant.info } })
    appendPart(childID, childAssistant, {
      id: nextId("prt"),
      sessionID: childID,
      messageID: childAssistant.info.id,
      type: "text",
      text: "Found 3 files",
    })
  }

  const assistant: ConversationEntry = {
    info: {
      id: nextId("msg"),
      sessionID,
      role: "assistant",
      time: { created: now() },
      modelID: "test-model",
      providerID: "test",
      cost: 0.001,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    parts: [],
  }
  conversation.push(assistant)
  broadcast({ type: "message.updated", properties: { info: assistant.info } })

  const input = {
    subagent_type: "explore",
    description: "Explore the repository",
    prompt: "List the files in the project",
  }
  const task: Part = {
    id: nextId("prt"),
    sessionID,
    messageID: assistant.info.id,
    type: "tool",
    callID: nextId("call"),
    tool: "task",
    state: {
      status: "running",
      input,
      title: input.description,
      metadata: { sessionId: childID },
      time: { start: now() },
    },
  }
  appendPart(sessionID, assistant, task)

  await delay(120)

  task.state = {
    status: "completed",
    input,
    output: `<task id="${childID}" state="completed">\n<summary>Explore completed</summary>\n<task_result>Found 3 files</task_result>\n</task>`,
    title: input.description,
    metadata: { sessionId: childID },
    time: { start: now() - 100, end: now() },
  }
  appendPart(sessionID, assistant, task)

  assistant.info.time.completed = now()
  assistant.info.tokens = { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }
  broadcast({ type: "message.updated", properties: { info: assistant.info } })
  broadcast({ type: "session.status", properties: { sessionID, status: { type: "idle" } } })
  broadcast({ type: "session.idle", properties: { sessionID } })
}

async function runPrompt(sessionID: string, text: string, body: Record<string, unknown> = {}): Promise<void> {
  const conversation = conversations.get(sessionID)
  if (!conversation) return

  if (text.toLowerCase().includes("subagent")) return runSubagentPrompt(sessionID, text)

  const session = sessions.get(sessionID)
  const model = body.model as { providerID?: string; modelID?: string } | undefined
  if (session && model?.providerID && model.modelID) {
    session.model = {
      providerID: model.providerID,
      id: model.modelID,
      ...(typeof body.variant === "string" ? { variant: body.variant } : {}),
    }
  }

  broadcast({ type: "session.status", properties: { sessionID, status: { type: "busy" } } })

  const user: ConversationEntry = {
    info: {
      id: nextId("msg"),
      sessionID,
      role: "user",
      time: { created: now() },
      agent: "build",
      model: { providerID: "test", modelID: "test-model" },
    },
    parts: [],
  }
  conversation.push(user)
  broadcast({ type: "message.updated", properties: { info: user.info } })
  appendPart(sessionID, user, {
    id: nextId("prt"),
    sessionID,
    messageID: user.info.id,
    type: "text",
    text,
  })

  await delay(40)

  const assistant: ConversationEntry = {
    info: {
      id: nextId("msg"),
      sessionID,
      role: "assistant",
      time: { created: now() },
      modelID: "test-model",
      providerID: "test",
      cost: 0.001,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    parts: [],
  }
  conversation.push(assistant)
  broadcast({ type: "message.updated", properties: { info: assistant.info } })
  const answer: Part = {
    id: nextId("prt"),
    sessionID,
    messageID: assistant.info.id,
    type: "text",
    text: "Working…",
  }
  appendPart(sessionID, assistant, answer)

  await delay(40)

  const permissionID = nextId("per")
  const request = {
    id: permissionID,
    sessionID,
    permission: "bash",
    patterns: ["ls"],
    metadata: { command: "ls" },
    always: ["ls *"],
    tool: { messageID: assistant.info.id, callID: nextId("call") },
  }
  const decision = new Promise<unknown>((resolve) =>
    pendingPermissions.set(permissionID, { request, sessionID, resolve }),
  )
  broadcast({ type: "permission.asked", properties: request })
  await decision

  await delay(40)
  answer.text = "Done!"
  broadcast({ type: "message.part.updated", properties: { part: { ...answer } } })
  assistant.info.time.completed = now()
  assistant.info.tokens = { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }
  broadcast({ type: "message.updated", properties: { info: assistant.info } })
  broadcast({ type: "session.status", properties: { sessionID, status: { type: "idle" } } })
  broadcast({ type: "session.idle", properties: { sessionID } })
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost")
  const path = url.pathname
  const segments = path.split("/").filter(Boolean)

  void (async () => {
    if (req.method === "GET" && path === "/global/health") return json(res, 200, { healthy: true, version: "1.18.32" })
    if (req.method === "GET" && path === "/global/event") return openStream(res)
    if (req.method === "GET" && path === "/permission") {
      const directory = url.searchParams.get("directory")
      const list = [...pendingPermissions.values()]
        .filter((pending) => !directory || sessions.get(pending.sessionID)?.directory === directory)
        .map((pending) => pending.request)
      return json(res, 200, list)
    }
    if (req.method === "GET" && path === "/session") {
      const directory = url.searchParams.get("directory")
      const list = [...sessions.values()].filter((session) => !directory || session.directory === directory)
      return json(res, 200, list)
    }
    if (req.method === "POST" && path === "/session") return json(res, 200, createSession(requestDirectory(req, url)))
    if (req.method === "GET" && path === "/session/status") return json(res, 200, {})
    if (req.method === "GET" && path === "/project") return json(res, 200, [])
    if (req.method === "GET" && path === "/config") return json(res, 200, { model: "test/test-model" })
    if (req.method === "GET" && path === "/agent") {
      return json(res, 200, [
        { name: "build", mode: "primary" },
        { name: "plan", mode: "primary" },
        { name: "title", mode: "primary", hidden: true },
      ])
    }
    if (req.method === "GET" && path === "/config/providers") {
      return json(res, 200, {
        providers: [
          {
            id: "test",
            name: "Test",
            models: {
              "test-model": { id: "test-model", name: "Test Model", variants: { low: {}, high: {} } },
              alpha: { id: "alpha", name: "Alpha", variants: {} },
              beta: { id: "beta", name: "Beta", variants: {} },
              gamma: { id: "gamma", name: "Gamma", variants: {} },
              delta: { id: "delta", name: "Delta", variants: {} },
            },
          },
          {
            id: "other",
            name: "Other",
            models: {
              solo: { id: "solo", name: "Solo", variants: {} },
              echo: { id: "echo", name: "Echo", variants: {} },
              nova: { id: "nova", name: "Nova", variants: {} },
              flash: { id: "flash", name: "Flash", variants: {} },
            },
          },
        ],
        default: { test: "test-model" },
      })
    }

    if (segments[0] === "session" && segments[1]) {
      const sessionID = segments[1]
      if (req.method === "GET" && segments.length === 3 && segments[2] === "message") {
        return json(res, 200, conversations.get(sessionID) ?? [])
      }
      if (req.method === "POST" && segments[2] === "prompt_async") {
        const body = await readBody(req)
        const parts = Array.isArray(body.parts) ? (body.parts as Array<{ text?: string }>) : []
        res.writeHead(204)
        res.end()
        void runPrompt(sessionID, parts[0]?.text ?? "hello", body)
        return
      }
      if (req.method === "POST" && segments[2] === "abort") return json(res, 200, true)
      if (req.method === "DELETE" && segments.length === 2) {
        const session = sessions.get(sessionID)
        sessions.delete(sessionID)
        conversations.delete(sessionID)
        if (session) broadcast({ type: "session.deleted", properties: { info: session } })
        return json(res, 200, true)
      }
      if (req.method === "POST" && segments[2] === "permissions" && segments[3]) {
        const pending = pendingPermissions.get(segments[3])
        if (pending) {
          const body = await readBody(req)
          pendingPermissions.delete(segments[3])
          broadcast({
            type: "permission.replied",
            properties: { sessionID: pending.sessionID, requestID: segments[3], reply: body.response },
          })
          pending.resolve(body)
        }
        return json(res, 200, true)
      }
    }

    json(res, 404, { error: "not_found" })
  })()
})

server.listen(port, "127.0.0.1", () => {
  console.log(`[mock-opencode] listening on http://127.0.0.1:${port}`)
})

// Optional dev-server stand-in so preview tests can pass the BFF's reachability
// probe without running a real web server.
const previewPort = Number(process.env.MOCK_PREVIEW_PORT ?? "")
if (Number.isFinite(previewPort) && previewPort > 0) {
  createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" })
    res.end("<!doctype html><h1>Preview</h1>")
  }).listen(previewPort, "127.0.0.1", () => {
    console.log(`[mock-opencode] fake dev server on http://127.0.0.1:${previewPort}`)
  })
}
