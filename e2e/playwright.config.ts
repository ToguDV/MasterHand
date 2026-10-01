import { fileURLToPath } from "node:url"
import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

const e2eDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(e2eDir, "..")

const MOCK_PORT = 4097
const MOCK_PREVIEW_PORT = 32950
const BFF_PORT = 8788

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${BFF_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx tsx mock-opencode.ts",
      cwd: e2eDir,
      env: { MOCK_PORT: String(MOCK_PORT), MOCK_PREVIEW_PORT: String(MOCK_PREVIEW_PORT) },
      url: `http://127.0.0.1:${MOCK_PORT}/global/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npm run build -w @masterhand/web && npx tsx apps/server/src/index.ts",
      cwd: repoRoot,
      env: {
        PORT: String(BFF_PORT),
        OPENCODE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        MASTERHAND_PASSWORD: "e2e-password",
        SESSION_SECRET: "e2e-secret",
        COOKIE_SECURE: "false",
        DATA_DIR: "/tmp/masterhand-e2e",
        WORKSPACES_ROOT: "/tmp/masterhand-e2e-workspace",
        PREVIEW_ORIGIN: "127.0.0.1",
        PREVIEW_PORT_RANGE: `${MOCK_PREVIEW_PORT}-${MOCK_PREVIEW_PORT}`,
        // The fake trycloudflare URL is not a real host, so the BFF must not
        // wait for it to become reachable.
        PREVIEW_READINESS_MS: "0",
        CLOUDFLARED_BIN: path.join(e2eDir, "fake-cloudflared.sh"),
      },
      url: `http://127.0.0.1:${BFF_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
