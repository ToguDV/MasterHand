import { ApiError } from "./client"

/**
 * Turns an opencode `session.error` payload into a concise message for the UI.
 * Returns `null` for user-initiated aborts (expected, not worth a banner).
 */
export function opencodeErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return "The agent reported an error"
  const name = (error as { name?: unknown }).name
  if (name === "MessageAbortedError") return null

  const data = (error as { data?: unknown }).data
  const raw = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined
  const message = typeof raw === "string" ? raw.split("\n")[0]?.trim() : ""
  if (message) return message

  const providerID = data && typeof data === "object" ? (data as { providerID?: unknown }).providerID : undefined
  if (name === "ProviderAuthError" && typeof providerID === "string") {
    return `Provider "${providerID}" is not authenticated`
  }
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
