import { describe, expect, it } from "vitest"
import { normalizeEvent } from "../src/events.js"

describe("normalizeEvent", () => {
  it("lets v2 event objects through untouched", () => {
    const event = {
      id: "evt_1",
      type: "session.idle",
      data: { sessionID: "ses_1" },
      location: "/workspace/app",
      durable: true,
    }
    expect(normalizeEvent(event)).toBe(event)
  })

  it("drops objects without a string type", () => {
    expect(normalizeEvent({ id: "evt_1", data: {} })).toBeNull()
    expect(normalizeEvent({ id: "evt_1", type: 42, data: {} })).toBeNull()
    expect(normalizeEvent({ id: "evt_1", type: null })).toBeNull()
  })

  it("drops non-object values", () => {
    expect(normalizeEvent("text")).toBeNull()
    expect(normalizeEvent(42)).toBeNull()
    expect(normalizeEvent(null)).toBeNull()
    expect(normalizeEvent(undefined)).toBeNull()
  })
})
