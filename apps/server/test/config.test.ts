import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.js"

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { MASTERHAND_PASSWORD: "pw", SESSION_SECRET: "secret", ...overrides }
}

describe("loadConfig", () => {
  it("throws when the masterhand password is missing", () => {
    expect(() => loadConfig({ SESSION_SECRET: "secret", MASTERHAND_PASSWORD: undefined })).toThrow(
      /MASTERHAND_PASSWORD/,
    )
    expect(() => loadConfig({ SESSION_SECRET: "secret", MASTERHAND_PASSWORD: "" })).toThrow(
      /MASTERHAND_PASSWORD/,
    )
  })

  it("throws when the session secret is missing", () => {
    expect(() => loadConfig({ MASTERHAND_PASSWORD: "pw", SESSION_SECRET: undefined })).toThrow(/SESSION_SECRET/)
    expect(() => loadConfig({ MASTERHAND_PASSWORD: "pw", SESSION_SECRET: "" })).toThrow(/SESSION_SECRET/)
  })

  it("applies the documented defaults", () => {
    const config = loadConfig(env())
    expect(config).toMatchObject({
      port: 8787,
      opencodeUrl: "http://127.0.0.1:4096",
      opencodeAuth: null,
      masterhandPassword: "pw",
      sessionSecret: "secret",
      sessionTtlHours: 720,
      cookieSecure: true,
      dataDir: "./data",
      webDist: "apps/web/dist",
    })
  })

  it("parses numeric overrides and falls back on invalid values", () => {
    expect(loadConfig(env({ PORT: "9123", SESSION_TTL_HOURS: "1" }))).toMatchObject({
      port: 9123,
      sessionTtlHours: 1,
    })
    expect(loadConfig(env({ PORT: "not-a-number" })).port).toBe(8787)
  })

  it("parses boolean overrides", () => {
    expect(loadConfig(env({ COOKIE_SECURE: "true" })).cookieSecure).toBe(true)
    expect(loadConfig(env({ COOKIE_SECURE: "1" })).cookieSecure).toBe(true)
    expect(loadConfig(env({ COOKIE_SECURE: "false" })).cookieSecure).toBe(false)
    expect(loadConfig(env({ COOKIE_SECURE: "" })).cookieSecure).toBe(false)
  })

  it("disables webDist when WEB_DIST is an empty string", () => {
    expect(loadConfig(env({ WEB_DIST: "" })).webDist).toBeNull()
  })

  it("builds the opencode basic auth header with the default username", () => {
    const config = loadConfig(env({ OPENCODE_SERVER_PASSWORD: "oc" }))
    expect(config.opencodeAuth).toBe(`Basic ${Buffer.from("opencode:oc").toString("base64")}`)
  })

  it("respects a custom opencode username", () => {
    const config = loadConfig(env({ OPENCODE_SERVER_USERNAME: "admin", OPENCODE_SERVER_PASSWORD: "oc" }))
    expect(config.opencodeAuth).toBe(`Basic ${Buffer.from("admin:oc").toString("base64")}`)
  })

  it("parses and trims the allowed origins list", () => {
    const config = loadConfig(env({ ALLOWED_ORIGINS: " https://a.example , https://b.example ,,", NODE_ENV: "production" }))
    expect(config.allowedOrigins.sort()).toEqual(["https://a.example", "https://b.example"])
  })

  it("resolves the workspaces root with a repo-local default", () => {
    expect(loadConfig(env()).workspacesRoot).toBe(resolve("./workspace"))
    expect(loadConfig(env({ WORKSPACES_ROOT: " /srv/workspaces " })).workspacesRoot).toBe("/srv/workspaces")
    expect(loadConfig(env({ WORKSPACES_ROOT: "" })).workspacesRoot).toBe(resolve("./workspace"))
  })

  it("adds the local dev origins outside production", () => {
    const dev = loadConfig(env())
    expect(dev.allowedOrigins).toContain("http://localhost:5173")
    expect(dev.allowedOrigins).toContain("http://127.0.0.1:5173")

    const prod = loadConfig(env({ NODE_ENV: "production" }))
    expect(prod.allowedOrigins).not.toContain("http://localhost:5173")
  })
})
