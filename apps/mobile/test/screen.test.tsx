import { Keyboard, Platform, Text } from "react-native"
import { act, render, screen } from "@testing-library/react-native"
import { Screen } from "../src/components/Screen"

type Listener = () => void

function edgesOf(tree: ReturnType<typeof screen.toJSON>): Record<string, unknown> {
  let found: Record<string, unknown> = {}
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return
    const n = node as { type?: string; props?: { edges?: Record<string, unknown> }; children?: unknown[] }
    if (n.type === "RNCSafeAreaView") found = n.props?.edges ?? {}
    n.children?.forEach(walk)
  }
  walk(tree)
  return found
}

describe("Screen", () => {
  it("renders its children inside the safe area", async () => {
    await render(
      <Screen>
        <Text>content</Text>
      </Screen>,
    )

    expect(screen.getByText("content")).toBeOnTheScreen()
  })

  it("drops the bottom inset while the keyboard is up", async () => {
    const listeners: Record<string, Listener> = {}
    const spy = jest.spyOn(Keyboard, "addListener").mockImplementation((event, listener) => {
      listeners[event] = listener as Listener
      return { remove: jest.fn() } as never
    })

    await render(
      <Screen>
        <Text>content</Text>
      </Screen>,
    )

    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"
    expect(spy).toHaveBeenCalledWith(show, expect.any(Function))
    expect(spy).toHaveBeenCalledWith(hide, expect.any(Function))
    expect(edgesOf(screen.toJSON()).bottom).toBe("additive")

    await act(async () => {
      listeners[show]?.()
    })
    // The native view keeps the key but disables the edge.
    expect(edgesOf(screen.toJSON()).bottom).toBe("off")

    await act(async () => {
      listeners[hide]?.()
    })
    expect(edgesOf(screen.toJSON()).bottom).toBe("additive")

    spy.mockRestore()
  })
})
