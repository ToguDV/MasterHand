import { describe, expect, it } from "vitest"
import { ApiError } from "../src/client"
import { opencodeErrorMessage, previewErrorMessage } from "../src/errors"

describe("opencodeErrorMessage", () => {
  it("returns the first line of the error message", () => {
    expect(
      opencodeErrorMessage({ name: "UnknownError", data: { message: "PlatformError: NotFound\n    at foo" } }),
    ).toBe("PlatformError: NotFound")
  })

  it("returns null for aborted turns", () => {
    expect(opencodeErrorMessage({ name: "MessageAbortedError", data: { message: "aborted" } })).toBeNull()
  })

  it("names the provider on auth errors without a message", () => {
    expect(opencodeErrorMessage({ name: "ProviderAuthError", data: { providerID: "opencode-go" } })).toBe(
      'Provider "opencode-go" is not authenticated',
    )
  })

  it("falls back for unknown payloads", () => {
    expect(opencodeErrorMessage(undefined)).toBe("The agent reported an error")
    expect(opencodeErrorMessage("nope")).toBe("The agent reported an error")
    expect(opencodeErrorMessage({ name: "UnknownError", data: {} })).toBe("The agent reported an error")
  })
})

describe("previewErrorMessage", () => {
  function apiError(status: number, body: unknown): ApiError {
    return new ApiError(status, JSON.stringify(body))
  }

  it("explains every known preview failure", () => {
    expect(previewErrorMessage(apiError(409, { error: "preview_not_running" }))).toContain("has not started")
    expect(previewErrorMessage(apiError(503, { error: "preview_unavailable" }))).toContain("cloudflared")
    expect(previewErrorMessage(apiError(503, { error: "preview_ports_exhausted" }))).toContain("preview ports")
    expect(previewErrorMessage(apiError(502, { error: "preview_tunnel_unreachable" }))).toContain("never became")
    expect(previewErrorMessage(apiError(502, { error: "preview_tunnel_timeout" }))).toContain("could not establish")
    expect(previewErrorMessage(apiError(502, { error: "preview_tunnel_exited" }))).toContain("could not establish")
  })

  it("falls back for unknown or non-API errors", () => {
    expect(previewErrorMessage(apiError(500, { error: "weird" }))).toBe("Could not start the preview")
    expect(previewErrorMessage(apiError(500, { error: "weird" }))).not.toContain("{")
    expect(previewErrorMessage(new Error("boom"))).toBe("Could not start the preview")
    expect(previewErrorMessage("nope")).toBe("Could not start the preview")
  })
})
