import { fireEvent, render, screen } from "@testing-library/react-native"
import type { Permission } from "@masterhand/client-core"
import { PermissionModal } from "../src/components/PermissionModal"

const permission: Permission = {
  id: "perm_1",
  sessionID: "ses_1",
  action: "bash",
  resources: ["rm -rf build"],
}

describe("PermissionModal", () => {
  it("renders the requested action and its resources", async () => {
    await render(<PermissionModal permission={permission} busy={false} onRespond={() => {}} />)

    expect(screen.getByText("Permission required")).toBeOnTheScreen()
    expect(screen.getByText("bash")).toBeOnTheScreen()
    expect(screen.getByText("rm -rf build")).toBeOnTheScreen()
  })

  it("omits the resource line when the request has none", async () => {
    await render(
      <PermissionModal permission={{ ...permission, resources: [] }} busy={false} onRespond={() => {}} />,
    )

    expect(screen.queryByText("rm -rf build")).toBeNull()
  })

  it("answers once, always or reject", async () => {
    const onRespond = jest.fn()
    await render(<PermissionModal permission={permission} busy={false} onRespond={onRespond} />)

    await fireEvent.press(screen.getByText("Once"))
    await fireEvent.press(screen.getByText("Always"))
    await fireEvent.press(screen.getByText("Reject"))

    expect(onRespond.mock.calls.map((call) => call[0])).toEqual(["once", "always", "reject"])
  })

  it("ignores presses while a response is in flight", async () => {
    const onRespond = jest.fn()
    await render(<PermissionModal permission={permission} busy onRespond={onRespond} />)

    await fireEvent.press(screen.getByText("Once"))

    expect(onRespond).not.toHaveBeenCalled()
  })
})
