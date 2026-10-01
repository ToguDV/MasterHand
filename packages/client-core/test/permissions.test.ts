import { describe, expect, it } from "vitest"
import { reconcilePermissions } from "../src/permissions"
import type { Permission } from "../src/types"

function permission(id: string, sessionID: string): Permission {
  return { id, sessionID, action: "bash", resources: ["ls"] }
}

describe("reconcilePermissions", () => {
  it("drops covered permissions missing from the server snapshot", () => {
    const local = [permission("per_1", "ses_1")]
    expect(reconcilePermissions(local, [], new Set(["ses_1"]))).toEqual([])
  })

  it("refreshes covered permissions still pending on the server", () => {
    const local = [permission("per_1", "ses_1")]
    const fresh = permission("per_1", "ses_1")
    expect(reconcilePermissions(local, [fresh], new Set(["ses_1"]))).toEqual([fresh])
  })

  it("keeps permissions outside the covered sessions", () => {
    const local = [permission("per_1", "ses_1"), permission("per_2", "ses_2")]
    const result = reconcilePermissions(local, [], new Set(["ses_1"]))
    expect(result.map((item) => item.id)).toEqual(["per_2"])
  })

  it("appends server permissions that are not tracked locally", () => {
    const local = [permission("per_2", "ses_2")]
    const fresh = permission("per_1", "ses_1")
    const result = reconcilePermissions(local, [fresh], new Set(["ses_1"]))
    expect(result.map((item) => item.id)).toEqual(["per_2", "per_1"])
  })

  it("does not duplicate a kept permission that is also in the snapshot", () => {
    const local = [permission("per_2", "ses_2")]
    const result = reconcilePermissions(local, [permission("per_2", "ses_2")], new Set())
    expect(result.map((item) => item.id)).toEqual(["per_2"])
  })
})
