import { describe, expect, it } from "vitest"
import { defaultModelValue, flattenModels, parseModel, selectableAgents, variantLabel } from "../src/models"
import type { AgentInfo, ProvidersResponse } from "../src/types"

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
