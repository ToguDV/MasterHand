import type { Context } from "hono"
import type { Config } from "./config.js"

const FORWARD_REQUEST_HEADERS = [
  "content-type",
  "accept",
  "accept-language",
  "user-agent",
  "x-opencode-directory",
]
const FORWARD_RESPONSE_HEADERS = ["content-type", "cache-control", "etag", "last-modified"]

export function createOpencodeProxy(config: Config, fetchImpl: typeof fetch = fetch) {
  return async (c: Context): Promise<Response> => {
    const requestUrl = new URL(c.req.url)
    const path = c.req.path.replace(/^\/api\/oc/, "") || "/"

    let target: URL
    try {
      target = new URL(path + requestUrl.search, config.opencodeUrl)
    } catch {
      return c.json({ error: "bad_upstream_url" }, 502)
    }

    const headers = new Headers()
    if (config.opencodeAuth) headers.set("authorization", config.opencodeAuth)
    for (const name of FORWARD_REQUEST_HEADERS) {
      const value = c.req.header(name)
      if (value) headers.set(name, value)
    }

    const method = c.req.method
    let body: ArrayBuffer | undefined
    if (method !== "GET" && method !== "HEAD") {
      body = await c.req.arrayBuffer()
    }

    let upstream: Response
    try {
      upstream = await fetchImpl(target, {
        method,
        headers,
        body: body && body.byteLength > 0 ? body : undefined,
      })
    } catch {
      return c.json({ error: "opencode_unreachable" }, 502)
    }

    const responseHeaders = new Headers()
    for (const name of FORWARD_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }
    if (upstream.headers.get("content-type")?.includes("text/event-stream")) {
      responseHeaders.set("cache-control", "no-cache")
      responseHeaders.set("x-accel-buffering", "no")
    }

    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
  }
}
