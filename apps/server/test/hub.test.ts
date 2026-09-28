import { afterEach, describe, expect, it, vi } from "vitest"
import { createEventHub, type EventHub } from "../src/events.js"

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

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error("waitFor timed out"))
      }
    }, 5)
  })
}

let hub: EventHub | null = null
afterEach(() => {
  hub?.stop()
  hub = null
})

describe("createEventHub", () => {
  it("forwards normalized events to subscribers and the global hook", async () => {
    const onEvent = vi.fn()
    hub = createEventHub({
      url: "http://upstream/event",
      reconnectBaseMs: 5,
      reconnectMaxMs: 10,
      onEvent,
      fetchImpl: async () =>
        sseResponse([
          `data: ${JSON.stringify({ payload: { type: "session.idle", properties: { sessionID: "ses_1" } } })}\n\n`,
          `data: ${JSON.stringify({ payload: { type: "sync", syncEvent: {} } })}\n\n`,
        ]),
    })
    const received: unknown[] = []
    const unsubscribe = hub.subscribe((event) => received.push(event))

    hub.start()
    await waitFor(() => onEvent.mock.calls.length > 0)

    expect(received).toEqual([{ type: "session.idle", properties: { sessionID: "ses_1" } }])
    expect(onEvent).toHaveBeenCalledWith({ type: "session.idle", properties: { sessionID: "ses_1" } })

    unsubscribe()
    expect(hub.connected).toBe(false)
  })

  it("keeps notifying healthy listeners when one throws", async () => {
    hub = createEventHub({
      url: "http://upstream/event",
      reconnectBaseMs: 5,
      reconnectMaxMs: 10,
      fetchImpl: async () => sseResponse([`data: ${JSON.stringify({ type: "server.connected" })}\n\n`]),
    })
    const healthy = vi.fn()
    hub.subscribe(() => {
      throw new Error("boom")
    })
    hub.subscribe(healthy)

    hub.start()
    await waitFor(() => healthy.mock.calls.length > 0)
    expect(healthy).toHaveBeenCalledWith({ type: "server.connected" })
  })

  it("forwards the upstream auth header", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }))
    hub = createEventHub({
      url: "http://upstream/event",
      authHeader: "Basic abc",
      reconnectBaseMs: 5,
      reconnectMaxMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    hub.start()
    await waitFor(() => fetchImpl.mock.calls.length > 0)
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://upstream/event",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Basic abc" }) }),
    )
  })

  it("retries with backoff after a failed upstream response", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 502 }))
    hub = createEventHub({
      url: "http://upstream/event",
      reconnectBaseMs: 5,
      reconnectMaxMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    hub.start()
    await waitFor(() => fetchImpl.mock.calls.length > 1)
    hub.stop()
    const callsAfterStop = fetchImpl.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(fetchImpl.mock.calls.length).toBe(callsAfterStop)
  })

  it("does not start again after being stopped", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }))
    hub = createEventHub({
      url: "http://upstream/event",
      reconnectBaseMs: 5,
      reconnectMaxMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    hub.stop()
    hub.start()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
