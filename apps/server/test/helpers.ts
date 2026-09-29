import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { serve } from "@hono/node-server"
import { createApp } from "../src/app.js"
import type { Config } from "../src/config.js"
import { createEventHub, type EventHub } from "../src/events.js"
import { createMemoryStore, type DeviceRecord, type Store } from "../src/store.js"

export async function waitFor(predicate: () => boolean, timeoutMs = 8000, intervalMs = 25): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error("waitFor: timed out waiting for the condition")
}

export interface MockOpencode {
  url: string
  requests: { method: string; path: string; authorization?: string; directory?: string; body?: string }[]
  emit(event: unknown): void
  close(): Promise<void>
}

export async function startMockOpencode(): Promise<MockOpencode> {
  const requests: MockOpencode["requests"] = []
  const sseClients = new Set<import("node:http").ServerResponse>()

  const server = createServer((req, res) => {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => {
      const path = req.url ?? ""
      requests.push({
        method: req.method ?? "",
        path,
        authorization: req.headers.authorization,
        directory: typeof req.headers["x-opencode-directory"] === "string" ? req.headers["x-opencode-directory"] : undefined,
        body: body || undefined,
      })

      if (req.method === "GET" && path === "/global/health") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ healthy: true, version: "1.2.3" }))
        return
      }

      if (req.method === "POST" && path.startsWith("/session/") && path.endsWith("/prompt_async")) {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method === "GET" && path === "/global/event") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
        res.write(
          `data: ${JSON.stringify({ directory: "/test", payload: { type: "server.connected", properties: {} } })}\n\n`,
        )
        sseClients.add(res)
        res.on("close", () => sseClients.delete(res))
        return
      }

      res.writeHead(404, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "not_found" }))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    emit(event) {
      for (const client of sseClients) {
        client.write(`data: ${JSON.stringify({ directory: "/test", payload: event })}\n\n`)
      }
    },
    close: () =>
      new Promise((resolve) => {
        for (const client of sseClients) client.end()
        server.close(() => resolve())
      }),
  }
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    opencodeUrl: "http://127.0.0.1:1",
    opencodeAuth: null,
    masterhandPassword: "secret",
    sessionSecret: "test-secret",
    sessionTtlHours: 720,
    cookieSecure: false,
    dataDir: "/tmp/masterhand-test",
    webDist: null,
    allowedOrigins: [],
    workspacesRoot: null,
    ...overrides,
  }
}

export interface TestApp {
  url: string
  config: Config
  store: Store
  hub: EventHub
  close(): Promise<void>
}

export async function startTestApp(options: { config?: Partial<Config> } = {}): Promise<TestApp> {
  const config = testConfig(options.config)
  const store = createMemoryStore()
  const hub = createEventHub({
    url: new URL("/global/event", config.opencodeUrl).toString(),
    authHeader: config.opencodeAuth,
    reconnectBaseMs: 50,
    reconnectMaxMs: 200,
  })
  const app = createApp({ config, store, hub })
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" })
  await new Promise<void>((resolve) => server.once("listening", resolve))
  const address = server.address() as AddressInfo

  hub.start()

  return {
    url: `http://127.0.0.1:${address.port}`,
    config,
    store,
    hub,
    close: async () => {
      hub.stop()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

export async function login(baseUrl: string, password = "secret"): Promise<string> {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  })
  const setCookie = response.headers.getSetCookie()[0] ?? ""
  return setCookie.split(";")[0] ?? ""
}

export interface IssuedDevice {
  token: string
  device: DeviceRecord
}

export async function createDevice(baseUrl: string, name = "Test device", password = "secret"): Promise<IssuedDevice> {
  const response = await fetch(`${baseUrl}/api/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, password }),
  })
  if (!response.ok) throw new Error(`device creation failed: HTTP ${response.status}`)
  return (await response.json()) as IssuedDevice
}

export async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string,
  timeoutMs = 8000,
): Promise<string> {
  const decoder = new TextDecoder()
  let accumulated = ""
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now()
    const result = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), remaining),
      ),
    ])
    if (result.done) break
    accumulated += decoder.decode(result.value, { stream: true })
    if (accumulated.includes(needle)) break
  }

  await reader.cancel().catch(() => {})
  return accumulated
}
