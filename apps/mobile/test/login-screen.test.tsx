import { fireEvent, render, screen } from "@testing-library/react-native"
import { LoginScreen } from "../src/screens/LoginScreen"

async function setup(props: Partial<React.ComponentProps<typeof LoginScreen>> = {}) {
  const onSubmit = jest.fn()
  await render(
    <LoginScreen initialServerUrl={null} busy={false} error={null} onSubmit={onSubmit} {...props} />,
  )
  return { onSubmit }
}

describe("LoginScreen", () => {
  it("keeps Sign in disabled until both fields are filled", async () => {
    const { onSubmit } = await setup()
    const url = screen.getByPlaceholderText("https://masterhand.example.com")
    const password = screen.getByPlaceholderText("••••••••")

    await fireEvent.press(screen.getByText("Sign in"))
    expect(onSubmit).not.toHaveBeenCalled()

    await fireEvent.changeText(url, "https://host")
    await fireEvent.press(screen.getByText("Sign in"))
    expect(onSubmit).not.toHaveBeenCalled()

    await fireEvent.changeText(password, "hunter2")
    await fireEvent.press(screen.getByText("Sign in"))
    expect(onSubmit).toHaveBeenCalledWith("https://host", "hunter2")
  })

  it("trims the server URL before submitting", async () => {
    const { onSubmit } = await setup()

    await fireEvent.changeText(screen.getByPlaceholderText("https://masterhand.example.com"), "  https://host  ")
    await fireEvent.changeText(screen.getByPlaceholderText("••••••••"), "pw")
    await fireEvent.press(screen.getByText("Sign in"))

    expect(onSubmit).toHaveBeenCalledWith("https://host", "pw")
  })

  it("prefills the stored server URL", async () => {
    await setup({ initialServerUrl: "https://saved.example.com" })

    expect(screen.getByDisplayValue("https://saved.example.com")).toBeOnTheScreen()
  })

  it("renders the server error and hides the label while busy", async () => {
    const { rerender } = await render(
      <LoginScreen initialServerUrl={null} busy={false} error="Wrong password" onSubmit={() => {}} />,
    )
    expect(screen.getByText("Wrong password")).toBeOnTheScreen()

    await rerender(<LoginScreen initialServerUrl={null} busy error={null} onSubmit={() => {}} />)
    expect(screen.queryByText("Sign in")).toBeNull()
  })
})
