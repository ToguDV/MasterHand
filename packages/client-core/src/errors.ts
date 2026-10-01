import { ApiError } from "./client"
import type { SessionStructuredError } from "./types"

/**
 * Turns an opencode structured error (`session.execution.failed`, assistant
 * message error) into a concise message for the UI. Returns `null` for
 * user-initiated aborts (expected, not worth a banner).
 */
export function opencodeErrorMessage(error: SessionStructuredError | null | undefined): string | null {
  if (!error || typeof error !== "object") return "The agent reported an error"
  if (error.type === "MessageAbortedError") return null

  const message = typeof error.message === "string" ? error.message.split("\n")[0]?.trim() : ""
  if (message) return message
  return "The agent reported an error"
}

function apiErrorCode(error: ApiError): string | null {
  try {
    const body = JSON.parse(error.message) as { error?: unknown }
    return typeof body.error === "string" ? body.error : null
  } catch {
    return null
  }
}

/** Human-readable message for a failed preview Start. */
export function previewErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = apiErrorCode(error)
    if (code === "preview_not_running") {
      return "The agent has not started a web server yet. Ask it to run the project, then try again."
    }
    if (code === "preview_unavailable") return "cloudflared is not available on the server."
    if (code === "preview_ports_exhausted") {
      return "No preview ports are free. Stop another preview or widen PREVIEW_PORT_RANGE."
    }
    if (code === "preview_tunnel_unreachable") {
      return "The tunnel started but its public URL never became reachable. Try again."
    }
    if (code === "preview_tunnel_timeout" || code === "preview_tunnel_exited") {
      return "cloudflared could not establish the tunnel. Check the server logs."
    }
    return "Could not start the preview"
  }
  return "Could not start the preview"
}
