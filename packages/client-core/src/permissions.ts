import type { Permission } from "./types"

/**
 * Reconciles locally tracked pending permissions with the server snapshot for
 * the directories the client just queried.
 *
 * Sessions in `coveredSessionIDs` belong to those directories and are
 * authoritative from the snapshot: a covered permission missing from it was
 * answered elsewhere (or no longer exists) and is dropped, one still present is
 * refreshed. Permissions of sessions outside the covered directories are kept
 * untouched, so reconciling one workspace never hides another workspace's
 * requests.
 */
export function reconcilePermissions(
  local: readonly Permission[],
  snapshot: readonly Permission[],
  coveredSessionIDs: ReadonlySet<string>,
): Permission[] {
  const kept = local.filter((permission) => !coveredSessionIDs.has(permission.sessionID))
  const keptIDs = new Set(kept.map((permission) => permission.id))
  return [...kept, ...snapshot.filter((permission) => !keptIDs.has(permission.id))]
}
