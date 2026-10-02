import { parseSseStream } from "./sse.js"

export interface EventHub {
  start(): void
  stop(): void
  subscribe(listener: (event: unknown) => void): () => void
  readonly connected: boolean
}

export interface EventHubOptions {
  url: string
  authHeader?: string | null
  fetchImpl?: typeof fetch
  reconnectBaseMs?: number
  reconnectMaxMs?: number
  onEvent?: (event: unknown) => void
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener("abort", done, { once: true })
  })
}

/**
 * opencode v2 emits one JSON event object per SSE frame
 * (`{ id, type, location?, data, durable? }`); MasterHand forwards it as-is.
 */
export function normalizeEvent(raw: unknown): unknown | null {
  if (!raw || typeof raw !== "object") return null
  const type = (raw as { type?: unknown }).type
  return typeof type === "string" ? raw : null
}

export function createEventHub(options: EventHubOptions): EventHub {
  const fetchImpl = options.fetchImpl ?? fetch
  const listeners = new Set<(event: unknown) => void>()
  const baseBackoff = options.reconnectBaseMs ?? 1000
  const maxBackoff = options.reconnectMaxMs ?? 30000

  let connected = false
  let stopped = false
  let started = false
  let abortController: AbortController | null = null

  function notify(event: unknown): void {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // a faulty listener must not take down the stream
      }
    }
    try {
      options.onEvent?.(event)
    } catch {
      // same for the global hook
    }
  }

  async function run(): Promise<void> {
    let backoff = baseBackoff

    while (!stopped) {
      abortController = new AbortController()
      const headers: Record<string, string> = { accept: "text/event-stream" }
      if (options.authHeader) headers.authorization = options.authHeader

      try {
        const response = await fetchImpl(options.url, { headers, signal: abortController.signal })
        if (!response.ok || !response.body) {
          throw new Error(`SSE upstream responded ${response.status}`)
        }

        connected = true
        backoff = baseBackoff

        for await (const message of parseSseStream(response.body)) {
          if (stopped) break
          if (!message.data) continue
          try {
            const event = normalizeEvent(JSON.parse(message.data))
            if (event !== null) notify(event)
          } catch {
            // non-JSON events are ignored
          }
        }
      } catch {
        // disconnection or error: retry with backoff
      } finally {
        connected = false
      }

      if (stopped) break
      await sleep(backoff, abortController.signal)
      backoff = Math.min(backoff * 2, maxBackoff)
    }
  }

  return {
    start() {
      // Idempotent: a second call must not open a second connection loop.
      if (stopped || started) return
      started = true
      void run()
    },
    stop() {
      stopped = true
      abortController?.abort()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get connected() {
      return connected
    },
  }
}
