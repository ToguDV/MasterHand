import { afterEach, describe, expect, it } from "vitest"
import { login, startMockOpencode, startTestApp, type MockOpencode, type TestApp } from "./helpers.js"

let app: TestApp | null = null
let upstream: MockOpencode | null = null

afterEach(async () => {
  await app?.close()
  await upstream?.close()
  app = null
  upstream = null
})

describe("request validation", () => {
  it("rejects a non-JSON login body", async () => {
    app = await startTestApp()
    const response = await fetch(`${app.url}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    })
    expect(response.status).toBe(400)
  })

  it("rejects a device request with an invalid body", async () => {
    app = await startTestApp()
    const response = await fetch(`${app.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    })
    expect(response.status).toBe(400)
  })

  it("rejects a device request with an empty password", async () => {
    app = await startTestApp()
    const response = await fetch(`${app.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Phone" }),
    })
    expect(response.status).toBe(400)
  })

  it("falls back to a default device name", async () => {
    app = await startTestApp()
    const response = await fetch(`${app.url}/api/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "secret", name: "   " }),
    })
    expect(response.status).toBe(201)
    expect((await response.json()) as { device: { name: string } }).toMatchObject({
      device: { name: "Device" },
    })
  })
})

describe("/api/status", () => {
  it("reports a healthy opencode upstream", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url } })
    const cookie = await login(app.url)

    const response = await fetch(`${app.url}/api/status`, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      opencode: { healthy: true, version: "1.2.3" },
    })
  })
})

describe("/api/workspaces", () => {
  it("creates the folder under the root, lists and removes it", async () => {
    const createdPaths: string[] = []
    app = await startTestApp({ createDir: (path) => createdPaths.push(path) })
    const cookie = await login(app.url)

    const created = await fetch(`${app.url}/api/workspaces`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "my-app" }),
    })
    expect(created.status).toBe(201)
    const body = (await created.json()) as { workspace: { id: string; name: string; path: string } }
    expect(body.workspace).toMatchObject({
      name: "my-app",
      path: "/tmp/masterhand-workspaces/my-app",
    })
    expect(createdPaths).toEqual(["/tmp/masterhand-workspaces/my-app"])

    const listed = await fetch(`${app.url}/api/workspaces`, { headers: { cookie } })
    expect(listed.status).toBe(200)
    expect((await listed.json()) as { workspaces: unknown[] }).toMatchObject({
      workspaces: [{ id: body.workspace.id }],
    })

    const removed = await fetch(`${app.url}/api/workspaces/${body.workspace.id}`, {
      method: "DELETE",
      headers: { cookie },
    })
    expect(removed.status).toBe(200)
    const empty = await fetch(`${app.url}/api/workspaces`, { headers: { cookie } })
    expect((await empty.json()) as { workspaces: unknown[] }).toMatchObject({ workspaces: [] })
  })

  it("trims the given name", async () => {
    app = await startTestApp()
    const cookie = await login(app.url)
    const response = await fetch(`${app.url}/api/workspaces`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "  Cool app  " }),
    })
    const body = (await response.json()) as { workspace: { name: string; path: string } }
    expect(body.workspace).toMatchObject({ name: "Cool app", path: "/tmp/masterhand-workspaces/Cool app" })
  })

  it("rejects invalid and duplicate names", async () => {
    app = await startTestApp()
    const cookie = await login(app.url)

    const invalid = await fetch(`${app.url}/api/workspaces`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "../etc" }),
    })
    expect(invalid.status).toBe(400)

    const payload = JSON.stringify({ name: "app" })
    const first = await fetch(`${app.url}/api/workspaces`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: payload,
    })
    expect(first.status).toBe(201)
    const duplicate = await fetch(`${app.url}/api/workspaces`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: payload,
    })
    expect(duplicate.status).toBe(409)
  })

  it("deletes the folder when deleteFiles is set", async () => {
    const removedPaths: string[] = []
    app = await startTestApp({ removeDir: (path) => removedPaths.push(path) })
    const cookie = await login(app.url)
    const created = await fetch(`${app.url}/api/workspaces`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "app" }),
    })
    const { workspace } = (await created.json()) as { workspace: { id: string; path: string } }

    const response = await fetch(`${app.url}/api/workspaces/${workspace.id}?deleteFiles=1`, {
      method: "DELETE",
      headers: { cookie },
    })
    expect(response.status).toBe(200)
    expect(removedPaths).toEqual([workspace.path])
  })

  it("refuses to delete files outside the root but still forgets the workspace", async () => {
    const removedPaths: string[] = []
    app = await startTestApp({ removeDir: (path) => removedPaths.push(path) })
    const cookie = await login(app.url)
    app.store.createWorkspace({ id: "legacy", name: "legacy", path: "/etc", createdAt: Date.now() })

    const refused = await fetch(`${app.url}/api/workspaces/legacy?deleteFiles=1`, {
      method: "DELETE",
      headers: { cookie },
    })
    expect(refused.status).toBe(403)
    expect(removedPaths).toEqual([])

    const forgotten = await fetch(`${app.url}/api/workspaces/legacy`, {
      method: "DELETE",
      headers: { cookie },
    })
    expect(forgotten.status).toBe(200)
  })

  it("returns 404 when removing an unknown workspace", async () => {
    app = await startTestApp()
    const cookie = await login(app.url)
    const response = await fetch(`${app.url}/api/workspaces/missing`, {
      method: "DELETE",
      headers: { cookie },
    })
    expect(response.status).toBe(404)
  })

  it("requires authentication", async () => {
    app = await startTestApp()
    const response = await fetch(`${app.url}/api/workspaces`)
    expect(response.status).toBe(401)
  })
})

describe("origin checks", () => {
  it("allows requests whose origin matches the request host", async () => {
    app = await startTestApp()
    const response = await fetch(`${app.url}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: app.url },
      body: JSON.stringify({ password: "secret" }),
    })
    expect(response.status).toBe(200)
  })

  it("rejects an unparseable allowlisted origin", async () => {
    app = await startTestApp({ config: { allowedOrigins: ["not a url"] } })
    const response = await fetch(`${app.url}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "not a url" },
      body: JSON.stringify({ password: "secret" }),
    })
    expect(response.status).toBe(403)
  })
})

describe("login rate limiting", () => {
  it("cannot be bypassed by rotating X-Forwarded-For", async () => {
    app = await startTestApp()

    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const response = await fetch(`${app.url}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${i}` },
        body: JSON.stringify({ password: "wrong" }),
      })
      statuses.push(response.status)
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statuses[5]).toBe(429)
  })
})
