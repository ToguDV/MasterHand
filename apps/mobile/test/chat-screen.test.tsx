import { fireEvent, render, screen } from "@testing-library/react-native"
import type { ChatMessage } from "@masterhand/client-core"
import { ChatScreen } from "../src/screens/ChatScreen"
import { fakeClient, makeQueryClient, QueryWrapper } from "./support/render"

const assistant: ChatMessage = {
  info: {
    id: "a1",
    sessionID: "s1",
    role: "assistant",
    time: { created: 1, completed: 2 },
    modelID: "test-model",
    cost: 0.001,
    tokens: { output: 5 } as ChatMessage["info"]["tokens"],
  },
  parts: [{ id: "p1", sessionID: "s1", messageID: "a1", type: "text", text: "reply from agent" }],
}

async function setup(
  props: Partial<React.ComponentProps<typeof ChatScreen>> = {},
  configure?: (client: ReturnType<typeof fakeClient>) => void,
) {
  const client = fakeClient()
  configure?.(client)
  const handlers = {
    onToggleAutoAccept: jest.fn(),
    onOpenSession: jest.fn(),
    onBack: jest.fn(),
    ...props,
  }
  await render(
    <ChatScreen
      client={client}
      sessionID="s1"
      title="My session"
      busy={false}
      connected
      workspaceID={null}
      autoAccept={false}
      {...handlers}
    />,
    { wrapper: ({ children }) => <QueryWrapper client={makeQueryClient()}>{children}</QueryWrapper> },
  )
  return { client, handlers }
}

describe("ChatScreen", () => {
  it("renders the title, the messages and the usage line", async () => {
    await setup({}, (client) => {
      client.api.messages.mockResolvedValue([assistant])
    })

    expect(await screen.findByText("reply from agent")).toBeOnTheScreen()
    expect(screen.getByText("My session")).toBeOnTheScreen()
    expect(screen.getByText("Session · $0.0010 · 5 tok")).toBeOnTheScreen()
  })

  it("prompts to start when there are no messages", async () => {
    await setup()

    expect(
      await screen.findByText("Write a message to start working with the agent."),
    ).toBeOnTheScreen()
  })

  it("goes back from the header", async () => {
    const { handlers } = await setup()

    await fireEvent.press(screen.getByText("‹"))

    expect(handlers.onBack).toHaveBeenCalled()
  })

  it("finishes an isolated session and reports the result", async () => {
    const { client } = await setup({
      isolation: {
        isolated: true,
        worktreePath: "/workspaces/.worktrees/demo/abc",
        branch: "masterhand/abc",
        baseRef: "HEAD",
      },
    })
    client.api.sessions.finish.mockResolvedValue({
      committed: true,
      pushed: true,
      prUrl: "https://github.com/ToguDV/masterhand/pull/99",
      branch: "masterhand/abc",
      path: "/workspaces/.worktrees/demo/abc",
      error: null,
    })

    expect(screen.getByText("masterhand/abc")).toBeOnTheScreen()
    await fireEvent.press(screen.getByText("Finish & PR"))

    expect(client.api.sessions.finish).toHaveBeenCalledWith("s1")
    expect(await screen.findByText(/Branch pushed\./)).toBeOnTheScreen()
    expect(screen.getByText("Open pull request ↗")).toBeOnTheScreen()
  })

  it("returns to the parent session from a subagent view", async () => {
    const { handlers } = await setup({ parentSessionID: "parent-1" })

    await fireEvent.press(screen.getByText("← Back to main agent"))

    expect(handlers.onOpenSession).toHaveBeenCalledWith("parent-1")
  })

  it("opens the preview modal when previews are enabled", async () => {
    const { client } = await setup({}, (client) => {
      client.auth.status.mockResolvedValue({
        ok: true,
        preview: { enabled: true, available: true, portRange: { min: 3000, max: 3010 } },
      })
    })

    await fireEvent.press(await screen.findByText("Preview"))

    expect(client.api.preview).toHaveBeenCalledWith("s1")
  })
})
