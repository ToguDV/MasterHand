import { describe, expect, it } from "vitest"
import {
  defaultModelValue,
  flattenModels,
  parseModel,
  recentModelValue,
  selectableAgents,
  sessionModelValue,
  variantLabel,
} from "../src/models"
import type { AgentInfo, ProvidersResponse, Session } from "../src/types"

const providers: ProvidersResponse["providers"] = [
  {
    id: "zeta",
    name: "Zeta",
    models: {
      "z-model": { id: "z-model", name: "Z Model" },
      "a-model": { id: "a-model", name: "A Model", variants: { low: {}, high: {} } },
    },
  },
  {
    id: "alpha",
    name: "Alpha",
    models: { m1: { id: "m1", name: "M1", variants: { minimal: {}, max: {} } } },
  },
] as unknown as ProvidersResponse["providers"]

describe("flattenModels", () => {
  it("flattens providers and models sorted by label", () => {
    const options = flattenModels(providers)
    expect(options.map((option) => option.value)).toEqual(["alpha/m1", "zeta/a-model", "zeta/z-model"])
    expect(options[0]?.label).toBe("Alpha · M1")
  })

  it("exposes each model's variants", () => {
    const options = flattenModels(providers)
    expect(options.find((option) => option.value === "zeta/a-model")?.variants).toEqual(["low", "high"])
    expect(options.find((option) => option.value === "zeta/z-model")?.variants).toEqual([])
  })

  it("tolerates providers without models", () => {
    expect(flattenModels([])).toEqual([])
  })
})

describe("variantLabel", () => {
  it("translates known variants", () => {
    expect(variantLabel("none")).toBe("None")
    expect(variantLabel("minimal")).toBe("Minimal")
    expect(variantLabel("low")).toBe("Low")
    expect(variantLabel("medium")).toBe("Medium")
    expect(variantLabel("high")).toBe("High")
    expect(variantLabel("xhigh")).toBe("Very high")
    expect(variantLabel("max")).toBe("Max")
  })

  it("capitalizes unknown variants", () => {
    expect(variantLabel("turbo")).toBe("Turbo")
  })
})

describe("selectableAgents", () => {
  const agents = [
    { name: "build", mode: "primary" },
    { name: "plan", mode: "primary" },
    { name: "explainer", mode: "primary" },
    { name: "title", mode: "primary", hidden: true },
    { name: "compaction", mode: "primary", hidden: true },
    { name: "explore", mode: "subagent" },
  ] as unknown as AgentInfo[]

  it("excludes subagents and hidden agents", () => {
    expect(selectableAgents(agents).map((agent) => agent.name)).toEqual(["build", "plan", "explainer"])
  })

  it("tolerates empty lists", () => {
    expect(selectableAgents([])).toEqual([])
  })
})

describe("defaultModelValue", () => {
  const options = flattenModels(providers)

  it("prioritizes the config model", () => {
    expect(defaultModelValue("zeta/a-model", { alpha: "m1" }, options)).toBe("zeta/a-model")
  })

  it("uses the server default when the config model is unavailable", () => {
    expect(defaultModelValue("missing/model", { alpha: "m1" }, options)).toBe("alpha/m1")
  })

  it("falls back to the first available model", () => {
    expect(defaultModelValue(undefined, {}, options)).toBe("alpha/m1")
    expect(defaultModelValue(undefined, {}, [])).toBe("")
  })

  it("prefers the last used model over the config model", () => {
    expect(defaultModelValue("zeta/a-model", { alpha: "m1" }, options, "zeta/z-model")).toBe("zeta/z-model")
  })

  it("ignores a preferred model that is no longer available", () => {
    expect(defaultModelValue("zeta/a-model", {}, options, "missing/model")).toBe("zeta/a-model")
  })
})

describe("sessionModelValue", () => {
  const options = flattenModels(providers)
  const session = (model?: Session["model"]): Session => ({ id: "ses_1", model }) as unknown as Session

  it("returns the session model when available", () => {
    expect(sessionModelValue(session({ providerID: "zeta", id: "z-model" }), options)).toBe("zeta/z-model")
  })

  it("returns undefined without a model or when it is unavailable", () => {
    expect(sessionModelValue(session(undefined), options)).toBeUndefined()
    expect(sessionModelValue(undefined, options)).toBeUndefined()
    expect(sessionModelValue(session({ providerID: "gone", id: "model" }), options)).toBeUndefined()
  })
})

describe("recentModelValue", () => {
  const options = flattenModels(providers)
  const withModel = (id: string, updated: number, model: Session["model"]): Session =>
    ({ id, time: { created: 0, updated }, model }) as unknown as Session

  it("picks the model of the most recently updated session", () => {
    const sessions = [
      withModel("a", 100, { providerID: "zeta", id: "z-model" }),
      withModel("b", 200, { providerID: "zeta", id: "a-model" }),
    ]
    expect(recentModelValue(sessions, options)).toBe("zeta/a-model")
  })

  it("skips sessions without a usable model", () => {
    const sessions = [
      withModel("a", 300, { providerID: "gone", id: "model" }),
      withModel("b", 200, { providerID: "alpha", id: "m1" }),
    ]
    expect(recentModelValue(sessions, options)).toBe("alpha/m1")
  })

  it("returns undefined when no session has a usable model", () => {
    expect(recentModelValue([], options)).toBeUndefined()
    expect(recentModelValue([withModel("a", 1, undefined)], options)).toBeUndefined()
  })
})

describe("parseModel", () => {
  it("splits provider and model", () => {
    expect(parseModel("anthropic/claude-sonnet-4")).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4",
    })
  })

  it("keeps slashes inside the model id", () => {
    expect(parseModel("openrouter/anthropic/claude")).toEqual({
      providerID: "openrouter",
      modelID: "anthropic/claude",
    })
  })

  it("returns undefined without a separator", () => {
    expect(parseModel("model-only")).toBeUndefined()
  })
})
