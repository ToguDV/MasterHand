import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, type Page } from "@playwright/test"

export async function login(page: Page): Promise<void> {
  await page.goto("/")
  await page.locator("#password").fill("e2e-password")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("button", { name: "Sign in" })).toBeHidden()
}

export async function addWorkspace(page: Page, path?: string): Promise<string> {
  // The BFF validates that the folder exists, so E2E uses a real temp directory.
  const workspacePath = path ?? mkdtempSync(join(tmpdir(), "mh-e2e-"))
  await page.getByRole("button", { name: "Add workspace" }).click()
  await page.getByPlaceholder("/workspace/my-project").fill(workspacePath)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByText(workspacePath)).toBeVisible()
  return workspacePath
}
