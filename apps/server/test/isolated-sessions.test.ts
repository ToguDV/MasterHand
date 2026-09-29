import { describe, expect, it, vi } from "vitest"
import { createFakeWorktreeManager, login, startTestApp } from "./helpers.js"

interface MockSession {
  id: string
  directory: string
  parentID?: string
}

interface OpencodeCall {
  method: string
  path: string
  directory: string | null
  body?: string
}

/** Minimal opencode stand-in for the session endpoints the BFF calls. */
function createOpencodeMock() {
  const sessions = new Map<string, MockSession[]>()
  const calls: OpencodeCall[] = []
  let counter = 0

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    const directory = url.searchParams.get("directory")
      ?? (init?.headers ? new Headers(init.headers).get("x-opencode-directory") : null)
    const decoded = directory ? decodeURIComponent(directory) : null
    calls.push({
      method,
      path: url.pathname,
      directory: decoded,
      body: typeof init?.body === "string" ? init.body : undefined,
    })

    if (method === "GET" && url.pathname === "/session") {
      return Response.json(sessions.get(decoded ?? "") ?? [])
    }
    if (method === "POST" && url.pathname === "/session") {
      const session: MockSession = { id: `ses_${++counter}`, directory: decoded ?? "" }
      const list = sessions.get(decoded ?? "") ?? []
      list.push(session)
      sessions.set(decoded ?? "", list)
      return Response.json(session)
    }
    if (method === "DELETE" && url.pathname.startsWith("/session/")) {
      return Response.json(true)
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch

  return { fetchImpl, sessions, calls }
}

async function setupApp() {
  const opencode = createOpencodeMock()
  const worktrees = createFakeWorktreeManager()
  const app = await startTestApp({ worktrees, fetchImpl: opencode.fetchImpl })
  const cookie = await login(app.url)
  const headers = { cookie, "content-type": "application/json" }

  const created = await fetch(`${app.url}/api/workspaces`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "app" }),
  })
  const { workspace } = (await created.json()) as { workspace: { id: string; path: string } }

  return { app, opencode, worktrees, headers, workspace }
}

describe("POST /api/workspaces/:id/sessions", () => {
  it("creates a standard session in the workspace folder", async () => {
    const { app, opencode, worktrees, headers, workspace } = await setupApp()
    try {
      const response = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      })
      expect(response.status).toBe(201)
      const body = (await response.json()) as {
        session: { id: string; isolation?: unknown }
        isolation: unknown
      }
      expect(body.session.isolation).toBeUndefined()
      expect(body.isolation).toBeNull()
      expect(opencode.calls.at(-1)).toMatchObject({
        method: "POST",
        path: "/session",
        directory: workspace.path,
      })
      expect(worktrees.calls).toHaveLength(0)
      expect(app.store.getIsolatedSession(body.session.id)).toBeNull()
    } finally {
      await app.close()
    }
  })

  it("creates an isolated session in a new worktree", async () => {
    const { app, opencode, worktrees, headers, workspace } = await setupApp()
    try {
      const response = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ isolated: true }),
      })
      expect(response.status).toBe(201)
      const body = (await response.json()) as {
        session: { id: string; isolation: { branch: string; worktreePath: string; baseRef: string } }
      }
      const isolation = body.session.isolation
      expect(isolation.branch).toMatch(/^masterhand\/app-[a-z0-9]+$/)
      expect(isolation.baseRef).toBe("main")
      expect(worktrees.calls.some((call) => call.startsWith("create:"))).toBe(true)

      const record = app.store.getIsolatedSession(body.session.id)
      expect(record).toMatchObject({ workspaceID: workspace.id, branch: isolation.branch })
      expect(opencode.calls.at(-1)).toMatchObject({ method: "POST", directory: isolation.worktreePath })
    } finally {
      await app.close()
    }
  })

  it("rolls the worktree back when opencode cannot create the session", async () => {
    const opencode = createOpencodeMock()
    const worktrees = createFakeWorktreeManager()
    const app = await startTestApp({
      worktrees,
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input))
        if ((init?.method ?? "GET") === "POST" && url.pathname === "/session") {
          return new Response("boom", { status: 500 })
        }
        return opencode.fetchImpl(input as string, init)
      }) as typeof fetch,
    })
    try {
      const cookie = await login(app.url)
      const headers = { cookie, "content-type": "application/json" }
      const created = await fetch(`${app.url}/api/workspaces`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "app" }),
      })
      const { workspace } = (await created.json()) as { workspace: { id: string } }

      const response = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ isolated: true }),
      })
      expect(response.status).toBe(500)
      expect(worktrees.calls.some((call) => call.startsWith("remove:"))).toBe(true)
      expect(app.store.listIsolatedSessions()).toHaveLength(0)
    } finally {
      await app.close()
    }
  })
})

describe("GET /api/workspaces/:id/sessions", () => {
  it("aggregates workspace and worktree sessions with isolation metadata", async () => {
    const { app, opencode, headers, workspace } = await setupApp()
    try {
      const standard = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      })
      const standardBody = (await standard.json()) as { session: { id: string } }
      const isolated = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ isolated: true }),
      })
      const isolatedBody = (await isolated.json()) as {
        session: { id: string; isolation: { worktreePath: string; branch: string } }
      }
      opencode.sessions.get(isolatedBody.session.isolation.worktreePath)?.push({
        id: "ses_child",
        directory: isolatedBody.session.isolation.worktreePath,
        parentID: isolatedBody.session.id,
      })

      const response = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, { headers })
      const body = (await response.json()) as {
        sessions: Array<{ id: string; isolation?: { branch: string } }>
      }
      const byID = new Map(body.sessions.map((session) => [session.id, session]))
      expect(byID.get(standardBody.session.id)?.isolation).toBeUndefined()
      expect(byID.get(isolatedBody.session.id)?.isolation?.branch).toBe(isolatedBody.session.isolation.branch)
      expect(byID.get("ses_child")?.isolation?.branch).toBe(isolatedBody.session.isolation.branch)
    } finally {
      await app.close()
    }
  })

  it("returns 502 when opencode is unreachable", async () => {
    const app = await startTestApp({ fetchImpl: (async () => {
      throw new Error("offline")
    }) as typeof fetch })
    try {
      const cookie = await login(app.url)
      const response = await fetch(`${app.url}/api/workspaces/missing/sessions`, { headers: { cookie } })
      expect(response.status).toBe(404)

      const created = await fetch(`${app.url}/api/workspaces`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "app" }),
      })
      const { workspace } = (await created.json()) as { workspace: { id: string } }
      const failing = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, { headers: { cookie } })
      expect(failing.status).toBe(502)
    } finally {
      await app.close()
    }
  })
})

describe("GET /api/workspaces/:id/directories", () => {
  it("lists the workspace folder plus every worktree", async () => {
    const { app, headers, workspace } = await setupApp()
    try {
      await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ isolated: true }),
      })
      const response = await fetch(`${app.url}/api/workspaces/${workspace.id}/directories`, { headers })
      const body = (await response.json()) as { directories: string[] }
      expect(body.directories[0]).toBe(workspace.path)
      expect(body.directories).toHaveLength(2)
    } finally {
      await app.close()
    }
  })
})

describe("DELETE /api/workspaces/:id/sessions/:sessionID", () => {
  it("removes an isolated session together with its worktree", async () => {
    const { app, opencode, worktrees, headers, workspace } = await setupApp()
    try {
      const created = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ isolated: true }),
      })
      const { session } = (await created.json()) as { session: { id: string; isolation: { worktreePath: string } } }

      const response = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions/${session.id}`, {
        method: "DELETE",
        headers,
      })
      expect(response.status).toBe(200)
      expect(opencode.calls.at(-1)).toMatchObject({
        method: "DELETE",
        directory: session.isolation.worktreePath,
      })
      expect(worktrees.calls.some((call) => call.startsWith("remove:"))).toBe(true)
      expect(app.store.getIsolatedSession(session.id)).toBeNull()
    } finally {
      await app.close()
    }
  })

  it("rejects a directory outside the workspace", async () => {
    const { app, headers, workspace } = await setupApp()
    try {
      const created = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      })
      const { session } = (await created.json()) as { session: { id: string } }

      const response = await fetch(
        `${app.url}/api/workspaces/${workspace.id}/sessions/${session.id}?directory=${encodeURIComponent("/etc")}`,
        { method: "DELETE", headers },
      )
      expect(response.status).toBe(403)
    } finally {
      await app.close()
    }
  })
})

describe("POST /api/isolated-sessions/:sessionID/finish", () => {
  it("commits locally when there is no remote", async () => {
    const { app, worktrees, headers, workspace } = await setupApp()
    try {
      const created = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ isolated: true }),
      })
      const { session } = (await created.json()) as { session: { id: string } }

      const response = await fetch(`${app.url}/api/isolated-sessions/${session.id}/finish`, {
        method: "POST",
        headers,
      })
      const body = (await response.json()) as {
        committed: boolean
        pushed: boolean
        prUrl: string | null
      }
      expect(body).toMatchObject({ committed: true, pushed: false, prUrl: null })
      expect(worktrees.calls.some((call) => call.startsWith("commit:"))).toBe(true)
      expect(app.store.getIsolatedSession(session.id)?.pushed).toBe(false)
    } finally {
      await app.close()
    }
  })

  it("pushes and reports the PR URL when a remote and CLI exist", async () => {
    const worktrees = createFakeWorktreeManager({
      hasRemote: () => true,
      remoteUrl: () => "git@github.com:org/repo.git",
      pullRequest: () => "https://github.com/org/repo/pull/1",
    })
    const opencode = createOpencodeMock()
    const app = await startTestApp({ worktrees, fetchImpl: opencode.fetchImpl })
    try {
      const cookie = await login(app.url)
      const headers = { cookie, "content-type": "application/json" }
      const created = await fetch(`${app.url}/api/workspaces`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "app" }),
      })
      const { workspace } = (await created.json()) as { workspace: { id: string } }
      const sessionResponse = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ isolated: true }),
      })
      const { session } = (await sessionResponse.json()) as { session: { id: string } }

      const response = await fetch(`${app.url}/api/isolated-sessions/${session.id}/finish`, {
        method: "POST",
        headers,
      })
      const body = (await response.json()) as { pushed: boolean; prUrl: string | null }
      expect(body.pushed).toBe(true)
      expect(body.prUrl).toBe("https://github.com/org/repo/pull/1")
      expect(worktrees.calls.some((call) => call.startsWith("push:"))).toBe(true)
      const record = app.store.getIsolatedSession(session.id)
      expect(record?.pushed).toBe(true)
      expect(record?.prUrl).toBe("https://github.com/org/repo/pull/1")
    } finally {
      await app.close()
    }
  })

  it("falls back to a compare URL without a provider CLI", async () => {
    const worktrees = createFakeWorktreeManager({
      hasRemote: () => true,
      remoteUrl: () => "git@github.com:org/repo.git",
    })
    const opencode = createOpencodeMock()
    const app = await startTestApp({ worktrees, fetchImpl: opencode.fetchImpl })
    try {
      const cookie = await login(app.url)
      const headers = { cookie, "content-type": "application/json" }
      const created = await fetch(`${app.url}/api/workspaces`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "app" }),
      })
      const { workspace } = (await created.json()) as { workspace: { id: string } }
      const sessionResponse = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ isolated: true }),
      })
      const { session } = (await sessionResponse.json()) as { session: { id: string } }

      const response = await fetch(`${app.url}/api/isolated-sessions/${session.id}/finish`, {
        method: "POST",
        headers,
      })
      const body = (await response.json()) as { prUrl: string | null }
      expect(body.prUrl).toMatch(/^https:\/\/github\.com\/org\/repo\/compare\/main\.\.\./)
    } finally {
      await app.close()
    }
  })

  it("reports a push failure and keeps the local commit", async () => {
    const worktrees = createFakeWorktreeManager({
      hasRemote: () => true,
      remoteUrl: () => "git@github.com:org/repo.git",
      push: vi.fn(() => {
        throw new Error("authentication failed")
      }),
    })
    const opencode = createOpencodeMock()
    const app = await startTestApp({ worktrees, fetchImpl: opencode.fetchImpl })
    try {
      const cookie = await login(app.url)
      const headers = { cookie, "content-type": "application/json" }
      const created = await fetch(`${app.url}/api/workspaces`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "app" }),
      })
      const { workspace } = (await created.json()) as { workspace: { id: string } }
      const sessionResponse = await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ isolated: true }),
      })
      const { session } = (await sessionResponse.json()) as { session: { id: string } }

      const response = await fetch(`${app.url}/api/isolated-sessions/${session.id}/finish`, {
        method: "POST",
        headers,
      })
      const body = (await response.json()) as { committed: boolean; pushed: boolean; error: string | null }
      expect(body.committed).toBe(true)
      expect(body.pushed).toBe(false)
      expect(body.error).toContain("authentication failed")
    } finally {
      await app.close()
    }
  })

  it("returns 404 for a session without isolation", async () => {
    const { app, headers } = await setupApp()
    try {
      const response = await fetch(`${app.url}/api/isolated-sessions/unknown/finish`, {
        method: "POST",
        headers,
      })
      expect(response.status).toBe(404)
    } finally {
      await app.close()
    }
  })
})

describe("DELETE /api/workspaces/:id", () => {
  it("cleans up worktrees and records when the workspace goes away", async () => {
    const { app, worktrees, headers, workspace } = await setupApp()
    try {
      await fetch(`${app.url}/api/workspaces/${workspace.id}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ isolated: true }),
      })
      const response = await fetch(`${app.url}/api/workspaces/${workspace.id}`, {
        method: "DELETE",
        headers,
      })
      expect(response.status).toBe(200)
      expect(worktrees.calls.some((call) => call.startsWith("remove:"))).toBe(true)
      expect(app.store.listIsolatedSessions()).toHaveLength(0)
    } finally {
      await app.close()
    }
  })
})
