import { expect, test } from "@playwright/test"
import { addWorkspace, login } from "./helpers"

test("opens the command list on / and runs the selected command", async ({ page }) => {
  await login(page)
  await addWorkspace(page)
  await page.getByRole("button", { name: "+ New" }).click()

  const composer = page.getByPlaceholder("Write a message…")
  await composer.fill("/")
  await expect(page.getByRole("option", { name: /\/component/ })).toBeVisible()

  await page.getByRole("option", { name: /\/component/ }).click()
  await expect(composer).toHaveValue("/component ")
  // The real template declares a free-form `$ARGUMENTS` placeholder.
  await expect(page.getByText("free-form arguments")).toBeVisible()

  await composer.fill("/component Button")
  await page.getByRole("button", { name: "Send" }).click()

  await expect(
    page.getByText("Create a new React component named Button with TypeScript support."),
  ).toBeVisible()
})

test("opens the subagent list on @ and inserts the mention", async ({ page }) => {
  await login(page)
  await addWorkspace(page)
  await page.getByRole("button", { name: "+ New" }).click()

  const composer = page.getByPlaceholder("Write a message…")
  await composer.fill("@gen")
  await expect(page.getByRole("option", { name: "@general" })).toBeVisible()

  await page.getByRole("option", { name: "@general" }).click()
  await expect(composer).toHaveValue("@general ")
})

test("suggests and inserts an argument from the command description", async ({ page }) => {
  await login(page)
  await addWorkspace(page)
  await page.getByRole("button", { name: "+ New" }).click()

  const composer = page.getByPlaceholder("Write a message…")
  await composer.fill("/review ")
  await expect(page.getByRole("option", { name: "commit" })).toBeVisible()

  await page.getByRole("option", { name: "commit" }).click()
  await expect(composer).toHaveValue("/review commit ")

  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText("Review the changes: commit")).toBeVisible()
})
