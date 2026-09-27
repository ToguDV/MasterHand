import { describe, expect, it } from "vitest"
import type { Part, TextPart, ToolPart, UserMessage } from "../src/types"
import {
  directoryName,
  mergePart,
  removeMessage,
  removePart,
  splitFences,
  upsertMessage,
  upsertPart,
  type MessageWithParts,
} from "../src/chat"

function textPart(id: string, messageID: string, text: string): TextPart {
  return { id, sessionID: "ses_1", messageID, type: "text", text }
}

function userMessage(id: string): UserMessage {
  return {
    id,
    sessionID: "ses_1",
    role: "user",
    time: { created: Date.now() },
    agent: "build",
    model: { providerID: "test", modelID: "test-model" },
  }
}

describe("mergePart", () => {
  it("appends the delta when the incoming text matches the current one", () => {
    const existing = textPart("prt_1", "msg_1", "hello")
    const incoming = textPart("prt_1", "msg_1", "hello")
    const merged = mergePart(existing, incoming, " world") as TextPart
    expect(merged.text).toBe("hello world")
  })

  it("replaces when the incoming text already contains the full content", () => {
    const existing = textPart("prt_1", "msg_1", "hello")
    const incoming = textPart("prt_1", "msg_1", "hello world")
    const merged = mergePart(existing, incoming, " world") as TextPart
    expect(merged.text).toBe("hello world")
  })

  it("leaves non-text parts untouched", () => {
    const tool: ToolPart = {
      id: "prt_2",
      sessionID: "ses_1",
      messageID: "msg_1",
      type: "tool",
      callID: "call_1",
      tool: "bash",
      state: { status: "pending", input: {}, raw: "" },
    }
    expect(mergePart(undefined, tool, "delta")).toEqual(tool)
  })

  it("returns the incoming part when there is no existing one", () => {
    const incoming = textPart("prt_1", "msg_1", "new")
    expect(mergePart(undefined, incoming, "x")).toEqual(incoming)
  })
})

describe("upsertMessage / upsertPart / remove", () => {
  it("appends messages and updates existing ones without duplicating", () => {
    let list: MessageWithParts[] = []
    list = upsertMessage(list, userMessage("msg_1"))
    list = upsertMessage(list, userMessage("msg_2"))
    expect(list).toHaveLength(2)

    const updated = { ...userMessage("msg_1"), agent: "plan" }
    list = upsertMessage(list, updated)
    expect(list).toHaveLength(2)
    expect((list[0]?.info as UserMessage).agent).toBe("plan")
  })

  it("adds new parts and updates existing ones by id", () => {
    let list: MessageWithParts[] = [{ info: userMessage("msg_1"), parts: [] }]
    list = upsertPart(list, textPart("prt_1", "msg_1", "hello"))
    list = upsertPart(list, textPart("prt_2", "msg_1", "world"))
    expect(list[0]?.parts).toHaveLength(2)

    list = upsertPart(list, textPart("prt_1", "msg_1", "bye"))
    expect(list[0]?.parts).toHaveLength(2)
    expect((list[0]?.parts[0] as TextPart).text).toBe("bye")
  })

  it("ignores parts whose message is not in the list", () => {
    const list: MessageWithParts[] = [{ info: userMessage("msg_1"), parts: [] }]
    const next = upsertPart(list, textPart("prt_9", "msg_9", "x"))
    expect(next).toBe(list)
  })

  it("removes parts and messages", () => {
    let list: MessageWithParts[] = [
      { info: userMessage("msg_1"), parts: [textPart("prt_1", "msg_1", "a"), textPart("prt_2", "msg_1", "b")] },
    ]
    list = removePart(list, "msg_1", "prt_1")
    expect(list[0]?.parts.map((part) => part.id)).toEqual(["prt_2"])
    list = removeMessage(list, "msg_1")
    expect(list).toHaveLength(0)
  })
})

describe("utilities", () => {
  it("extracts the directory name", () => {
    expect(directoryName("/home/user/projects/app")).toBe("app")
    expect(directoryName("/")).toBe("/")
  })

  it("splits fenced code blocks", () => {
    const segments = splitFences("before\n```ts\nconst a = 1\n```\nafter")
    expect(segments).toHaveLength(3)
    expect(segments[1]).toMatchObject({ type: "code", language: "ts", content: "const a = 1\n" })
  })

  it("returns a single text segment without fences", () => {
    const segments = splitFences("plain text")
    expect(segments).toEqual([{ type: "text", content: "plain text" }])
  })
})

export type { Part }
