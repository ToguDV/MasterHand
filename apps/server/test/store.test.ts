import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createMemoryStore, createSqliteStore } from "../src/store.js"

describe("sqlite device store", () => {
  it("persists, touches and removes devices", () => {
    const dir = mkdtempSync(join(tmpdir(), "masterhand-store-"))
    const store = createSqliteStore(join(dir, "test.sqlite"))
    try {
      const device = { id: "dev_1", name: "Laptop", createdAt: 1, lastUsedAt: 1 }
      store.create(device)
      expect(store.get("dev_1")).toMatchObject({ name: "Laptop" })
      expect(store.list()).toHaveLength(1)

      store.touch("dev_1", 99)
      expect(store.get("dev_1")?.lastUsedAt).toBe(99)

      store.remove("dev_1")
      expect(store.get("dev_1")).toBeNull()
      expect(store.list()).toHaveLength(0)
    } finally {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("memory device store", () => {
  it("behaves like the sqlite store", () => {
    const store = createMemoryStore()
    store.create({ id: "dev_1", name: "Phone", createdAt: 1, lastUsedAt: 1 })
    store.touch("dev_1", 5)
    expect(store.get("dev_1")?.lastUsedAt).toBe(5)
    store.remove("dev_1")
    expect(store.list()).toHaveLength(0)
    store.close()
  })
})
