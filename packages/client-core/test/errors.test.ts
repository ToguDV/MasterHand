import { describe, expect, it } from "vitest"
import { opencodeErrorMessage } from "../src/errors"

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
