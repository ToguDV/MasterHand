import type { Session } from "./types"

export type SessionFilter = "all" | "isolated" | "standard"

/** Filters a workspace session list by isolation mode (shared by web/mobile). */
export function filterSessions(sessions: Session[], filter: SessionFilter): Session[] {
  if (filter === "all") return sessions
  return sessions.filter((session) =>
    filter === "isolated" ? Boolean(session.isolation) : !session.isolation,
  )
}

/**
 * Sessions that belong in the session list. Subagent children are linked to
 * their parent through `parentID` and are only reachable from the parent's
 * subagent card, so they never show up as top-level sessions. Forks (used for
 * `/btw` side questions) are temporary and stay out of the list too.
 */
export function rootSessions(sessions: Session[]): Session[] {
  return sessions.filter((session) => !session.parentID && !session.fork)
}
