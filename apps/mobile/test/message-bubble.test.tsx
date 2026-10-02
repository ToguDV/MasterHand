import { fireEvent, render, screen } from "@testing-library/react-native"
import type { ChatMessage, ChatMessageInfo, ChatPart } from "@masterhand/client-core"
import { MessageBubble } from "../src/components/MessageBubble"

function message(info: Partial<ChatMessageInfo>, parts: ChatPart[]): ChatMessage {
  return {
    info: {
      id: "m1",
      sessionID: "s1",
      role: "assistant",
      time: { created: 1 },
      ...info,
    },
    parts,
  }
}

function bubble(info: Partial<ChatMessageInfo>, parts: ChatPart[], onOpenSession?: (id: string) => void) {
  return <MessageBubble entry={message(info, parts)} onOpenSession={onOpenSession} />
}

const textPart = (text: string): ChatPart => ({
  id: "p-text",
  sessionID: "s1",
  messageID: "m1",
  type: "text",
  text,
})

const reasoningPart = (text: string): ChatPart => ({
  id: "p-reason",
  sessionID: "s1",
  messageID: "m1",
  type: "reasoning",
  text,
})

const toolPart = (state: Record<string, unknown>): ChatPart =>
  ({
    id: "p-tool",
    sessionID: "s1",
    messageID: "m1",
    type: "tool",
    tool: "bash",
    callID: "c1",
    state,
  }) as unknown as ChatPart

const subagentPart = (state: Record<string, unknown>): ChatPart =>
  ({
    id: "p-sub",
    sessionID: "s1",
    messageID: "m1",
    type: "tool",
    tool: "subagent",
    callID: "c1",
    state,
  }) as unknown as ChatPart

describe("MessageBubble", () => {
  it("renders a user message as plain text", async () => {
    await render(bubble({ role: "user" }, [textPart("hello there")]))

    expect(screen.getByText("hello there")).toBeOnTheScreen()
  })

  it("renders nothing for an empty user message", async () => {
    await render(bubble({ role: "user" }, [textPart("   ")]))

    expect(screen.queryByText("   ")).toBeNull()
  })

  it("renders assistant markdown text", async () => {
    await render(bubble({ time: { created: 1, completed: 2 } }, [textPart("# Heading\n\nbody text")]))

    // The markdown renderer is stubbed (see test/mocks); assert the source is
    // handed to it rather than re-testing markdown parsing here.
    expect(screen.getByText(/# Heading/)).toBeOnTheScreen()
    expect(screen.getByText(/body text/)).toBeOnTheScreen()
  })

  it("shows Thinking… while a streamed message has no parts yet", async () => {
    await render(bubble({}, []))

    expect(screen.getByText("Thinking…")).toBeOnTheScreen()
  })

  it("shows the structured error and the usage line when completed", async () => {
    await render(
      bubble(
        {
          time: { created: 1, completed: 2 },
          modelID: "test-model",
          cost: 0.0021,
          tokens: { output: 42 } as ChatMessageInfo["tokens"],
          error: { name: "x", message: "boom" } as unknown as ChatMessageInfo["error"],
        },
        [textPart("done")],
      ),
    )

    expect(screen.getByText("boom")).toBeOnTheScreen()
    expect(screen.getByText("test-model · $0.0021 · 42 tok")).toBeOnTheScreen()
  })

  it("reveals reasoning text on demand", async () => {
    await render(bubble({}, [reasoningPart("because reasons")]))

    expect(screen.queryByText("because reasons")).toBeNull()
    await fireEvent.press(screen.getByText("▸ Reasoning"))
    expect(screen.getByText("because reasons")).toBeOnTheScreen()
  })

  it("expands a tool card to show its input and output", async () => {
    await render(
      bubble({ time: { created: 1, completed: 2 } }, [
        toolPart({ status: "completed", title: "list files", input: { cmd: "ls" }, output: "file.txt" }),
      ]),
    )

    expect(screen.getByText("bash")).toBeOnTheScreen()
    expect(screen.getByText("list files")).toBeOnTheScreen()
    await fireEvent.press(screen.getByText("list files"))
    expect(screen.getByText(/"cmd": "ls"/)).toBeOnTheScreen()
    expect(screen.getByText("file.txt")).toBeOnTheScreen()
  })

  it("renders a subagent card and opens the child session", async () => {
    const onOpenSession = jest.fn()
    await render(
      bubble({ time: { created: 1, completed: 2 } }, [
        subagentPart({
          status: "completed",
          input: { agent: "explore", description: "map the repo", prompt: "Find the entry point" },
          output: "<task><summary>done</summary><task_result>Found 3 files</task_result></task>",
          metadata: { sessionID: "child-1" },
        }),
      ], onOpenSession),
    )

    expect(screen.getByText("SUBAGENT")).toBeOnTheScreen()
    expect(screen.getByText("explore")).toBeOnTheScreen()
    expect(screen.getByText("map the repo")).toBeOnTheScreen()

    await fireEvent.press(screen.getByText("map the repo"))
    expect(screen.getByText("Find the entry point")).toBeOnTheScreen()
    // The <task>/<summary> wrapper is stripped from the output.
    expect(screen.getByText("Found 3 files")).toBeOnTheScreen()

    await fireEvent.press(screen.getByText("Open session →"))
    expect(onOpenSession).toHaveBeenCalledWith("child-1")
  })
})
