import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  createWorkspaceDir,
  isInsideRoot,
  normalizeWorkspaceSlug,
  removeWorkspaceDir,
  workspaceName,
  workspacePath,
} from "../src/workspaces.js"

describe("normalizeWorkspaceSlug", () => {
  it("accepts plain folder names and trims them", () => {
    expect(normalizeWorkspaceSlug("my-app")).toEqual({ ok: true, slug: "my-app" })
    expect(normalizeWorkspaceSlug("  my app  ")).toEqual({ ok: true, slug: "my app" })
  })

  it("rejects non-string, empty and too-long names", () => {
    expect(normalizeWorkspaceSlug(undefined)).toEqual({ ok: false, error: "invalid_name" })
    expect(normalizeWorkspaceSlug("")).toEqual({ ok: false, error: "invalid_name" })
    expect(normalizeWorkspaceSlug("a".repeat(65))).toEqual({ ok: false, error: "invalid_name" })
  })

  it("rejects traversal, separators and hidden names", () => {
    for (const name of [".", "..", ".git", "a/b", "a\\b", "a\u0000b"]) {
      expect(normalizeWorkspaceSlug(name)).toEqual({ ok: false, error: "invalid_name" })
    }
  })
})

describe("workspacePath", () => {
  it("resolves the slug under the root", () => {
    expect(workspacePath("/workspace", "app")).toBe("/workspace/app")
  })

  it("throws if the slug would escape the root", () => {
    expect(() => workspacePath("/workspace", "../etc")).toThrow(/escapes_root/)
  })
})

describe("isInsideRoot", () => {
  it("is true only for paths strictly inside the root", () => {
    expect(isInsideRoot("/workspace", "/workspace/app")).toBe(true)
    expect(isInsideRoot("/workspace", "/workspace")).toBe(false)
    expect(isInsideRoot("/workspace", "/workspace/../etc")).toBe(false)
    expect(isInsideRoot("/workspace", "/other/app")).toBe(false)
  })
})

describe("workspaceName", () => {
  it("uses the last path segment", () => {
    expect(workspaceName("/workspace/my-app")).toBe("my-app")
  })

  it("falls back to the path for the filesystem root", () => {
    expect(workspaceName("/")).toBe("/")
  })
})

describe("createWorkspaceDir / removeWorkspaceDir", () => {
  it("creates nested folders and deletes them recursively", () => {
    const root = mkdtempSync(join(tmpdir(), "masterhand-ws-"))
    try {
      const path = join(root, "nested", "project")
      createWorkspaceDir(path)
      expect(existsSync(path)).toBe(true)

      writeFileSync(join(path, "file.txt"), "x")
      removeWorkspaceDir(path)
      expect(existsSync(path)).toBe(false)
      expect(existsSync(join(root, "nested"))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("removing a missing folder is a no-op", () => {
    const root = mkdtempSync(join(tmpdir(), "masterhand-ws-"))
    try {
      expect(() => removeWorkspaceDir(join(root, "missing"))).not.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
