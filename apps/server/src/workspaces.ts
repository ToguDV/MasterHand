import { basename, resolve, sep } from "node:path"
import { mkdirSync, rmSync } from "node:fs"

const MAX_SLUG_LENGTH = 64

export type WorkspaceSlugResult =
  | { ok: true; slug: string }
  | { ok: false; error: "invalid_name" }

/**
 * Turns a user-provided workspace name into a safe single path segment. Anything
 * that could escape the workspace root (separators, traversal, hidden names) or
 * break the filesystem is rejected.
 */
export function normalizeWorkspaceSlug(input: unknown): WorkspaceSlugResult {
  if (typeof input !== "string") return { ok: false, error: "invalid_name" }
  const slug = input.trim()
  if (!slug || slug.length > MAX_SLUG_LENGTH) return { ok: false, error: "invalid_name" }
  if (slug === "." || slug === "..") return { ok: false, error: "invalid_name" }
  if (slug.startsWith(".")) return { ok: false, error: "invalid_name" }
  if (slug.includes("/") || slug.includes("\\")) return { ok: false, error: "invalid_name" }
  if (/[\u0000-\u001f]/.test(slug)) return { ok: false, error: "invalid_name" }
  return { ok: true, slug }
}

/** Absolute path of a workspace, guaranteed to live directly under `root`. */
export function workspacePath(root: string, slug: string): string {
  const normalizedRoot = resolve(root)
  const path = resolve(normalizedRoot, slug)
  if (!path.startsWith(normalizedRoot + sep)) {
    throw new Error("workspace_slug_escapes_root")
  }
  return path
}

/** True when `path` is strictly inside `root` (used to guard folder deletion). */
export function isInsideRoot(root: string, path: string): boolean {
  const normalizedRoot = resolve(root)
  const target = resolve(path)
  return target !== normalizedRoot && target.startsWith(normalizedRoot + sep)
}

export function workspaceName(path: string): string {
  return basename(path) || path
}

/** Creates the workspace folder (and the root itself) if missing. */
export function createWorkspaceDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

/** Deletes a workspace folder and everything inside it. */
export function removeWorkspaceDir(path: string): void {
  rmSync(path, { recursive: true, force: true })
}
