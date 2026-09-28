import type { AgentInfo, ProvidersResponse, Session } from "./types"

export interface FlatModelOption {
  value: string
  label: string
  variants: string[]
}

export function selectableAgents(agents: AgentInfo[]): AgentInfo[] {
  return agents.filter((agent) => agent.mode !== "subagent" && agent.hidden !== true)
}

export function flattenModels(providers: ProvidersResponse["providers"]): FlatModelOption[] {
  const options: FlatModelOption[] = []
  for (const provider of providers) {
    for (const model of Object.values(provider.models)) {
      options.push({
        value: `${provider.id}/${model.id}`,
        label: `${provider.name} · ${model.name || model.id}`,
        variants: Object.keys(model.variants ?? {}),
      })
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label))
}

const VARIANT_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Very high",
  max: "Max",
}

export function variantLabel(key: string): string {
  const known = VARIANT_LABELS[key.toLowerCase()]
  if (known) return known
  return key.charAt(0).toUpperCase() + key.slice(1)
}

export function defaultModelValue(
  configModel: string | undefined,
  defaults: Record<string, string>,
  options: FlatModelOption[],
  preferred?: string,
): string {
  if (preferred && options.some((option) => option.value === preferred)) return preferred
  if (configModel && options.some((option) => option.value === configModel)) return configModel
  for (const [providerID, modelID] of Object.entries(defaults)) {
    const value = `${providerID}/${modelID}`
    if (options.some((option) => option.value === value)) return value
  }
  return options[0]?.value ?? ""
}

/** The model a session ran with, if it is still an available option. */
export function sessionModelValue(session: Session | undefined, options: FlatModelOption[]): string | undefined {
  const model = session?.model
  if (!model) return undefined
  const value = `${model.providerID}/${model.id}`
  return options.some((option) => option.value === value) ? value : undefined
}

/** The model used by the most recently updated session, if it is still available. */
export function recentModelValue(sessions: Session[], options: FlatModelOption[]): string | undefined {
  let best: { updated: number; value: string } | undefined
  for (const session of sessions) {
    const value = sessionModelValue(session, options)
    if (!value) continue
    const updated = session.time?.updated ?? 0
    if (!best || updated > best.updated) best = { updated, value }
  }
  return best?.value
}

export function parseModel(value: string): { providerID: string; modelID: string } | undefined {
  const index = value.indexOf("/")
  if (index === -1) return undefined
  return { providerID: value.slice(0, index), modelID: value.slice(index + 1) }
}
