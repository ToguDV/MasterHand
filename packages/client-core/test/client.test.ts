import { describe, expect, it } from "vitest"
import { ApiError, createClient } from "../src/client"
import { createEventStream } from "../src/events"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

type FetchCall = { url: string; init?: RequestInit }

function recordingFetch(response: () => Response): { calls: FetchCall[]; fetchImpl: typeof fetch } {
  const calls: FetchCall[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return response()
  }) as typeof fetch
  return { calls, fetchImpl }
}

describe("createClient", () => {
  it("joins the base URL with the BFF session prefix", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({ sessions: [{ id: "ses_1" }] }))
    const client = createClient({ baseUrl: "https://mh.example/", fetchImpl })

    const sessions = await client.api.sessions.list("ws_1")
    expect(sessions).toEqual([{ id: "ses_1" }])
    expect(calls[0]?.url).toBe("https://mh.example/api/workspaces/ws_1/sessions")
    expect(calls[0]?.init?.credentials).toBe("same-origin")
  })

  it("sends a Bearer token when getToken returns one", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({ ok: true }))
    const client = createClient({ baseUrl: "", getToken: () => "tok_123", fetchImpl })

    await client.auth.status()
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get("authorization")).toBe("Bearer tok_123")
    expect(calls[0]?.url).toBe("/api/status")
  })

  it("sets a JSON content-type for bodies", async () => {
    const { calls, fetchImpl } = recordingFetch(() => new Response(null, { status: 204 }))
    const client = createClient({ baseUrl: "", fetchImpl })

    await client.api.promptAsync("ses_1", { parts: [{ type: "text", text: "hi" }] })
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get("content-type")).toBe("application/json")
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ parts: [{ type: "text", text: "hi" }] }))
  })

  it("returns undefined for 204 responses", async () => {
    const { fetchImpl } = recordingFetch(() => new Response(null, { status: 204 }))
    const client = createClient({ fetchImpl })
    expect(await client.api.abortSession("ses_1")).toBeUndefined()
  })

  it("throws ApiError and reports 401s", async () => {
    let unauthorized = 0
    const { fetchImpl } = recordingFetch(() => new Response("unauthorized", { status: 401 }))
    const client = createClient({ onUnauthorized: () => unauthorized++, fetchImpl })

    await expect(client.api.sessions.list("ws_1")).rejects.toBeInstanceOf(ApiError)
    expect(unauthorized).toBe(1)
  })

  it("creates device tokens through the BFF", async () => {
    const { calls, fetchImpl } = recordingFetch(() =>
      jsonResponse({ token: "tok", device: { id: "dev_1", name: "Phone" } }, 201),
    )
    const client = createClient({ baseUrl: "https://mh.example", fetchImpl })

    const result = await client.auth.loginDevice("secret", "Phone")
    expect(result.token).toBe("tok")
    expect(calls[0]?.url).toBe("https://mh.example/api/devices")
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ password: "secret", name: "Phone" })
  })
})

describe("createEventStream", () => {
  it("parses server-sent events and reports connection changes", async () => {
    const events: unknown[] = []
    const states: boolean[] = []
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': comment\n\ndata: {"type":"session.idle","properties":{}}\n\n'))
        controller.close()
      },
    })
    const fetchImpl = (async () =>
      new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })) as typeof fetch

    const stream = createEventStream({
      baseUrl: "https://mh.example",
      fetchImpl,
      getToken: () => "tok",
      onEvent: (event) => events.push(event),
      onConnectionChange: (connected) => states.push(connected),
    })
    stream.start()
    await new Promise((resolve) => setTimeout(resolve, 50))
    stream.stop()

    expect(events).toEqual([{ type: "session.idle", properties: {} }])
    expect(states).toEqual([true, false])
  })
})

describe("client routes", () => {
  it("targets the expected BFF and opencode endpoints", async () => {
    const calls: FetchCall[] = []
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return jsonResponse({ devices: [] })
    }) as typeof fetch
    const client = createClient({ baseUrl: "https://mh.example", fetchImpl })

    await client.auth.login("pw")
    await client.auth.logout()
    await client.auth.status()
    await client.auth.devices()
    await client.auth.revokeDevice("dev/1")
    await client.api.sessions.list("ws_1")
    await client.api.sessions.create("ws_1")
    await client.api.sessions.remove("ws_1", "ses_1")
    await client.api.abortSession("ses_1")
    await client.api.messages("ses_1")
    await client.api.promptAsync("ses_1", { parts: [{ type: "text", text: "hi" }] })
    await client.api.permissions()
    await client.api.respondPermission("ses_1", "per_1", "once")
    await client.api.agents()
    await client.api.providers()
    await client.api.config()
    await client.api.statuses()
    await client.api.projects()
    await client.workspaces.list()
    await client.workspaces.create({ name: "app" })
    await client.workspaces.remove("ws/1")

    const routes = calls.map((call) => `${call.init?.method ?? "GET"} ${call.url}`)
    expect(routes).toEqual([
      "POST https://mh.example/api/login",
      "POST https://mh.example/api/logout",
      "GET https://mh.example/api/status",
      "GET https://mh.example/api/devices",
      "DELETE https://mh.example/api/devices/dev%2F1",
      "GET https://mh.example/api/workspaces/ws_1/sessions",
      "POST https://mh.example/api/workspaces/ws_1/sessions",
      "DELETE https://mh.example/api/workspaces/ws_1/sessions/ses_1",
      "POST https://mh.example/api/oc/session/ses_1/abort",
      "GET https://mh.example/api/oc/session/ses_1/message",
      "POST https://mh.example/api/oc/session/ses_1/prompt_async",
      "GET https://mh.example/api/oc/permission",
      "POST https://mh.example/api/oc/session/ses_1/permissions/per_1",
      "GET https://mh.example/api/oc/agent",
      "GET https://mh.example/api/oc/config/providers",
      "GET https://mh.example/api/oc/config",
      "GET https://mh.example/api/oc/session/status",
      "GET https://mh.example/api/oc/project",
      "GET https://mh.example/api/workspaces",
      "POST https://mh.example/api/workspaces",
      "DELETE https://mh.example/api/workspaces/ws%2F1",
    ])
  })

  it("unwraps the device list", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ devices: [{ id: "dev_1" }] }))
    const client = createClient({ fetchImpl })
    expect(await client.auth.devices()).toEqual([{ id: "dev_1" }])
  })

  it("preserves a caller-provided content-type", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({}))
    const client = createClient({ fetchImpl })
    await client.auth.login("pw")
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get("content-type")).toBe("application/json")
  })
})

describe("workspace directory routing", () => {
  it("appends the directory as a query parameter on GET", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse([]))
    const client = createClient({ baseUrl: "https://mh.example", fetchImpl })

    await client.api.messages("ses_1", "/workspace/my app")
    expect(calls[0]?.url).toBe(
      "https://mh.example/api/oc/session/ses_1/message?directory=%2Fworkspace%2Fmy%20app",
    )
    expect(new Headers(calls[0]?.init?.headers).has("x-opencode-directory")).toBe(false)
  })

  it("sends the directory as a header on mutations", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({ id: "ses_1" }))
    const client = createClient({ baseUrl: "https://mh.example", fetchImpl })

    await client.api.abortSession("ses_1", "/workspace/app")
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get("x-opencode-directory")).toBe("%2Fworkspace%2Fapp")
    expect(calls[0]?.url).toBe("https://mh.example/api/oc/session/ses_1/abort")
  })

  it("omits the directory when none is given", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse([]))
    const client = createClient({ baseUrl: "https://mh.example", fetchImpl })
    await client.api.messages("ses_1")
    expect(calls[0]?.url).toBe("https://mh.example/api/oc/session/ses_1/message")
  })
})

describe("isolated sessions", () => {
  it("creates an isolated session with the flag in the body", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({ session: { id: "ses_1" } }, 201))
    const client = createClient({ baseUrl: "https://mh.example", fetchImpl })

    const session = await client.api.sessions.create("ws_1", { isolated: true })
    expect(session).toEqual({ id: "ses_1" })
    expect(calls[0]?.url).toBe("https://mh.example/api/workspaces/ws_1/sessions")
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ isolated: true })
  })

  it("passes the resolved directory when removing a session", async () => {
    const { calls, fetchImpl } = recordingFetch(() => new Response(null, { status: 204 }))
    const client = createClient({ baseUrl: "https://mh.example", fetchImpl })

    await client.api.sessions.remove("ws_1", "ses_1", "/workspace/.worktrees/app/abc")
    expect(calls[0]?.url).toBe(
      "https://mh.example/api/workspaces/ws_1/sessions/ses_1?directory=%2Fworkspace%2F.worktrees%2Fapp%2Fabc",
    )
  })

  it("finishes an isolated session and unwraps directories", async () => {
    const { calls, fetchImpl } = recordingFetch((() => {
      let call = 0
      return () => {
        call++
        if (call === 1) {
          return jsonResponse({ committed: true, pushed: false, prUrl: null, branch: "b", path: "/p", error: null })
        }
        return jsonResponse({ directories: ["/workspace/app", "/workspace/.worktrees/app/abc"] })
      }
    })())
    const client = createClient({ baseUrl: "https://mh.example", fetchImpl })

    const result = await client.api.sessions.finish("ses_1")
    expect(result).toMatchObject({ committed: true, prUrl: null })
    expect(calls[0]?.url).toBe("https://mh.example/api/isolated-sessions/ses_1/finish")

    const directories = await client.api.sessions.directories("ws_1")
    expect(directories).toHaveLength(2)
    expect(calls[1]?.url).toBe("https://mh.example/api/workspaces/ws_1/directories")
  })
})

describe("workspaces", () => {
  it("unwraps the workspace list", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ workspaces: [{ id: "ws_1" }] }))
    const client = createClient({ fetchImpl })
    expect(await client.workspaces.list()).toEqual([{ id: "ws_1" }])
  })

  it("adds the deleteFiles flag when removing a workspace", async () => {
    const { calls, fetchImpl } = recordingFetch(() => new Response(null, { status: 204 }))
    const client = createClient({ baseUrl: "https://mh.example", fetchImpl })
    await client.workspaces.remove("ws_1", { deleteFiles: true })
    expect(calls[0]?.url).toBe("https://mh.example/api/workspaces/ws_1?deleteFiles=1")
  })
})

describe("previews", () => {
  it("reads, starts and stops a session preview", async () => {
    const preview = { status: "running", url: "https://x.trycloudflare.com", port: 3200, error: null }
    const { calls, fetchImpl } = recordingFetch(() =>
      jsonResponse({ preview }),
    )
    const client = createClient({ baseUrl: "https://mh.example", fetchImpl })

    expect(await client.api.preview("ses/1")).toEqual(preview)
    expect(await client.api.startPreview("ses/1")).toEqual(preview)
    await client.api.stopPreview("ses/1")

    const routes = calls.map((call) => `${call.init?.method ?? "GET"} ${call.url}`)
    expect(routes).toEqual([
      "GET https://mh.example/api/sessions/ses%2F1/preview",
      "POST https://mh.example/api/sessions/ses%2F1/preview",
      "DELETE https://mh.example/api/sessions/ses%2F1/preview",
    ])
  })
})

describe("client error handling", () => {
  it("falls back to the HTTP status when the error body is empty", async () => {
    const { fetchImpl } = recordingFetch(() => new Response("", { status: 500 }))
    const client = createClient({ fetchImpl })
    await expect(client.api.sessions.list("ws_1")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "HTTP 500",
    })
  })

  it("uses the response body as the error message", async () => {
    const { fetchImpl } = recordingFetch(() => new Response("nope", { status: 403 }))
    const client = createClient({ fetchImpl })
    await expect(client.api.sessions.list("ws_1")).rejects.toMatchObject({ status: 403, message: "nope" })
  })

  it("does not report 401 for other error codes", async () => {
    let unauthorized = 0
    const { fetchImpl } = recordingFetch(() => new Response("boom", { status: 500 }))
    const client = createClient({ onUnauthorized: () => unauthorized++, fetchImpl })
    await expect(client.api.sessions.list("ws_1")).rejects.toBeInstanceOf(ApiError)
    expect(unauthorized).toBe(0)
  })

  it("propagates network failures untouched", async () => {
    const failure = new TypeError("fetch failed")
    const fetchImpl = (async () => {
      throw failure
    }) as typeof fetch
    const client = createClient({ fetchImpl })
    await expect(client.api.sessions.list("ws_1")).rejects.toBe(failure)
  })

  it("omits the Authorization header when no token is available", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse({}))
    const client = createClient({ getToken: async () => null, fetchImpl })
    await client.auth.status()
    expect(new Headers(calls[0]?.init?.headers).has("authorization")).toBe(false)
  })

  it("falls back to the HTTP status when reading the error body throws", async () => {
    const response = {
      ok: false,
      status: 503,
      text: () => Promise.reject(new Error("stream failed")),
    } as unknown as Response
    const client = createClient({ fetchImpl: (async () => response) as typeof fetch })
    await expect(client.api.sessions.list("ws_1")).rejects.toMatchObject({ status: 503, message: "HTTP 503" })
  })

  it("exposes an event stream bound to the client", () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}))
    const client = createClient({ fetchImpl })
    const stream = client.eventStream({ onEvent: () => {} })
    expect(typeof stream.start).toBe("function")
    expect(typeof stream.stop).toBe("function")
    expect(stream.connected).toBe(false)
  })
})

describe("event stream resilience", () => {
  function sseResponse(chunks: string[]): Response {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    })
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
  }

  it("reconnects after the upstream closes and reports connection changes", async () => {
    const states: boolean[] = []
    const connects: number[] = []
    const fetchImpl = (async () => sseResponse([`data: ${JSON.stringify({ type: "server.connected" })}\n\n`])) as typeof fetch

    const stream = createEventStream({
      baseUrl: "https://mh.example",
      fetchImpl,
      reconnectBaseMs: 5,
      reconnectMaxMs: 10,
      onEvent: () => {},
      onConnectionChange: (connected) => states.push(connected),
      onConnect: () => connects.push(Date.now()),
    })
    stream.start()
    await new Promise((resolve) => setTimeout(resolve, 60))
    stream.stop()

    expect(states).toContain(true)
    expect(states).toContain(false)
    expect(connects.length).toBeGreaterThan(1)
  })

  it("attaches the bearer token and ignores non-JSON events", async () => {
    let authorization: string | undefined
    const events: unknown[] = []
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? undefined
      return sseResponse([": comment\n\ndata: not-json\n\ndata: {\"type\":\"session.idle\"}\n\n"])
    }) as typeof fetch

    const stream = createEventStream({
      baseUrl: "https://mh.example",
      fetchImpl,
      getToken: () => "tok_123",
      onEvent: (event) => events.push(event),
    })
    stream.start()
    await new Promise((resolve) => setTimeout(resolve, 30))
    stream.stop()

    expect(authorization).toBe("Bearer tok_123")
    expect(events).toEqual([{ type: "session.idle" }])
  })

  it("reports the connected state and reacts to forceReconnect", async () => {
    let calls = 0
    const states: boolean[] = []
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")))
        },
      })
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
    }) as typeof fetch

    const stream = createEventStream({
      baseUrl: "https://mh.example",
      fetchImpl,
      reconnectBaseMs: 5,
      reconnectMaxMs: 10,
      onEvent: () => {},
      onConnectionChange: (connected) => states.push(connected),
    })
    stream.start()
    await new Promise((resolve) => setTimeout(resolve, 10))
    stream.forceReconnect()
    await new Promise((resolve) => setTimeout(resolve, 30))
    stream.stop()

    expect(states).toContain(true)
    expect(states).toContain(false)
    expect(calls).toBeGreaterThan(1)
  })

  it("does not retry after stop", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response(null, { status: 502 })
    }) as typeof fetch

    const stream = createEventStream({ baseUrl: "https://mh.example", fetchImpl, reconnectBaseMs: 5, onEvent: () => {} })
    stream.start()
    await new Promise((resolve) => setTimeout(resolve, 20))
    stream.stop()
    const callsAfterStop = calls
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(calls).toBe(callsAfterStop)
  })

  it("aborts a stale connection through the watchdog", async () => {
    const states: boolean[] = []
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")))
        },
      })
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
    }) as typeof fetch

    const stream = createEventStream({
      baseUrl: "https://mh.example",
      fetchImpl,
      watchdogMs: 5,
      staleMs: 1,
      reconnectBaseMs: 1000,
      onEvent: () => {},
      onConnectionChange: (connected) => states.push(connected),
    })
    stream.start()
    await new Promise((resolve) => setTimeout(resolve, 40))
    stream.stop()

    expect(states).toContain(true)
    expect(states).toContain(false)
  })
})
