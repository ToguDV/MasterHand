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
