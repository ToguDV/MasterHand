#!/usr/bin/env node
// Stops everything `scripts/dev.mjs` may have left running, including
// processes it reused or that got orphaned (opencode serve re-parents itself,
// so a plain Ctrl+C on a later run cannot reach an old instance).
//
//   npm run dev:stop
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import process from "node:process"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const isWindows = process.platform === "win32"
const isMac = process.platform === "darwin"

// Same env file the dev orchestrator loads, so the ports match.
const envFile = join(rootDir, "apps/server/.env.local")
if (existsSync(envFile)) process.loadEnvFile(envFile)

const bffPort = Number(process.env.PORT ?? 8787)
const opencodePort = Number(new URL(process.env.OPENCODE_URL ?? "http://127.0.0.1:4096").port || 4096)

const targets = new Map() // pid -> label

// Never kill this process or anything that launched it (the shell running
// `npm run dev:stop`, whose command line may mention the same patterns).
const excluded = new Set([process.pid])
if (!isWindows) {
  let current = process.pid
  while (current > 1) {
    try {
      current = Number(execFileSync("ps", ["-o", "ppid=", "-p", String(current)], { encoding: "utf8" }).trim())
      excluded.add(current)
    } catch {
      break
    }
  }
}

function add(pid, label) {
  const value = Number(pid)
  if (value && !excluded.has(value)) targets.set(value, label)
}

// Repo-local dev binaries (the absolute path from `ps` is passed to pgrep -f).
function fromCommand(pattern, label) {
  if (isWindows) return
  try {
    const out = execFileSync("pgrep", ["-f", pattern], { encoding: "utf8" })
    for (const pid of out.split("\n")) add(pid.trim(), label)
  } catch {
    // pgrep exits non-zero when nothing matches
  }
}

function fromPort(port, label) {
  try {
    if (isWindows) {
      const out = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" })
      for (const line of out.split("\n")) {
        if (line.includes(`:${port} `) && line.includes("LISTENING")) add(line.trim().split(/\s+/).pop(), label)
      }
      return
    }
    const out = isMac
      ? execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" })
      : execFileSync("ss", ["-ltnp", `sport = :${port}`], { encoding: "utf8" })
    if (isMac) {
      for (const pid of out.split("\n")) add(pid.trim(), label)
      return
    }
    for (const match of out.matchAll(/pid=(\d+)/g)) add(match[1], label)
  } catch {
    // ss/lsof/netstat missing or nothing listening
  }
}

function kill(pid, signal) {
  if (isWindows) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" })
      return true
    } catch {
      return false
    }
  }
  try {
    process.kill(-pid, signal) // the whole process group, when pid leads one
    return true
  } catch {
    // pid is not a process-group leader
  }
  try {
    process.kill(pid, signal)
    return true
  } catch {
    return false
  }
}

fromCommand(join(rootDir, "scripts/dev.mjs"), "dev orchestrator")
fromCommand("scripts/dev.mjs", "dev orchestrator")
for (const bin of ["vite", "tsx", "expo", "electron"]) fromCommand(join(rootDir, "node_modules/.bin", bin), bin)
fromPort(opencodePort, "opencode")
fromPort(bffPort, "BFF")

if (targets.size === 0) {
  console.log("[stop] nothing to stop")
  process.exit(0)
}

for (const [pid, label] of targets) {
  if (kill(pid, "SIGTERM")) console.log(`[stop] ${label}: SIGTERM (pid ${pid})`)
}

setTimeout(() => {
  let forced = 0
  for (const [pid, label] of targets) {
    if (kill(pid, "SIGKILL")) {
      console.log(`[stop] ${label}: SIGKILL (pid ${pid})`)
      forced++
    }
  }
  console.log(`[stop] done (${targets.size} targeted${forced ? `, ${forced} forced` : ""})`)
}, 1500)
