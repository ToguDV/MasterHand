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
