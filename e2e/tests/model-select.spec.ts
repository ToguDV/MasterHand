import { expect, test } from "@playwright/test"

test("limits model options and searches the rest", async ({ page }) => {
  await page.goto("/")
  await page.locator("#password").fill("e2e-password")
  await page.getByRole("button", { name: "Sign in" }).click()

  await page.getByRole("button", { name: "+ New" }).click()

  const modelButton = page.getByRole("button", { name: "Model", exact: true })
  await expect(modelButton).toBeVisible()
  await modelButton.click()

  const listbox = page.getByRole("listbox", { name: "Model" })
  await expect(listbox.getByRole("option")).toHaveCount(6)
  await expect(page.getByRole("button", { name: "Show all 9 models" })).toBeVisible()

  await page.getByRole("button", { name: "Show all 9 models" }).click()
  await expect(listbox.getByRole("option")).toHaveCount(9)

  await page.getByRole("textbox", { name: "Search model" }).fill("flash")
  await expect(listbox.getByRole("option")).toHaveCount(1)
  await listbox.getByRole("option", { name: "Other · Flash" }).click()

  await expect(modelButton).toContainText("Other · Flash")
  await expect(listbox).toBeHidden()
})
