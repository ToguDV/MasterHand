import { describe, expect, it } from "vitest"
import { filterSessions, rootSessions } from "../src/sessions"
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

describe("rootSessions", () => {
  it("hides subagent children from the list", () => {
    const parent = session("ses_parent")
    const child = { id: "ses_child", parentID: "ses_parent" } as Session
    expect(rootSessions([parent, child]).map((item) => item.id)).toEqual(["ses_parent"])
  })
})
