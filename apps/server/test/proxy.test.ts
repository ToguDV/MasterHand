import { afterEach, describe, expect, it } from "vitest"
import { login, readUntil, startMockOpencode, startTestApp, waitFor, type MockOpencode, type TestApp } from "./helpers.js"

const TEST_AUTH = `Basic ${Buffer.from("opencode:oc-secret").toString("base64")}`

let app: TestApp | null = null
let upstream: MockOpencode | null = null

afterEach(async () => {
  await app?.close()
  await upstream?.close()
  app = null
  upstream = null
})

describe("opencode proxy", () => {
  it("proxies GET and injects basic auth", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url, opencodeAuth: TEST_AUTH } })
    const cookie = await login(app.url)

    const response = await fetch(`${app.url}/api/oc/global/health`, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ healthy: true, version: "1.2.3" })

    const proxied = upstream.requests.find((request) => request.path === "/global/health")
    expect(proxied?.authorization).toBe(TEST_AUTH)
  })

  it("proxies POST with a body and preserves the status", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url, opencodeAuth: TEST_AUTH } })
    const cookie = await login(app.url)

    const response = await fetch(`${app.url}/api/oc/session/ses_1/prompt_async`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: "hello" }] }),
    })
    expect(response.status).toBe(204)

    const proxied = upstream.requests.find((request) => request.path.includes("prompt_async"))
    expect(proxied).toBeDefined()
    expect(JSON.parse(proxied?.body ?? "{}")).toEqual({ parts: [{ type: "text", text: "hello" }] })
  })

  it("forwards the x-opencode-directory header on mutations", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url, opencodeAuth: TEST_AUTH } })
    const cookie = await login(app.url)

    await fetch(`${app.url}/api/oc/session`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "x-opencode-directory": "/workspace/app" },
      body: "{}",
    })

    const proxied = upstream.requests.find((request) => request.path === "/session")
    expect(proxied?.directory).toBe("/workspace/app")
    expect(proxied?.authorization).toBe(TEST_AUTH)
  })

  it("requires authentication to proxy", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url, opencodeAuth: TEST_AUTH } })

    const response = await fetch(`${app.url}/api/oc/global/health`)
    expect(response.status).toBe(401)
  })

  it("responds 502 when opencode is unavailable", async () => {
    app = await startTestApp({ config: { opencodeUrl: "http://127.0.0.1:1" } })
    const cookie = await login(app.url)

    const response = await fetch(`${app.url}/api/oc/global/health`, { headers: { cookie } })
    expect(response.status).toBe(502)
  })
})

describe("SSE relay", () => {
  it("forwards upstream events to clients", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url, opencodeAuth: TEST_AUTH } })
    const cookie = await login(app.url)

    const response = await fetch(`${app.url}/api/events`, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")

    await waitFor(() => upstream!.requests.some((request) => request.path === "/global/event"))
    upstream.emit({ type: "session.idle", properties: { sessionID: "ses_42" } })

    const reader = response.body!.getReader()
    const received = await readUntil(reader, "session.idle")
    expect(received).toContain('"sessionID":"ses_42"')
  })
})
