import { describe, expect, it, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { createEventHandler, invalidateOnReconnect, queryKeys } from "../src/hooks"
import type { Message, MessageWithPartsResponse, Part, Permission } from "../src/types"

function message(id: string, sessionID = "ses_1"): Message {
  return { id, sessionID, role: "user" } as unknown as Message
}

function textPart(id: string, messageID: string, text = "hi"): Part {
  return { id, sessionID: "ses_1", messageID, type: "text", text } as unknown as Part
}

function entry(info: Message, parts: Part[] = []): MessageWithPartsResponse {
  return { info, parts }
}

function makeQueryClient(): { qc: QueryClient; invalidate: ReturnType<typeof vi.spyOn> } {
  const qc = new QueryClient()
  const invalidate = vi.spyOn(qc, "invalidateQueries")
  return { qc, invalidate }
}

describe("queryKeys", () => {
  it("scopes message keys by session", () => {
    expect(queryKeys.messages("ses_1")).toEqual(["messages", "ses_1"])
    expect(queryKeys.sessions).toEqual(["sessions"])
  })

  it("scopes session keys by workspace and directory keys", () => {
    expect(queryKeys.sessionsFor("ws_1")).toEqual(["sessions", "ws_1"])
    expect(queryKeys.sessionsFor()).toEqual(["sessions", null])
    expect(queryKeys.directories("ws_1")).toEqual(["directories", "ws_1"])
    expect(queryKeys.directories()).toEqual(["directories", null])
  })
})

describe("createEventHandler", () => {
  it("invalidates the session list on session lifecycle events", () => {
    const { qc, invalidate } = makeQueryClient()
    const handler = createEventHandler(qc)
    for (const type of ["session.created", "session.updated", "session.deleted"]) {
      handler({ type, properties: {} })
    }
    expect(invalidate).toHaveBeenCalledTimes(3)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.sessions })
  })

  it("caches session.status updates, tolerating an empty cache", () => {
    const { qc } = makeQueryClient()
    const handler = createEventHandler(qc)
    handler({ type: "session.status", properties: { sessionID: "ses_1", status: { type: "busy" } } })
    expect(qc.getQueryData(queryKeys.statuses)).toEqual({ ses_1: { type: "busy" } })

    handler({ type: "session.status", properties: { sessionID: "ses_2", status: { type: "idle" } } })
    expect(qc.getQueryData(queryKeys.statuses)).toEqual({
      ses_1: { type: "busy" },
      ses_2: { type: "idle" },
    })
  })

  it("marks a session idle and refreshes its messages", () => {
    const { qc, invalidate } = makeQueryClient()
    qc.setQueryData(queryKeys.statuses, { ses_1: { type: "busy" } })
    const handler = createEventHandler(qc)

    handler({ type: "session.idle", properties: { sessionID: "ses_1" } })
    expect(qc.getQueryData(queryKeys.statuses)).toEqual({ ses_1: { type: "idle" } })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.messages("ses_1") })
  })

  it("upserts messages only when the cache already has the session", () => {
    const { qc } = makeQueryClient()
    const handler = createEventHandler(qc)

    handler({ type: "message.updated", properties: { info: message("msg_1") } })
    expect(qc.getQueryData(queryKeys.messages("ses_1"))).toBeUndefined()

    qc.setQueryData(queryKeys.messages("ses_1"), [])
    handler({ type: "message.updated", properties: { info: message("msg_1") } })
    const list = qc.getQueryData<MessageWithPartsResponse[]>(queryKeys.messages("ses_1"))
    expect(list).toHaveLength(1)
    expect(list?.[0]?.info.id).toBe("msg_1")
  })

  it("upserts parts only when the cache already has the session", () => {
    const { qc } = makeQueryClient()
    const handler = createEventHandler(qc)

    handler({ type: "message.part.updated", properties: { part: textPart("prt_1", "msg_1") } })
    expect(qc.getQueryData(queryKeys.messages("ses_1"))).toBeUndefined()

    qc.setQueryData(queryKeys.messages("ses_1"), [entry(message("msg_1"))])
    handler({ type: "message.part.updated", properties: { part: textPart("prt_1", "msg_1") } })
    const list = qc.getQueryData<MessageWithPartsResponse[]>(queryKeys.messages("ses_1"))
    expect(list?.[0]?.parts.map((part) => part.id)).toEqual(["prt_1"])
  })

  it("removes parts and whole messages", () => {
    const { qc } = makeQueryClient()
    qc.setQueryData(queryKeys.messages("ses_1"), [entry(message("msg_1"), [textPart("prt_1", "msg_1")])])
    const handler = createEventHandler(qc)

    handler({ type: "message.part.removed", properties: { sessionID: "ses_1", messageID: "msg_1", partID: "prt_1" } })
    expect(qc.getQueryData<MessageWithPartsResponse[]>(queryKeys.messages("ses_1"))?.[0]?.parts).toHaveLength(0)

    handler({ type: "message.removed", properties: { sessionID: "ses_1", messageID: "msg_1" } })
    expect(qc.getQueryData<MessageWithPartsResponse[]>(queryKeys.messages("ses_1"))).toHaveLength(0)
  })

  it("dispatches permission and error callbacks", () => {
    const { qc } = makeQueryClient()
    const onPermission = vi.fn()
    const onPermissionReplied = vi.fn()
    const onSessionError = vi.fn()
    const handler = createEventHandler(qc, { onPermission, onPermissionReplied, onSessionError })

    const permission = {
      id: "per_1",
      sessionID: "ses_1",
      permission: "bash",
      patterns: ["ls"],
    } as Permission
    handler({ type: "permission.asked", properties: permission })
    expect(onPermission).toHaveBeenCalledWith(permission)

    handler({ type: "permission.replied", properties: { sessionID: "ses_1", requestID: "per_1", reply: "once" } })
    expect(onPermissionReplied).toHaveBeenCalledWith("per_1")

    handler({ type: "session.error", properties: { sessionID: "ses_1", error: { name: "UnknownError", data: { message: "boom\nstack" } } } })
    expect(onSessionError).toHaveBeenCalledWith("boom")
  })

  it("still accepts the legacy permission.updated event and permissionID payloads", () => {
    const { qc } = makeQueryClient()
    const onPermission = vi.fn()
    const onPermissionReplied = vi.fn()
    const handler = createEventHandler(qc, { onPermission, onPermissionReplied })

    const permission = { id: "per_1", sessionID: "ses_1" } as unknown as Permission
    handler({ type: "permission.updated", properties: permission })
    expect(onPermission).toHaveBeenCalledWith(permission)

    handler({ type: "permission.replied", properties: { permissionID: "per_1" } })
    expect(onPermissionReplied).toHaveBeenCalledWith("per_1")
  })

  it("ignores aborted turns", () => {
    const { qc } = makeQueryClient()
    const onSessionError = vi.fn()
    const handler = createEventHandler(qc, { onSessionError })
    handler({ type: "session.error", properties: { error: { name: "MessageAbortedError", data: { message: "aborted" } } } })
    expect(onSessionError).not.toHaveBeenCalled()
  })

  it("ignores unknown event types", () => {
    const { qc, invalidate } = makeQueryClient()
    const handler = createEventHandler(qc)
    handler({ type: "unknown.event", properties: {} })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it("works without callbacks", () => {
    const { qc } = makeQueryClient()
    const handler = createEventHandler(qc)
    expect(() => handler({ type: "permission.asked", properties: {} })).not.toThrow()
    expect(() => handler({ type: "session.error", properties: {} })).not.toThrow()
  })
})

describe("invalidateOnReconnect", () => {
  it("refreshes sessions, messages, statuses and directories", () => {
    const { qc, invalidate } = makeQueryClient()
    invalidateOnReconnect(qc)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.sessions })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["messages"] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.statuses })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["directories"] })
  })
})
