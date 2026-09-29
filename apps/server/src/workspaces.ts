import { basename, resolve, sep } from "node:path"

export type WorkspacePathResult =
  | { ok: true; path: string }
  | { ok: false; error: "invalid_path" | "outside_root" }

/**
 * Normalizes a workspace path and, when a root is configured, ensures it lives
 * under that root. This is a string check only: the BFF and opencode may run in
 * different containers, so the directory is validated by opencode on first use.
 */
export function normalizeWorkspacePath(input: unknown, root: string | null): WorkspacePathResult {
  if (typeof input !== "string") return { ok: false, error: "invalid_path" }
  const trimmed = input.trim()
  if (!trimmed || !trimmed.startsWith("/")) return { ok: false, error: "invalid_path" }

  const normalized = resolve(trimmed)
  if (root) {
    const normalizedRoot = resolve(root)
    if (normalized !== normalizedRoot && !normalized.startsWith(normalizedRoot + sep)) {
      return { ok: false, error: "outside_root" }
    }
  }
  return { ok: true, path: normalized }
}

export function workspaceName(path: string): string {
  return basename(path) || path
}
