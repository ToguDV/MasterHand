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

    const response = await fetch(`${app.url}/api/oc/api/info`, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ version: "1.2.3" })

    const proxied = upstream.requests.find((request) => request.path === "/api/info")
    expect(proxied?.authorization).toBe(TEST_AUTH)
  })

  it("proxies POST with a body and preserves the status", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url, opencodeAuth: TEST_AUTH } })
    const cookie = await login(app.url)

    const response = await fetch(`${app.url}/api/oc/api/session/ses_1/prompt_async`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: "hello" }] }),
    })
    expect(response.status).toBe(204)

    const proxied = upstream.requests.find((request) => request.path.includes("prompt_async"))
    expect(proxied).toBeDefined()
    // v2 no longer injects a `system` instruction: the body is byte-identical.
    expect(JSON.parse(proxied?.body ?? "{}")).toEqual({ parts: [{ type: "text", text: "hello" }] })
  })

  it("leaves an existing system prompt untouched", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url } })
    const cookie = await login(app.url)

    await fetch(`${app.url}/api/oc/api/session/ses_7/message`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: "hi" }], system: "Be terse." }),
    })

    const proxied = upstream.requests.find((request) => request.path.includes("/message"))
    expect(JSON.parse(proxied?.body ?? "{}")).toEqual({
      parts: [{ type: "text", text: "hi" }],
      system: "Be terse.",
    })
  })

  it("forwards the query string and allowed headers, but not the directory header", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url, opencodeAuth: TEST_AUTH } })
    const cookie = await login(app.url)

    await fetch(`${app.url}/api/oc/api/session?directory=%2Fworkspace%2Fapp&limit=200`, {
      headers: { cookie, "x-opencode-directory": "/workspace/app", "accept-language": "es-ES" },
    })

    const proxied = upstream.requests.find((request) => request.path === "/api/session")
    expect(proxied?.query).toBe("directory=%2Fworkspace%2Fapp&limit=200")
    expect(proxied?.headers["accept-language"]).toBe("es-ES")
    expect(proxied?.headers["x-opencode-directory"]).toBeUndefined()
    expect(proxied?.authorization).toBe(TEST_AUTH)
  })

  it("requires authentication to proxy", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url, opencodeAuth: TEST_AUTH } })

    const response = await fetch(`${app.url}/api/oc/api/info`)
    expect(response.status).toBe(401)
  })

  it("responds 502 when opencode is unavailable", async () => {
    app = await startTestApp({ config: { opencodeUrl: "http://127.0.0.1:1" } })
    const cookie = await login(app.url)

    const response = await fetch(`${app.url}/api/oc/api/info`, { headers: { cookie } })
    expect(response.status).toBe(502)
  })

  it("keeps the upstream origin fixed for protocol-relative paths (SSRF)", async () => {
    const seen: string[] = []
    const stub: typeof fetch = async (input) => {
      seen.push(
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
      )
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    app = await startTestApp({ config: { opencodeUrl: "http://127.0.0.1:4096" }, fetchImpl: stub })
    const cookie = await login(app.url)

    const response = await fetch(`${app.url}/api/oc//evil.example.com/steal`, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(seen).toHaveLength(1)
    expect(new URL(seen[0]!).host).toBe("127.0.0.1:4096")
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

    await waitFor(() => upstream!.requests.some((request) => request.path === "/api/event"))
    upstream.emit({ id: "evt_42", type: "session.idle", data: { sessionID: "ses_42" } })

    const reader = response.body!.getReader()
    const received = await readUntil(reader, "session.idle")
    expect(received).toContain('"sessionID":"ses_42"')
  })
})
