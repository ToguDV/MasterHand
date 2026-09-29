import { expect, test } from "@playwright/test"
import { addWorkspace, login } from "./helpers"

test("adds a workspace, deletes a session and removes the workspace", async ({ page }) => {
  await login(page)
  const workspacePath = await addWorkspace(page)
  const workspaceName = workspacePath.split("/").pop() ?? workspacePath
  await expect(page.getByRole("button", { name: "+ New" })).toBeEnabled()

  await page.getByRole("button", { name: "+ New" }).click()
  await expect(page.getByPlaceholder("Write a message…")).toBeVisible()
  await expect(page.getByText("Untitled")).toBeVisible()

  page.on("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "Delete session" }).click()
  await expect(page.getByText("Untitled")).toBeHidden()
  await expect(page.getByText("No sessions yet.")).toBeVisible()

  await page.getByRole("button", { name: "Remove workspace" }).click()
  await expect(page.getByText(workspacePath)).toBeHidden()
  await expect(page.getByRole("option", { name: workspaceName })).toHaveCount(0)
})

test("keeps sessions scoped to the selected workspace", async ({ page }) => {
  await login(page)
  const workspace = page.getByRole("combobox", { name: "Workspace", exact: true })

  await addWorkspace(page)
  const firstWorkspaceID = await workspace.inputValue()

  await page.getByRole("button", { name: "+ New" }).click()
  await expect(page.getByText("Untitled")).toBeVisible()

  await addWorkspace(page)
  await expect(page.getByText("Untitled")).toBeHidden()
  await expect(page.getByText("No sessions yet.")).toBeVisible()

  await workspace.selectOption(firstWorkspaceID)
  await expect(page.getByText("Untitled")).toBeVisible()
})
