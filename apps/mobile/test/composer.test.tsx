import { fireEvent, render, screen } from "@testing-library/react-native"
import type { AgentInfo, ModelInfo, ProviderInfo } from "@masterhand/client-core"
import { Composer } from "../src/components/Composer"
import { fakeClient, makeQueryClient, QueryWrapper } from "./support/render"

const agents: AgentInfo[] = [
  { id: "build", name: "Build", mode: "primary" },
  { id: "explore", name: "Explore", mode: "primary" },
] as unknown as AgentInfo[]

const providers: ProviderInfo[] = [{ id: "test", name: "Test" }] as unknown as ProviderInfo[]

const models: ModelInfo[] = [
  { id: "test-model", providerID: "test", name: "Test Model", variants: [{ id: "low" }, { id: "high" }], enabled: true },
  { id: "alpha", providerID: "test", name: "Alpha", variants: [], enabled: true },
] as unknown as ModelInfo[]

async function setup(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const client = fakeClient()
  client.api.agents.mockResolvedValue(agents)
  client.api.models.mockResolvedValue({ models, providers, defaultModel: models[0] })
  await render(
    <Composer
      client={client}
      sessionID="s1"
      busy={false}
      workspaceID={null}
      autoAccept={false}
      onToggleAutoAccept={jest.fn()}
      {...props}
    />,
    { wrapper: ({ children }) => <QueryWrapper client={makeQueryClient()}>{children}</QueryWrapper> },
  )
  return { client }
}

describe("Composer", () => {
  it("shows the default agent and model from the catalog", async () => {
    await setup()

    expect(await screen.findByText("Build")).toBeOnTheScreen()
    expect(screen.getByText("Test · Test Model")).toBeOnTheScreen()
  })

  it("sends the typed prompt with the selected agent and model", async () => {
    const { client } = await setup()

    await fireEvent.changeText(await screen.findByPlaceholderText("Write a message…"), "hello")
    await fireEvent.press(screen.getByText("Send"))

    expect(client.api.prompt).toHaveBeenCalledWith(
      "s1",
      { text: "hello", agent: "build", model: { providerID: "test", id: "test-model" } },
      { agent: undefined, model: undefined },
    )
  })

  it("cannot send an empty prompt", async () => {
    const { client } = await setup()

    await fireEvent.press(await screen.findByText("Send"))

    expect(client.api.prompt).not.toHaveBeenCalled()
  })

  it("shows Stop while busy and aborts the session", async () => {
    const { client } = await setup({ busy: true })

    await fireEvent.press(await screen.findByText("Stop"))

    expect(client.api.abortSession).toHaveBeenCalledWith("s1")
    expect(screen.queryByText("Send")).toBeNull()
  })

  it("toggles auto-accept", async () => {
    const onToggleAutoAccept = jest.fn()
    await setup({ onToggleAutoAccept })

    await fireEvent.press(await screen.findByText("auto-accept"))

    expect(onToggleAutoAccept).toHaveBeenCalledWith(true)
  })

  it("switches the model through the picker", async () => {
    const { client } = await setup()

    await fireEvent.press(await screen.findByText("Test · Test Model"))
    await fireEvent.press(screen.getByText("Test · Alpha"))
    await fireEvent.changeText(screen.getByPlaceholderText("Write a message…"), "hi")
    await fireEvent.press(screen.getByText("Send"))

    expect(client.api.prompt).toHaveBeenCalledWith(
      "s1",
      { text: "hi", agent: "build", model: { providerID: "test", id: "alpha" } },
      { agent: undefined, model: undefined },
    )
  })

  it("offers the effort variants of the selected model", async () => {
    const { client } = await setup()

    await fireEvent.press(await screen.findByText("effort: default"))
    await fireEvent.press(screen.getByText("High"))
    await fireEvent.changeText(screen.getByPlaceholderText("Write a message…"), "go")
    await fireEvent.press(screen.getByText("Send"))

    expect(client.api.prompt).toHaveBeenCalledWith(
      "s1",
      { text: "go", agent: "build", model: { providerID: "test", id: "test-model", variant: "high" } },
      { agent: undefined, model: undefined },
    )
  })
})
