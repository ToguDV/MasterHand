import { describe, expect, it } from "vitest"
import { normalizeWorkspacePath, workspaceName } from "../src/workspaces.js"

describe("normalizeWorkspacePath", () => {
  it("accepts absolute paths and strips trailing slashes", () => {
    expect(normalizeWorkspacePath("/workspace/app/", null)).toEqual({ ok: true, path: "/workspace/app" })
    expect(normalizeWorkspacePath("  /workspace/app  ", null)).toEqual({ ok: true, path: "/workspace/app" })
  })

  it("rejects non-string, empty and relative paths", () => {
    expect(normalizeWorkspacePath(undefined, null)).toEqual({ ok: false, error: "invalid_path" })
    expect(normalizeWorkspacePath("", null)).toEqual({ ok: false, error: "invalid_path" })
    expect(normalizeWorkspacePath("relative/path", null)).toEqual({ ok: false, error: "invalid_path" })
  })

  it("enforces the configured root", () => {
    expect(normalizeWorkspacePath("/workspace/app", "/workspace")).toEqual({ ok: true, path: "/workspace/app" })
    expect(normalizeWorkspacePath("/workspace", "/workspace")).toEqual({ ok: true, path: "/workspace" })
    expect(normalizeWorkspacePath("/workspace/../etc", "/workspace")).toEqual({ ok: false, error: "outside_root" })
    expect(normalizeWorkspacePath("/other/app", "/workspace")).toEqual({ ok: false, error: "outside_root" })
  })

  it("normalizes trailing separators on the root", () => {
    expect(normalizeWorkspacePath("/workspace/app", "/workspace/")).toEqual({ ok: true, path: "/workspace/app" })
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
