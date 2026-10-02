import { fireEvent, render, screen } from "@testing-library/react-native"
import { ApiError, type WorkspaceRecord } from "@masterhand/client-core"
import { WorkspaceModal } from "../src/components/WorkspaceModal"

const workspaces: WorkspaceRecord[] = [
  { id: "ws1", name: "demo", path: "/workspaces/demo", createdAt: 0 },
  { id: "ws2", name: "other", path: "/workspaces/other", createdAt: 0 },
]

async function setup(props: Partial<React.ComponentProps<typeof WorkspaceModal>> = {}) {
  const handlers = {
    onSelect: jest.fn(),
    onAdd: jest.fn(async () => {}),
    onRemove: jest.fn(),
    onClose: jest.fn(),
    ...props,
  }
  await render(<WorkspaceModal visible workspaces={workspaces} selectedID={null} {...handlers} />)
  return handlers
}

describe("WorkspaceModal", () => {
  it("lists workspaces and selects one, closing the sheet", async () => {
    const handlers = await setup()

    expect(screen.getByText("demo")).toBeOnTheScreen()
    expect(screen.getByText("/workspaces/other")).toBeOnTheScreen()

    await fireEvent.press(screen.getByText("demo"))
    expect(handlers.onSelect).toHaveBeenCalledWith("ws1")
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it("shows an empty state without workspaces", async () => {
    await setup({ workspaces: [] })

    expect(screen.getByText("No workspaces yet.")).toBeOnTheScreen()
  })

  it("adds a workspace with the trimmed name", async () => {
    const handlers = await setup()

    await fireEvent.press(screen.getByText("Add workspace"))
    await fireEvent.changeText(screen.getByPlaceholderText("my-project"), "  new-project  ")
    await fireEvent.press(screen.getByText("Add"))

    expect(handlers.onAdd).toHaveBeenCalledWith({ name: "new-project" })
  })

  it("explains a duplicate workspace error", async () => {
    const onAdd = jest.fn(async () => {
      throw new ApiError(409, "exists")
    })
    await setup({ onAdd })

    await fireEvent.press(screen.getByText("Add workspace"))
    await fireEvent.changeText(screen.getByPlaceholderText("my-project"), "demo")
    await fireEvent.press(screen.getByText("Add"))

    expect(await screen.findByText("That workspace already exists")).toBeOnTheScreen()
    expect(screen.getByText("Add")).toBeOnTheScreen()
  })

  it("removes the selected workspace, with the delete-files option", async () => {
    const handlers = await setup({ selectedID: "ws1" })

    await fireEvent.press(screen.getByText("Remove workspace"))
    expect(handlers.onRemove).toHaveBeenCalledWith("ws1", { deleteFiles: false })

    await fireEvent.press(screen.getByText("Also delete files from disk"))
    await fireEvent.press(screen.getByText("Remove workspace"))
    expect(handlers.onRemove).toHaveBeenLastCalledWith("ws1", { deleteFiles: true })
  })

  it("explains an invalid folder name", async () => {
    const onAdd = jest.fn(async () => {
      throw new ApiError(400, "bad name")
    })
    await setup({ onAdd })

    await fireEvent.press(screen.getByText("Add workspace"))
    await fireEvent.changeText(screen.getByPlaceholderText("my-project"), "a/b")
    await fireEvent.press(screen.getByText("Add"))

    expect(await screen.findByText("Enter a valid folder name (no slashes or leading dots)")).toBeOnTheScreen()
  })

  it("falls back to a generic error", async () => {
    const onAdd = jest.fn(async () => {
      throw new Error("boom")
    })
    await setup({ onAdd })

    await fireEvent.press(screen.getByText("Add workspace"))
    await fireEvent.changeText(screen.getByPlaceholderText("my-project"), "fresh")
    await fireEvent.press(screen.getByText("Add"))

    expect(await screen.findByText("Could not add the workspace")).toBeOnTheScreen()
  })

  it("cancels the add form", async () => {
    await setup()

    await fireEvent.press(screen.getByText("Add workspace"))
    expect(screen.getByPlaceholderText("my-project")).toBeOnTheScreen()

    await fireEvent.press(screen.getByText("Cancel"))
    expect(screen.queryByPlaceholderText("my-project")).toBeNull()
  })

  it("resets the form when the sheet is hidden", async () => {
    const props = {
      workspaces,
      selectedID: null,
      onSelect: jest.fn(),
      onAdd: jest.fn(async () => {}),
      onRemove: jest.fn(),
      onClose: jest.fn(),
    }
    const { rerender } = await render(<WorkspaceModal visible {...props} />)

    await fireEvent.press(screen.getByText("Add workspace"))
    await fireEvent.changeText(screen.getByPlaceholderText("my-project"), "typed")
    await rerender(<WorkspaceModal visible={false} {...props} />)
    await rerender(<WorkspaceModal visible {...props} />)

    expect(screen.queryByPlaceholderText("my-project")).toBeNull()
  })
})
