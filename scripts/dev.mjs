#!/usr/bin/env node
// Single-command dev orchestrator: starts opencode serve (unless already
// running), the BFF, and the requested front end together.
//
//   node scripts/dev.mjs web      -> opencode + BFF + web
//   node scripts/dev.mjs mobile   -> opencode + BFF + Expo
//   node scripts/dev.mjs desktop  -> opencode + BFF + Electron
//   node scripts/dev.mjs server   -> opencode + BFF
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import net from "node:net"
import process from "node:process"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")

// Each target maps to the npm script (and extra args) it runs as the "front".
// `null` means no front end: opencode + BFF only.
const TARGETS = {
  server: null,
  web: ["dev", "-w", "@masterhand/web"],
  desktop: ["dev", "-w", "@masterhand/desktop"],
  mobile: ["start", "-w", "@masterhand/mobile"],
}

const target = process.argv[2]
if (!(target in TARGETS)) {
  console.error(`[dev] usage: node scripts/dev.mjs <${Object.keys(TARGETS).join("|")}>`)
  process.exit(1)
}

// Development env shared by the BFF and opencode (password, ports, ...).
const envFile = join(rootDir, "apps/server/.env.local")
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
  console.log(`[dev] loaded ${envFile}`)
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm"
const opencodeUrl = new URL(process.env.OPENCODE_URL ?? "http://127.0.0.1:4096")
const opencodeHost = opencodeUrl.hostname
const opencodePort = Number(opencodeUrl.port || 4096)

const children = []
let shuttingDown = false

function isPortOpen(host, port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    socket.setTimeout(timeout)
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("timeout", () => {
      socket.destroy()
      resolve(false)
    })
    socket.once("error", () => resolve(false))
  })
}

function killTree(child) {
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
    } else {
      process.kill(-child.pid, "SIGTERM")
    }
  } catch {
    // already gone
  }
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) killTree(child)
  }
  process.exit(code)
}

function spawnChild(label, command, args) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    detached: process.platform !== "win32",
  })
  child.on("error", (error) => {
    if (error.code === "ENOENT") {
      console.error(`[dev] ${label}: command not found (${command})`)
      if (label === "opencode") {
        console.error("[dev] install opencode v2 (npm install -g @opencode/cli) or set MASTERHAND_SKIP_OPENCODE=1")
      }
    } else {
      console.error(`[dev] ${label} failed: ${error.message}`)
    }
    shutdown(1)
  })
  child.on("exit", (code, signal) => {
    if (shuttingDown) return
    console.log(`[dev] ${label} exited (${signal ?? code})`)
    shutdown(code ?? 0)
  })
  children.push({ label, child })
}

async function main() {
  if (process.env.MASTERHAND_SKIP_OPENCODE === "1") {
    console.log("[dev] opencode skipped (MASTERHAND_SKIP_OPENCODE=1)")
  } else if (await isPortOpen(opencodeHost, opencodePort)) {
    console.log(`[dev] opencode already listening on ${opencodeHost}:${opencodePort}, skipping`)
  } else {
    console.log(`[dev] starting opencode serve on ${opencodeHost}:${opencodePort}`)
    spawnChild("opencode", "opencode", ["serve", "--hostname", opencodeHost, "--port", String(opencodePort)])
  }

  console.log(`[dev] starting BFF on :${process.env.PORT ?? 8787}`)
  spawnChild("BFF", npm, ["run", "dev", "-w", "@masterhand/server"])

  const front = TARGETS[target]
  if (front) {
    console.log(`[dev] starting ${target}`)
    const extra = process.argv.slice(3)
    spawnChild(target, npm, ["run", ...front, ...(extra.length ? ["--", ...extra] : [])])
  }

  console.log("[dev] Ctrl+C stops this run; if a reused/leftover process survives, run: npm run dev:stop")
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))

main()
