import { expect, type Page } from "@playwright/test"

export async function login(page: Page): Promise<void> {
  await page.goto("/")
  await page.locator("#password").fill("e2e-password")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("button", { name: "Sign in" })).toBeHidden()
}

export async function addWorkspace(page: Page, path?: string): Promise<string> {
  const workspacePath = path ?? `/e2e/project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  await page.getByRole("button", { name: "Add workspace" }).click()
  await page.getByPlaceholder("/workspace/my-project").fill(workspacePath)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByText(workspacePath)).toBeVisible()
  return workspacePath
}
