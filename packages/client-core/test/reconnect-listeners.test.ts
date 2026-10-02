/**
 * Regression tests for the React Native runtime, the closest approximation to
 * which is the plain `node` environment: no `document`, and a global `window`
 * that is not a DOM `Window`.
 *
 * The mobile app crashed right after login with "undefined is not a function"
 * because `useEventStream` assumed `window.addEventListener` existed.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { attachReconnectListeners } from "../src/hooks"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("attachReconnectListeners", () => {
  it("works with no web globals at all (React Native)", () => {
    expect(typeof window).toBe("undefined")
    expect(typeof document).toBe("undefined")

    const stream = { forceReconnect: vi.fn() }
    const detach = attachReconnectListeners(stream)

    expect(stream.forceReconnect).not.toHaveBeenCalled()
    expect(() => detach()).not.toThrow()
  })

  it("ignores a global `window` without listener methods (React Native)", () => {
    // React Native exposes a global `window` object, but not the DOM API.
    vi.stubGlobal("window", {})

    const stream = { forceReconnect: vi.fn() }
    const detach = attachReconnectListeners(stream)

    expect(stream.forceReconnect).not.toHaveBeenCalled()
    expect(() => detach()).not.toThrow()
    expect(stream.forceReconnect).not.toHaveBeenCalled()
  })

  it("ignores a global `window` that only exposes addEventListener", () => {
    vi.stubGlobal("window", { addEventListener: vi.fn() })

    const stream = { forceReconnect: vi.fn() }
    const detach = attachReconnectListeners(stream)

    expect(stream.forceReconnect).not.toHaveBeenCalled()
    expect(() => detach()).not.toThrow()
  })

  it("ignores a `document` that cannot register listeners", () => {
    vi.stubGlobal("document", { addEventListener: true, removeEventListener: true })

    const stream = { forceReconnect: vi.fn() }
    const detach = attachReconnectListeners(stream)

    expect(stream.forceReconnect).not.toHaveBeenCalled()
    expect(() => detach()).not.toThrow()
  })

  it("wires and detaches the web listeners when the DOM exists", () => {
    const listeners = new Map<string, () => void>()
    const target = {
      addEventListener: vi.fn((type: string, listener: () => void) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
      visibilityState: "visible",
    }
    vi.stubGlobal("document", target)
    vi.stubGlobal("window", target)

    const stream = { forceReconnect: vi.fn() }
    const detach = attachReconnectListeners(stream)

    expect([...listeners.keys()].sort()).toEqual(["online", "visibilitychange"])

    listeners.get("online")?.()
    expect(stream.forceReconnect).toHaveBeenCalledTimes(1)

    target.visibilityState = "hidden"
    listeners.get("visibilitychange")?.()
    expect(stream.forceReconnect).toHaveBeenCalledTimes(1)

    target.visibilityState = "visible"
    listeners.get("visibilitychange")?.()
    expect(stream.forceReconnect).toHaveBeenCalledTimes(2)

    detach()
    expect(listeners.size).toBe(0)
  })
})
