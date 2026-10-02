import { afterEach, describe, expect, it } from "vitest"
import {
  deriveCommandArguments,
  descriptionSuggestions,
  mergeCommandTemplates,
} from "../src/commands.js"
import { login, startMockOpencode, startTestApp, type MockOpencode, type TestApp } from "./helpers.js"

/** Stub upstream that answers each path with a canned response. */
function opencodeStub(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const handler = routes[new URL(String(input)).pathname]
    if (!handler) return new Response("not found", { status: 404 })
    return handler()
  }) as typeof fetch
}

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

let app: TestApp | null = null
let upstream: MockOpencode | null = null

afterEach(async () => {
  await app?.close()
  await upstream?.close()
  app = null
  upstream = null
})

describe("descriptionSuggestions", () => {
  it("extracts the value list a command's own description declares", () => {
    expect(descriptionSuggestions("review changes [commit|branch|pr], defaults to uncommitted")).toEqual([
      "commit",
      "branch",
      "pr",
    ])
  })

  it("ignores brackets without alternatives and absent descriptions", () => {
    expect(descriptionSuggestions("[WIP] something")).toEqual([])
    expect(descriptionSuggestions("no usage here")).toEqual([])
    expect(descriptionSuggestions(undefined)).toEqual([])
  })
})

describe("deriveCommandArguments", () => {
  it("detects free-form and positional placeholders in the template", () => {
    expect(deriveCommandArguments("desc", "Use $ARGUMENTS now")).toEqual([
      { position: 0, freeForm: true, suggestions: [] },
    ])
    expect(deriveCommandArguments("desc", "Create $1 in $2 with $3")).toEqual([
      { position: 1, freeForm: false, suggestions: [] },
      { position: 2, freeForm: false, suggestions: [] },
      { position: 3, freeForm: false, suggestions: [] },
    ])
  })

  it("attaches description suggestions to the first argument", () => {
    expect(deriveCommandArguments("review [commit|branch|pr]", "Review $1")).toEqual([
      { position: 1, freeForm: false, suggestions: ["commit", "branch", "pr"] },
    ])
    expect(deriveCommandArguments("run [a|b]", "Run $ARGUMENTS")).toEqual([
      { position: 0, freeForm: true, suggestions: ["a", "b"] },
    ])
  })

  it("falls back to the description usage for commands without a template", () => {
    expect(deriveCommandArguments("review changes [commit|branch|pr]", undefined)).toEqual([
      { position: 1, freeForm: false, suggestions: ["commit", "branch", "pr"] },
    ])
  })

  it("returns no hints when there is nothing to derive", () => {
    expect(deriveCommandArguments(undefined, undefined)).toEqual([])
    expect(deriveCommandArguments("just a description", "Say hello.")).toEqual([])
  })
})

describe("mergeCommandTemplates", () => {
  it("merges every document and lets later ones win", () => {
    const merged = mergeCommandTemplates([
      { info: { commands: { a: { template: "first" }, b: { template: "keep" } } } },
      { info: { commands: { a: { template: "second" }, c: { template: 42 } } } },
      {},
    ])
    expect(merged.get("a")).toBe("second")
    expect(merged.get("b")).toBe("keep")
    expect(merged.has("c")).toBe(false)
  })
})

describe("GET /api/commands", () => {
  it("returns commands with deterministic argument hints", async () => {
    upstream = await startMockOpencode()
    app = await startTestApp({ config: { opencodeUrl: upstream.url } })
    const cookie = await login(app.url)

    const response = await fetch(`${app.url}/api/commands?directory=%2Fworkspace%2Fapp`, {
      headers: { cookie },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { commands: unknown[] }
    expect(body.commands).toEqual([
      {
        name: "review",
        description: "review changes [commit|branch|pr], defaults to uncommitted",
        arguments: [{ position: 1, freeForm: false, suggestions: ["commit", "branch", "pr"] }],
      },
      {
        name: "create-file",
        description: "Create a file with content",
        arguments: [
          { position: 1, freeForm: false, suggestions: [] },
          { position: 2, freeForm: false, suggestions: [] },
          { position: 3, freeForm: false, suggestions: [] },
        ],
      },
      { name: "init", description: "guided AGENTS.md setup", arguments: [] },
    ])

    const queries = upstream.requests.filter((request) => request.path.startsWith("/api/command") || request.path === "/api/config")
    expect(queries.map((request) => request.query)).toEqual([
      "location%5Bdirectory%5D=%2Fworkspace%2Fapp",
      "location%5Bdirectory%5D=%2Fworkspace%2Fapp",
    ])
  })

  it("requires authentication", async () => {
    app = await startTestApp()
    const response = await fetch(`${app.url}/api/commands`)
    expect(response.status).toBe(401)
  })

  it("keeps commands when the config is unusable", async () => {
    const fetchImpl = opencodeStub({
      "/api/command": () => json({ data: [{ name: "review", description: "review changes [commit|branch|pr]" }] }),
      "/api/config": () => json({ not: "an array" }),
    })
    app = await startTestApp({ fetchImpl })
    const cookie = await login(app.url)

    const response = await fetch(`${app.url}/api/commands`, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      commands: [
        {
          name: "review",
          description: "review changes [commit|branch|pr]",
          arguments: [{ position: 1, freeForm: false, suggestions: ["commit", "branch", "pr"] }],
        },
      ],
    })
  })

  it("reports a failing command catalog", async () => {
    app = await startTestApp({ fetchImpl: opencodeStub({ "/api/command": () => new Response("boom", { status: 500 }) }) })
    const cookie = await login(app.url)
    const response = await fetch(`${app.url}/api/commands`, { headers: { cookie } })
    expect(response.status).toBe(502)
  })

  it("tolerates a non-array command payload", async () => {
    app = await startTestApp({ fetchImpl: opencodeStub({ "/api/command": () => json({ data: "nope" }) }) })
    const cookie = await login(app.url)
    const response = await fetch(`${app.url}/api/commands`, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ commands: [] })
  })
})
