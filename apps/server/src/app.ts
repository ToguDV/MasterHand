import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createDeviceToken,
  createRateLimiter,
  createSessionToken,
  passwordsMatch,
  requireAuth,
  requireSameOrigin,
  setSessionCookie,
} from "./auth.js"
import type { Config } from "./config.js"
import type { EventHub } from "./events.js"
import { createOpencodeProxy } from "./proxy.js"
import type { IsolatedSessionRecord, Store } from "./store.js"
import {
  createWorktreeManager,
  pullRequestUrl,
  worktreeBranch,
  worktreeDir,
  type WorktreeManager,
} from "./worktrees.js"
import {
  createWorkspaceDir,
  isInsideRoot,
  normalizeWorkspaceSlug,
  removeWorkspaceDir,
  workspacePath,
} from "./workspaces.js"

export interface AppDeps {
  config: Config
  store: Store
  hub: EventHub
  fetchImpl?: typeof fetch
  /** Overridable for tests: create/delete workspace folders. */
  createDir?: (path: string) => void
  removeDir?: (path: string) => void
  /** Overridable for tests: git worktree operations. */
  worktrees?: WorktreeManager
}

const KEEPALIVE_MS = 25_000
const MAX_DEVICE_NAME_LENGTH = 64

interface OpencodeSession {
  id: string
  parentID?: string
}

function clientIp(header: string | undefined): string {
  return header?.split(",")[0]?.trim() || "unknown"
}

/** Fields MasterHand adds to an isolated session for the clients. */
function isolationOf(record: IsolatedSessionRecord) {
  return {
    isolated: true as const,
    worktreePath: record.path,
    branch: record.branch,
    baseRef: record.baseRef,
    pushed: record.pushed,
    prUrl: record.prUrl,
  }
}

export function createApp(deps: AppDeps): Hono {
  const { config } = deps
  const fetchImpl = deps.fetchImpl ?? fetch
  const createDir = deps.createDir ?? createWorkspaceDir
  const removeDir = deps.removeDir ?? removeWorkspaceDir
  const app = new Hono()
  const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 })
  const worktrees =
    deps.worktrees ??
    createWorktreeManager({
      userName: config.gitUserName,
      userEmail: config.gitUserEmail,
    })

  /**
   * Calls opencode directly (injecting basic auth). The `directory` override
   * travels as a query parameter on GET and as the header on mutations, exactly
   * like the clients' proxy calls.
   */
  function callOpencode(
    path: string,
    options: { method?: string; directory?: string | null; body?: unknown } = {},
  ): Promise<Response> {
    const method = options.method ?? "GET"
    const headers = new Headers()
    if (config.opencodeAuth) headers.set("authorization", config.opencodeAuth)
    if (options.body !== undefined) headers.set("content-type", "application/json")
    if (options.directory && method !== "GET" && method !== "HEAD") {
      headers.set("x-opencode-directory", encodeURIComponent(options.directory))
    }
    const target = new URL(path, config.opencodeUrl)
    if (options.directory && (method === "GET" || method === "HEAD")) {
      target.searchParams.set("directory", options.directory)
    }
    return fetchImpl(target, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  }

  async function sessionsInDirectory(directory: string): Promise<OpencodeSession[]> {
    const response = await callOpencode("/session", { directory })
    if (!response.ok) throw new Error(`opencode ${response.status}`)
    return (await response.json()) as OpencodeSession[]
  }

  app.use("/api/*", requireSameOrigin(config))

  app.get("/api/health", (c) => c.json({ ok: true }))

  app.post("/api/login", async (c) => {
    const ip = clientIp(c.req.header("x-forwarded-for"))
    if (!loginLimiter.check(ip)) {
      return c.json({ error: "too_many_attempts" }, 429)
    }

    let password: unknown
    try {
      password = (await c.req.json<{ password?: unknown }>()).password
    } catch {
      password = undefined
    }
    if (typeof password !== "string" || password.length === 0) {
      return c.json({ error: "bad_request" }, 400)
    }
    if (!passwordsMatch(password, config.masterhandPassword)) {
      return c.json({ error: "invalid_password" }, 401)
    }

    loginLimiter.reset(ip)
    const token = createSessionToken(config.sessionSecret, config.sessionTtlHours * 3600)
    setSessionCookie(c, token, config)
    return c.json({ ok: true })
  })

  app.post("/api/devices", async (c) => {
    const ip = clientIp(c.req.header("x-forwarded-for"))
    if (!loginLimiter.check(ip)) {
      return c.json({ error: "too_many_attempts" }, 429)
    }

    let body: { password?: unknown; name?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "bad_request" }, 400)
    }
    if (typeof body.password !== "string" || body.password.length === 0) {
      return c.json({ error: "bad_request" }, 400)
    }
    if (!passwordsMatch(body.password, config.masterhandPassword)) {
      return c.json({ error: "invalid_password" }, 401)
    }

    loginLimiter.reset(ip)
    const now = Date.now()
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, MAX_DEVICE_NAME_LENGTH)
        : "Device"
    const device = { id: randomUUID(), name, createdAt: now, lastUsedAt: now }
    deps.store.create(device)
    const token = createDeviceToken(config.sessionSecret, device.id, config.sessionTtlHours * 3600)
    return c.json({ token, device }, 201)
  })

  app.post("/api/logout", (c) => {
    clearSessionCookie(c, config)
    return c.json({ ok: true })
  })

  app.use("/api/oc/*", requireAuth(config, deps.store))
  app.all("/api/oc/*", createOpencodeProxy(config, fetchImpl))

  const api = new Hono()
  api.use("*", requireAuth(config, deps.store))

  api.get("/status", async (c) => {
    try {
      const health = await fetchImpl(new URL("/global/health", config.opencodeUrl), {
        headers: config.opencodeAuth ? { authorization: config.opencodeAuth } : {},
        signal: AbortSignal.timeout(3000),
      })
      if (!health.ok) return c.json({ ok: true, opencode: { healthy: false } })
      const data = (await health.json()) as { healthy?: boolean; version?: string }
      return c.json({ ok: true, opencode: { healthy: data.healthy === true, version: data.version } })
    } catch {
      return c.json({ ok: true, opencode: { healthy: false } })
    }
  })

  api.get("/events", (c) => {
    c.header("cache-control", "no-cache")
    c.header("x-accel-buffering", "no")
    return streamSSE(c, async (stream) => {
      let closed = false
      const unsubscribe = deps.hub.subscribe((event) => {
        if (closed) return
        void stream.writeSSE({ data: JSON.stringify(event) })
      })
      stream.onAbort(() => {
        closed = true
        unsubscribe()
      })

      try {
        await stream.writeSSE({
          event: "hello",
          data: JSON.stringify({ connected: deps.hub.connected }),
        })
        while (!closed) {
          await stream.sleep(KEEPALIVE_MS)
          if (!closed) await stream.writeSSE({ event: "ping", data: "{}" })
        }
      } catch {
        // client disconnected
      } finally {
        closed = true
        unsubscribe()
      }
    })
  })

  api.get("/devices", (c) => c.json({ devices: deps.store.list() }))

  api.delete("/devices/:id", (c) => {
    deps.store.remove(c.req.param("id"))
    return c.json({ ok: true })
  })

  api.get("/workspaces", (c) => c.json({ workspaces: deps.store.listWorkspaces() }))

  api.post("/workspaces", async (c) => {
    let body: { name?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "bad_request" }, 400)
    }

    const result = normalizeWorkspaceSlug(body.name)
    if (!result.ok) return c.json({ error: "invalid_name" }, 400)

    const path = workspacePath(config.workspacesRoot, result.slug)
    if (deps.store.getWorkspaceByPath(path)) {
      return c.json({ error: "already_exists" }, 409)
    }

    createDir(path)
    const workspace = { id: randomUUID(), name: result.slug, path, createdAt: Date.now() }
    deps.store.createWorkspace(workspace)
    return c.json({ workspace }, 201)
  })

  api.delete("/workspaces/:id", (c) => {
    const workspace = deps.store.getWorkspace(c.req.param("id"))
    if (!workspace) return c.json({ error: "not_found" }, 404)

    // Isolated worktrees live outside the workspace folder, so they always
    // have to be cleaned up explicitly.
    for (const record of deps.store.listIsolatedSessions(workspace.id)) {
      try {
        worktrees.remove(workspace.path, record.path, record.branch)
      } catch {
        // best effort: the folder may already be gone
      }
      deps.store.removeIsolatedSession(record.sessionID)
    }

    if (c.req.query("deleteFiles") === "1") {
      if (!isInsideRoot(config.workspacesRoot, workspace.path)) {
        return c.json({ error: "outside_root" }, 403)
      }
      removeDir(workspace.path)
    }

    deps.store.removeWorkspace(workspace.id)
    return c.json({ ok: true })
  })

  api.get("/workspaces/:id/directories", (c) => {
    const workspace = deps.store.getWorkspace(c.req.param("id"))
    if (!workspace) return c.json({ error: "not_found" }, 404)
    const directories = [
      workspace.path,
      ...deps.store.listIsolatedSessions(workspace.id).map((record) => record.path),
    ]
    return c.json({ directories })
  })

  api.get("/workspaces/:id/sessions", async (c) => {
    const workspace = deps.store.getWorkspace(c.req.param("id"))
    if (!workspace) return c.json({ error: "not_found" }, 404)

    const records = deps.store.listIsolatedSessions(workspace.id)
    let lists: OpencodeSession[][]
    try {
      // The base folder must answer (502 otherwise); a missing/broken worktree
      // only drops its own sessions.
      lists = await Promise.all([
        sessionsInDirectory(workspace.path),
        ...records.map((record) => sessionsInDirectory(record.path).catch(() => [])),
      ])
    } catch {
      return c.json({ error: "opencode_unreachable" }, 502)
    }

    const byID = new Map(records.map((record) => [record.sessionID, record]))
    const merged = new Map<string, OpencodeSession & { isolation?: ReturnType<typeof isolationOf> }>()
    for (const session of lists.flat()) {
      // Child (subagent) sessions inherit their parent's worktree annotation.
      const record = byID.get(session.id) ?? (session.parentID ? byID.get(session.parentID) : undefined)
      merged.set(session.id, record ? { ...session, isolation: isolationOf(record) } : session)
    }
    return c.json({ sessions: [...merged.values()] })
  })

  api.post("/workspaces/:id/sessions", async (c) => {
    const workspace = deps.store.getWorkspace(c.req.param("id"))
    if (!workspace) return c.json({ error: "not_found" }, 404)

    let body: { isolated?: unknown } = {}
    try {
      body = await c.req.json()
    } catch {
      // an empty body means a standard (non-isolated) session
    }

    if (body.isolated !== true) {
      let response: Response
      try {
        response = await callOpencode("/session", { method: "POST", directory: workspace.path, body: {} })
      } catch {
        return c.json({ error: "opencode_unreachable" }, 502)
      }
      if (!response.ok) return c.json({ error: "opencode_error" }, 502)
      return c.json({ session: await response.json(), isolation: null }, 201)
    }

    const token = randomUUID().replace(/-/g, "").slice(0, 10)
    let path: string
    let branch: string
    let baseRef: string
    try {
      branch = worktreeBranch(workspace.name, token)
      path = worktreeDir(config.worktreesRoot, workspace.name, token)
    } catch {
      return c.json({ error: "invalid_isolation" }, 400)
    }

    let sessionID: string | null = null
    try {
      worktrees.ensureRepo(workspace.path)
      baseRef = worktrees.headBranch(workspace.path)
      worktrees.create(workspace.path, path, branch, baseRef)

      const response = await callOpencode("/session", { method: "POST", directory: path, body: {} })
      if (!response.ok) throw new Error("opencode_error")
      const session = (await response.json()) as OpencodeSession
      sessionID = session.id

      const record: IsolatedSessionRecord = {
        sessionID: session.id,
        workspaceID: workspace.id,
        path,
        branch,
        baseRef,
        pushed: false,
        prUrl: null,
        createdAt: Date.now(),
      }
      deps.store.createIsolatedSession(record)
      return c.json({ session: { ...session, isolation: isolationOf(record) }, isolation: isolationOf(record) }, 201)
    } catch (error) {
      if (sessionID) {
        void callOpencode(`/session/${encodeURIComponent(sessionID)}`, {
          method: "DELETE",
          directory: path,
        }).catch(() => {})
      }
      try {
        worktrees.remove(workspace.path, path, branch)
      } catch {
        // the worktree may not exist if creation failed early
      }
      return c.json(
        { error: "isolation_failed", detail: error instanceof Error ? error.message : "unknown" },
        500,
      )
    }
  })

  api.delete("/workspaces/:id/sessions/:sessionID", async (c) => {
    const workspace = deps.store.getWorkspace(c.req.param("id"))
    if (!workspace) return c.json({ error: "not_found" }, 404)
    const sessionID = c.req.param("sessionID")
    const record = deps.store.getIsolatedSession(sessionID)
    const isolated = record && record.workspaceID === workspace.id

    // The client passes the directory it resolved (worktree for child sessions).
    const requested = c.req.query("directory")
    let directory = isolated ? record.path : workspace.path
    if (requested) {
      const allowed = [
        workspace.path,
        ...deps.store.listIsolatedSessions(workspace.id).map((item) => item.path),
      ]
      if (!allowed.includes(requested)) return c.json({ error: "outside_workspace" }, 403)
      directory = requested
    }

    let response: Response
    try {
      response = await callOpencode(`/session/${encodeURIComponent(sessionID)}`, {
        method: "DELETE",
        directory,
      })
    } catch {
      return c.json({ error: "opencode_unreachable" }, 502)
    }
    if (!response.ok && response.status !== 404) return c.json({ error: "opencode_error" }, 502)

    if (isolated) {
      try {
        worktrees.remove(workspace.path, record.path, record.branch)
      } catch {
        // best effort: never block deleting the session record
      }
      deps.store.removeIsolatedSession(sessionID)
    }
    return c.json({ ok: true })
  })

  api.post("/isolated-sessions/:sessionID/finish", async (c) => {
    const record = deps.store.getIsolatedSession(c.req.param("sessionID"))
    if (!record) return c.json({ error: "not_found" }, 404)
    const workspace = deps.store.getWorkspace(record.workspaceID)
    if (!workspace) return c.json({ error: "not_found" }, 404)

    let committed = false
    try {
      committed = worktrees.commitAll(record.path, `MasterHand session ${record.sessionID}`)
    } catch (error) {
      return c.json(
        { error: "commit_failed", detail: error instanceof Error ? error.message : "unknown" },
        500,
      )
    }

    let pushed = false
    let pushError: string | null = null
    let prUrl = record.prUrl
    const remoteUrl = worktrees.remoteUrl(record.path)
    if (remoteUrl) {
      try {
        worktrees.push(record.path, record.branch)
        pushed = true
      } catch (error) {
        pushError = error instanceof Error ? error.message : "push_failed"
      }
      if (pushed) {
        // Prefer the provider CLI when authenticated; otherwise hand back a
        // ready-to-open compare URL.
        prUrl =
          worktrees.pullRequest(record.path, remoteUrl, record.branch, record.baseRef) ??
          pullRequestUrl(remoteUrl, record.branch, record.baseRef)
      }
    }

    deps.store.updateIsolatedSession(record.sessionID, { pushed, prUrl })
    return c.json({
      committed,
      pushed,
      prUrl,
      branch: record.branch,
      path: record.path,
      error: pushError,
    })
  })

  app.route("/api", api)

  return app
}

export { SESSION_COOKIE }
