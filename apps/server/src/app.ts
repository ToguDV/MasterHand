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
import type { Store } from "./store.js"
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
}

const KEEPALIVE_MS = 25_000
const MAX_DEVICE_NAME_LENGTH = 64

function clientIp(header: string | undefined): string {
  return header?.split(",")[0]?.trim() || "unknown"
}

export function createApp(deps: AppDeps): Hono {
  const { config } = deps
  const fetchImpl = deps.fetchImpl ?? fetch
  const createDir = deps.createDir ?? createWorkspaceDir
  const removeDir = deps.removeDir ?? removeWorkspaceDir
  const app = new Hono()
  const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 })

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

    if (c.req.query("deleteFiles") === "1") {
      if (!isInsideRoot(config.workspacesRoot, workspace.path)) {
        return c.json({ error: "outside_root" }, 403)
      }
      removeDir(workspace.path)
    }

    deps.store.removeWorkspace(workspace.id)
    return c.json({ ok: true })
  })

  app.route("/api", api)

  return app
}

export { SESSION_COOKIE }
