import { describe, expect, it } from "vitest"
import { filterSessions, sessionDirectory } from "../src/sessions"
import type { Session } from "../src/types"

function session(id: string, isolation?: Session["isolation"]): Session {
  return { id, isolation } as Session
}

const isolated = session("ses_iso", {
  isolated: true,
  worktreePath: "/workspace/.worktrees/app/abc",
  branch: "masterhand/app-abc",
  baseRef: "main",
})

describe("filterSessions", () => {
  const sessions = [session("ses_plain"), isolated]

  it("returns every session for the all filter", () => {
    expect(filterSessions(sessions, "all")).toHaveLength(2)
  })

  it("keeps only isolated or only standard sessions", () => {
    expect(filterSessions(sessions, "isolated").map((item) => item.id)).toEqual(["ses_iso"])
    expect(filterSessions(sessions, "standard").map((item) => item.id)).toEqual(["ses_plain"])
  })
})

describe("sessionDirectory", () => {
  it("prefers the worktree path for isolated sessions", () => {
    expect(sessionDirectory(isolated, "/workspace/app")).toBe("/workspace/.worktrees/app/abc")
  })

  it("falls back to the workspace path for regular or missing sessions", () => {
    expect(sessionDirectory(session("ses_plain"), "/workspace/app")).toBe("/workspace/app")
    expect(sessionDirectory(null, "/workspace/app")).toBe("/workspace/app")
    expect(sessionDirectory(undefined, null)).toBeNull()
  })
})
