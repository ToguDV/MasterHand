import { expect, test } from "@playwright/test"

test("rejects a wrong password", async ({ page }) => {
  await page.goto("/")
  await page.locator("#password").fill("not-the-password")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByText("Wrong password")).toBeVisible()
})

test("login, create a session, stream a reply and approve a permission", async ({ page }) => {
  await page.goto("/")
  await page.locator("#password").fill("e2e-password")
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page.getByRole("button", { name: "+ New" })).toBeVisible()
  await page.getByRole("button", { name: "+ New" }).click()

  const composer = page.getByPlaceholder("Write a message…")
  await expect(composer).toBeVisible()
  await composer.fill("hello agent")
  await page.getByRole("button", { name: "Send" }).click()

  await expect(page.getByText("hello agent")).toBeVisible()

  await expect(page.getByText("Permission required")).toBeVisible()
  await expect(page.getByText("Run `ls`")).toBeVisible()
  await page.getByRole("button", { name: "Once" }).click()

  await expect(page.getByText("Done!")).toBeVisible()
  await expect(page.getByText("Permission required")).toBeHidden()
})
