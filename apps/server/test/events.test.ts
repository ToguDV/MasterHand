import { describe, expect, it } from "vitest"
import { normalizeEvent } from "../src/events.js"

describe("normalizeEvent", () => {
  it("unwraps the payload of the global stream", () => {
    const inner = { id: "evt_1", type: "session.idle", properties: { sessionID: "ses_1" } }
    expect(normalizeEvent({ directory: "/x", project: "global", payload: inner })).toEqual(inner)
  })

  it("drops sync events (they duplicate other events)", () => {
    expect(normalizeEvent({ directory: "/x", payload: { type: "sync", syncEvent: {} } })).toBeNull()
  })

  it("lets plain events without a payload through", () => {
    const event = { type: "server.connected", properties: {} }
    expect(normalizeEvent(event)).toBe(event)
  })

  it("tolerates non-object values", () => {
    expect(normalizeEvent("text")).toBe("text")
    expect(normalizeEvent(null)).toBeNull()
  })
})
