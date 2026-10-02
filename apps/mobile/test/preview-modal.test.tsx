import { fireEvent, render, screen } from "@testing-library/react-native"
import { ApiError } from "@masterhand/client-core"
import { PreviewModal } from "../src/components/PreviewModal"
import { fakeClient, makeQueryClient, QueryWrapper } from "./support/render"

async function setup(client = fakeClient(), onClose = jest.fn()) {
  const queryClient = makeQueryClient()
  await render(<PreviewModal client={client} sessionID="s1" onClose={onClose} />, {
    wrapper: ({ children }) => <QueryWrapper client={queryClient}>{children}</QueryWrapper>,
  })
  return { client, onClose }
}

const enabled = { enabled: true, available: true, portRange: { min: 3000, max: 3010 } }

describe("PreviewModal", () => {
  it("offers Start and points at the reserved port when stopped", async () => {
    const client = fakeClient()
    client.auth.status.mockResolvedValue({ ok: true, preview: enabled })
    await setup(client)

    expect(await screen.findByText("Start")).toBeOnTheScreen()
    expect(screen.getByText(/port 3000/)).toBeOnTheScreen()
  })

  it("starts the tunnel and renders the WebView", async () => {
    const client = fakeClient()
    client.auth.status.mockResolvedValue({ ok: true, preview: enabled })
    client.api.startPreview.mockResolvedValue({
      status: "running",
      url: "https://abc.trycloudflare.com",
      port: 3000,
      error: null,
    })
    await setup(client)

    await fireEvent.press(await screen.findByText("Start"))

    expect(client.api.startPreview).toHaveBeenCalledWith("s1")
    expect(await screen.findByText("WebView: https://abc.trycloudflare.com")).toBeOnTheScreen()
    expect(screen.queryByText("Start")).toBeNull()
    expect(screen.getByText("Stop")).toBeOnTheScreen()
  })

  it("stops the tunnel and returns to the placeholder", async () => {
    const client = fakeClient()
    client.auth.status.mockResolvedValue({ ok: true, preview: enabled })
    client.api.preview.mockResolvedValue({
      status: "running",
      url: "https://abc.trycloudflare.com",
      port: 3000,
      error: null,
    })
    await setup(client)

    await fireEvent.press(await screen.findByText("Stop"))

    expect(client.api.stopPreview).toHaveBeenCalledWith("s1")
    expect(await screen.findByText("Start")).toBeOnTheScreen()
    expect(screen.queryByText(/WebView:/)).toBeNull()
  })

  it("explains when cloudflared is unavailable", async () => {
    const client = fakeClient()
    client.auth.status.mockResolvedValue({
      ok: true,
      preview: { enabled: true, available: false, portRange: { min: 3000, max: 3010 } },
    })
    await setup(client)

    expect(await screen.findByText(/cloudflared is not available/)).toBeOnTheScreen()
    expect(screen.queryByText("Start")).toBeNull()
  })

  it("surfaces a start failure", async () => {
    const client = fakeClient()
    client.auth.status.mockResolvedValue({ ok: true, preview: enabled })
    client.api.startPreview.mockRejectedValue(
      new ApiError(409, JSON.stringify({ error: "preview_not_running" })),
    )
    await setup(client)

    await fireEvent.press(await screen.findByText("Start"))

    expect(
      await screen.findByText(/The agent has not started a web server yet/),
    ).toBeOnTheScreen()
    // Still stopped, and the button is retryable.
    expect(screen.getByText("Start")).toBeOnTheScreen()
  })

  it("closes on request", async () => {
    const client = fakeClient()
    client.auth.status.mockResolvedValue({ ok: true, preview: enabled })
    const { onClose } = await setup(client)

    await fireEvent.press(await screen.findByText("Close"))

    expect(onClose).toHaveBeenCalled()
  })
})
