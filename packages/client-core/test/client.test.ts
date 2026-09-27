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
  it("joins the base URL with the opencode proxy prefix", async () => {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse([{ id: "ses_1" }]))
    const client = createClient({ baseUrl: "https://mh.example/", fetchImpl })

    const sessions = await client.api.listSessions()
    expect(sessions).toEqual([{ id: "ses_1" }])
    expect(calls[0]?.url).toBe("https://mh.example/api/oc/session")
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

    await expect(client.api.listSessions()).rejects.toBeInstanceOf(ApiError)
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
