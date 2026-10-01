import type { Context } from "hono"
import type { Config } from "./config.js"
import { previewSystemPrompt, type PreviewManager } from "./preview.js"

const FORWARD_REQUEST_HEADERS = [
  "content-type",
  "accept",
  "accept-language",
  "user-agent",
  "x-opencode-directory",
]
const FORWARD_RESPONSE_HEADERS = ["content-type", "cache-control", "etag", "last-modified"]

/** opencode endpoints that accept a per-prompt `system` instruction. */
const PROMPT_PATH = /^\/(?:api\/)?session\/([^/]+)\/(?:prompt_async|message)$/

export interface OpencodeProxyOptions {
  /** When present, the reserved preview port is appended to each prompt. */
  preview?: PreviewManager
}

/** Appends the preview instruction to a prompt JSON body; leaves anything else untouched. */
function injectPreviewSystem(text: string, sessionID: string, preview: PreviewManager): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return text
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return text

  let port: number
  try {
    port = preview.portFor(decodeURIComponent(sessionID))
  } catch {
    // Port pool exhausted: never block prompting over a preview concern.
    return text
  }

  const body = parsed as Record<string, unknown>
  const existing = typeof body.system === "string" ? body.system.trim() : ""
  body.system = existing ? `${existing}\n${previewSystemPrompt(port)}` : previewSystemPrompt(port)
  return JSON.stringify(body)
}

export function createOpencodeProxy(
  config: Config,
  fetchImpl: typeof fetch = fetch,
  options: OpencodeProxyOptions = {},
) {
  const preview = options.preview
  return async (c: Context): Promise<Response> => {
    const requestUrl = new URL(c.req.url)
    const path = c.req.path.replace(/^\/api\/oc/, "") || "/"

    let target: URL
    try {
      // Keep the upstream origin fixed: a path such as "//host/x" must never be
      // interpreted as a protocol-relative URL (SSRF / credential leak).
      target = new URL(config.opencodeUrl)
      target.pathname = path.startsWith("/") ? path : `/${path}`
      target.search = requestUrl.search
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
    let body: ArrayBuffer | string | undefined
    if (method !== "GET" && method !== "HEAD") {
      const raw = await c.req.arrayBuffer()
      const match = preview && config.previewEnabled && method === "POST" ? PROMPT_PATH.exec(path) : null
      if (match && c.req.header("content-type")?.includes("application/json") && raw.byteLength > 0) {
        body = injectPreviewSystem(new TextDecoder().decode(raw), match[1]!, preview!)
      } else if (raw.byteLength > 0) {
        body = raw
      }
    }

    let upstream: Response
    try {
      upstream = await fetchImpl(target, { method, headers, body })
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
