import { describe, expect, it } from "vitest"
import { createMemoryStore } from "../src/store.js"
import { createPreviewManager, PreviewError, previewSystemPrompt } from "../src/preview.js"
import { createFakeTunnel, testConfig } from "./helpers.js"

function setup(overrides: Parameters<typeof testConfig>[0] = {}, tunnel = createFakeTunnel()) {
  const config = testConfig(overrides)
  const store = createMemoryStore()
  const manager = createPreviewManager({
    config,
    store,
    spawnImpl: tunnel.spawnImpl,
    probe: async () => true,
    availableImpl: () => true,
  })
  return { config, store, manager, tunnel }
}

describe("preview port reservation", () => {
  it("assigns the lowest free port and persists it", () => {
    const { store, manager } = setup({ previewPortRange: { min: 33000, max: 33002 } })

    expect(manager.portFor("ses_a")).toBe(33000)
    expect(manager.portFor("ses_b")).toBe(33001)
    expect(manager.portFor("ses_a")).toBe(33000)
    expect(store.getPreviewPort("ses_a")).toBe(33000)
  })

  it("recycles the oldest stale mapping when the pool is drained", () => {
    const { store, manager } = setup({ previewPortRange: { min: 33000, max: 33001 } })

    manager.portFor("ses_a")
    manager.portFor("ses_b")
    expect(manager.portFor("ses_c")).toBe(33000)
    expect(store.getPreviewPort("ses_a")).toBeNull()
    expect(store.getPreviewPort("ses_c")).toBe(33000)
  })
})

describe("preview tunnel lifecycle", () => {
  it("starts cloudflared, reports the public URL and is idempotent", async () => {
    const { manager, tunnel } = setup()

    const started = await manager.start("ses_1")
    expect(started).toMatchObject({
      status: "running",
      url: "https://fake-preview.trycloudflare.com",
      port: 32900,
    })
    expect(tunnel.children).toHaveLength(1)

    const again = await manager.start("ses_1")
    expect(again.url).toBe(started.url)
    expect(tunnel.children).toHaveLength(1)
    expect(manager.status("ses_1")).toMatchObject({ status: "running", error: null })
  })

  it("refuses to start when the dev server is not listening", async () => {
    const config = testConfig()
    const store = createMemoryStore()
    const manager = createPreviewManager({
      config,
      store,
      probe: async () => false,
      spawnImpl: createFakeTunnel().spawnImpl,
      availableImpl: () => true,
    })

    await expect(manager.start("ses_1")).rejects.toMatchObject({ code: "preview_not_running" })
    expect(manager.status("ses_1").status).toBe("stopped")
  })

  it("fails when the tunnel exits before announcing a URL", async () => {
    const tunnel = createFakeTunnel("https://unused.trycloudflare.com", { fail: true })
    const { manager } = setup({}, tunnel)

    await expect(manager.start("ses_1")).rejects.toMatchObject({ code: "preview_tunnel_exited" })
  })

  it("times out when the tunnel never announces a URL", async () => {
    const config = testConfig()
    const store = createMemoryStore()
    const tunnel = createFakeTunnel("https://unused.trycloudflare.com", { silent: true })
    const manager = createPreviewManager({
      config,
      store,
      spawnImpl: tunnel.spawnImpl,
      probe: async () => true,
      availableImpl: () => true,
      urlTimeoutMs: 20,
    })

    await expect(manager.start("ses_1")).rejects.toMatchObject({ code: "preview_tunnel_timeout" })
    expect(tunnel.children[0]!.signalCode).toBe("SIGTERM")
  })

  it("reports an error when a running tunnel dies", async () => {
    const { manager, tunnel } = setup()
    await manager.start("ses_1")

    tunnel.children[0]!.kill("SIGKILL")
    expect(manager.status("ses_1")).toMatchObject({ status: "error", error: "preview_tunnel_exited" })
  })

  it("stops and forgets a preview", async () => {
    const { manager, tunnel, store } = setup()
    await manager.start("ses_1")

    manager.stop("ses_1")
    expect(tunnel.children[0]!.signalCode).toBe("SIGTERM")
    expect(manager.status("ses_1").status).toBe("stopped")
    // stop keeps the reserved port: the tunnel can be restarted.
    expect(store.getPreviewPort("ses_1")).toBe(32900)

    manager.forget("ses_1")
    expect(store.getPreviewPort("ses_1")).toBeNull()
  })

  it("stopAll kills every tunnel", async () => {
    const { manager, tunnel } = setup()
    await manager.start("ses_1")
    await manager.start("ses_2")

    manager.stopAll()
    expect(tunnel.children).toHaveLength(2)
    for (const child of tunnel.children) expect(child.signalCode).toBe("SIGTERM")
    expect(manager.status("ses_1").status).toBe("stopped")
    expect(manager.status("ses_2").status).toBe("stopped")
  })
})

describe("preview availability", () => {
  it("uses the injected availability check and caches it", () => {
    const config = testConfig()
    let calls = 0
    const manager = createPreviewManager({
      config,
      store: createMemoryStore(),
      availableImpl: () => {
        calls += 1
        return false
      },
    })

    expect(manager.available()).toBe(false)
    expect(manager.available()).toBe(false)
    expect(calls).toBe(1)
  })

  it("reports unavailable when the binary does not exist", () => {
    const manager = createPreviewManager({
      config: testConfig({ cloudflaredBin: "/nonexistent/cloudflared-xyz" }),
      store: createMemoryStore(),
    })
    expect(manager.available()).toBe(false)
  })
})

describe("previewSystemPrompt", () => {
  it("pins the port and the 0.0.0.0 bind", () => {
    const prompt = previewSystemPrompt(3200)
    expect(prompt).toContain("3200")
    expect(prompt).toContain("0.0.0.0")
  })
})

describe("PreviewError", () => {
  it("carries a code and detail", () => {
    const error = new PreviewError("preview_failed", "boom")
    expect(error.code).toBe("preview_failed")
    expect(error.message).toBe("preview_failed: boom")
  })
})
