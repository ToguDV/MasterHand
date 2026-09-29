import { resolve } from "node:path"

export interface Config {
  port: number
  opencodeUrl: string
  opencodeAuth: string | null
  masterhandPassword: string
  sessionSecret: string
  sessionTtlHours: number
  cookieSecure: boolean
  dataDir: string
  webDist: string | null
  allowedOrigins: string[]
  /** Base directory under which every workspace subfolder is created. */
  workspacesRoot: string
}

function intFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value === "true" || value === "1"
}

function listFromEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const masterhandPassword = env.MASTERHAND_PASSWORD ?? ""
  if (!masterhandPassword) {
    throw new Error("MASTERHAND_PASSWORD is required (UI access password)")
  }
  const sessionSecret = env.SESSION_SECRET ?? ""
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required (cookie/token signing; generate one with `openssl rand -hex 32`)")
  }

  const opencodeUsername = env.OPENCODE_SERVER_USERNAME ?? "opencode"
  const opencodePassword = env.OPENCODE_SERVER_PASSWORD ?? ""
  const opencodeAuth = opencodePassword
    ? `Basic ${Buffer.from(`${opencodeUsername}:${opencodePassword}`).toString("base64")}`
    : null

  const allowedOrigins = new Set(listFromEnv(env.ALLOWED_ORIGINS))
  if (env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:5173")
    allowedOrigins.add("http://127.0.0.1:5173")
  }

  return {
    port: intFromEnv(env.PORT, 8787),
    opencodeUrl: env.OPENCODE_URL ?? "http://127.0.0.1:4096",
    opencodeAuth,
    masterhandPassword,
    sessionSecret,
    sessionTtlHours: intFromEnv(env.SESSION_TTL_HOURS, 720),
    cookieSecure: boolFromEnv(env.COOKIE_SECURE, true),
    dataDir: env.DATA_DIR ?? "./data",
    webDist: env.WEB_DIST === "" ? null : (env.WEB_DIST ?? "apps/web/dist"),
    allowedOrigins: [...allowedOrigins],
    workspacesRoot: resolve(env.WORKSPACES_ROOT?.trim() || "./workspace"),
  }
}
