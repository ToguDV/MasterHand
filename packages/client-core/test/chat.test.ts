import { describe, expect, it } from "vitest"
import type { AssistantMessage, Message, Part, TextPart, ToolPart, UserMessage } from "../src/types"
import {
  directoryName,
  formatRelative,
  hasVisibleParts,
  isStreaming,
  isTaskTool,
  mergePart,
  messageText,
  removeMessage,
  removePart,
  sessionUsage,
  splitFences,
  subagentInfo,
  subagentOutput,
  toolTitle,
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

function assistantMessage(id: string, cost: number, output: number): AssistantMessage {
  return {
    id,
    sessionID: "ses_1",
    role: "assistant",
    time: { created: 1, completed: 2 },
    modelID: "test-model",
    providerID: "test",
    cost,
    tokens: { input: 0, output, reasoning: 0, cache: { read: 0, write: 0 } },
  } as unknown as AssistantMessage
}

describe("sessionUsage", () => {
  it("totals cost and output tokens across assistant messages only", () => {
    const list: MessageWithParts[] = [
      { info: userMessage("msg_1"), parts: [] },
      { info: assistantMessage("msg_2", 0.5, 100), parts: [] },
      { info: assistantMessage("msg_3", 0.25, 50), parts: [] },
    ]
    expect(sessionUsage(list)).toEqual({ cost: 0.75, tokens: 150 })
  })

  it("returns zeroes for an empty session", () => {
    expect(sessionUsage([])).toEqual({ cost: 0, tokens: 0 })
  })
})

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

describe("message helpers", () => {
  it("joins the text of text parts only", () => {
    const entry: MessageWithParts = {
      info: userMessage("msg_1"),
      parts: [
        textPart("prt_1", "msg_1", "hello"),
        { id: "prt_2", sessionID: "ses_1", messageID: "msg_1", type: "step-start" } as Part,
        textPart("prt_3", "msg_1", "world"),
      ],
    }
    expect(messageText(entry)).toBe("hello\nworld")
  })

  it("detects a streaming assistant message", () => {
    const streaming = { ...userMessage("msg_1"), role: "assistant", time: { created: 1 } } as unknown as AssistantMessage
    const done = { ...streaming, time: { created: 1, completed: 2 } } as unknown as AssistantMessage
    expect(isStreaming({ info: streaming, parts: [] })).toBe(true)
    expect(isStreaming({ info: done, parts: [] })).toBe(false)
    expect(isStreaming({ info: userMessage("msg_2"), parts: [] })).toBe(false)
  })

  it("ignores step boundary parts when deciding visibility", () => {
    const base = { id: "prt", sessionID: "ses_1", messageID: "msg_1" }
    expect(hasVisibleParts({ info: userMessage("msg_1"), parts: [] })).toBe(false)
    expect(
      hasVisibleParts({
        info: userMessage("msg_1"),
        parts: [{ ...base, type: "step-start" } as Part, { ...base, type: "step-finish" } as Part],
      }),
    ).toBe(false)
    expect(
      hasVisibleParts({
        info: userMessage("msg_1"),
        parts: [{ ...base, type: "step-start" } as Part, textPart("prt_t", "msg_1", "x")],
      }),
    ).toBe(true)
  })

  it("labels tool parts by state", () => {
    const make = (state: unknown): ToolPart =>
      ({ id: "t", sessionID: "s", messageID: "m", type: "tool", callID: "c", tool: "bash", state }) as ToolPart
    expect(toolTitle(make({ status: "running", title: "Running ls" }))).toBe("Running ls")
    expect(toolTitle(make({ status: "running" }))).toBe("Preparing…")
    expect(toolTitle(make({ status: "completed", title: "Done" }))).toBe("Done")
    expect(toolTitle(make({ status: "error" }))).toBe("Error")
    expect(toolTitle(make({ status: "pending" }))).toBe("Preparing…")
  })

  it("detects and normalizes the task subagent tool", () => {
    const task: ToolPart = {
      id: "t",
      sessionID: "ses_1",
      messageID: "msg_1",
      type: "tool",
      callID: "call_1",
      tool: "task",
      state: {
        status: "completed",
        input: { subagent_type: "explore", description: "Find files", prompt: "look for x" },
        output: "<task id=\"ses_child\" state=\"completed\">\n<task_result>found it</task_result>\n</task>",
        title: "Find files",
        metadata: { sessionId: "ses_child" },
        time: { start: 1, end: 2 },
      },
    }
    expect(isTaskTool(task)).toBe(true)
    expect(isTaskTool({ ...task, tool: "bash" })).toBe(false)
    expect(isTaskTool(textPart("prt_1", "msg_1", "hi"))).toBe(false)

    expect(subagentInfo(task)).toEqual({
      name: "explore",
      description: "Find files",
      prompt: "look for x",
      sessionID: "ses_child",
      background: false,
    })
    expect(subagentOutput(task)).toBe("found it")
  })

  it("falls back when a running task has no metadata yet", () => {
    const running: ToolPart = {
      id: "t",
      sessionID: "ses_1",
      messageID: "msg_1",
      type: "tool",
      callID: "call_1",
      tool: "task",
      state: {
        status: "running",
        input: {},
        title: "Working",
        metadata: { sessionId: "ses_child", background: true },
        time: { start: 1 },
      },
    }
    expect(subagentInfo(running)).toMatchObject({ name: "subagent", description: "Working", background: true })
    expect(subagentOutput(running)).toBeNull()
  })

  it("formats relative timestamps", () => {
    const now = 10_000_000_000
    expect(formatRelative(now, now)).toBe("now")
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5 min ago")
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe("3 h ago")
    expect(formatRelative(now - 2 * 86_400_000, now)).toBe("2 d ago")
    expect(formatRelative(now - 40 * 86_400_000, now)).toBe(new Date(now - 40 * 86_400_000).toLocaleDateString())
  })
})

export type { Part, Message }
