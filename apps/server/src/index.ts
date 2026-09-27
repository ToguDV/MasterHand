import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { createApp } from "./app.js"
import { loadConfig } from "./config.js"
import { createEventHub } from "./events.js"
import { createSqliteStore } from "./store.js"

const config = loadConfig()
mkdirSync(config.dataDir, { recursive: true })

const store = createSqliteStore(join(config.dataDir, "masterhand.sqlite"))

const hub = createEventHub({
  url: new URL("/global/event", config.opencodeUrl).toString(),
  authHeader: config.opencodeAuth,
})

const app = createApp({ config, store, hub })

if (config.webDist && existsSync(config.webDist)) {
  const webDist = config.webDist
  app.use("*", serveStatic({ root: webDist }))
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "not_found" }, 404)
    }
    return c.html(readFileSync(join(webDist, "index.html"), "utf8"))
  })
}

hub.start()

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[masterhand] listening on :${info.port} → opencode ${config.opencodeUrl}`)
})

function shutdown(): void {
  hub.stop()
  store.close()
  server.close(() => process.exit(0))
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
