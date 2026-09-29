import { expect, type Page } from "@playwright/test"

export async function login(page: Page): Promise<void> {
  await page.goto("/")
  await page.locator("#password").fill("e2e-password")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("button", { name: "Sign in" })).toBeHidden()
}

export async function addWorkspace(page: Page, name?: string): Promise<string> {
  // The BFF creates the folder under WORKSPACES_ROOT; a unique name per run avoids clashes.
  const workspaceName = name ?? `mh-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await page.getByRole("button", { name: "Add workspace" }).click()
  await page.getByPlaceholder("my-project").fill(workspaceName)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByRole("option", { name: workspaceName })).toHaveCount(1)
  return workspaceName
}
