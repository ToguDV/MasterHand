/**
 * Deterministic slash-command catalog.
 *
 * opencode exposes commands as `{ name, description }` and (only for commands
 * defined in JSON config) their `template`. MasterHand derives the arguments a
 * command expects from that real data — never from generated guesses:
 *
 * - `$ARGUMENTS` -> a single free-form trailing argument.
 * - `$1`..`$N`  -> that many positional arguments.
 * - `[a|b|c]` in the description -> candidate values for the first argument.
 */

/**
 * Positional/free-form argument a slash command expects.
 *
 * Keep in sync with the `SlashCommand`/`CommandArgument` types in
 * `packages/client-core/src/types.ts` (the BFF does not depend on client-core).
 */
export interface CommandArgument {
  /** 1-based positional slot; 0 when the command accepts free-form trailing text. */
  position: number
  /** True when the command accepts arbitrary text (`$ARGUMENTS`). */
  freeForm: boolean
  /** Candidate values the command's own description declares. Never generated. */
  suggestions: string[]
}

export interface SlashCommand {
  name: string
  description?: string
  arguments: CommandArgument[]
}

interface CommandTemplateEntry {
  info?: { commands?: Record<string, { template?: unknown }> }
}

const POSITIONAL = /\$(\d+)/g
const FREE_FORM = /\$ARGUMENTS\b/
const USAGE = /\[([^[\]]*\|[^[\]]*)\]/

/** Values the command description declares between brackets, e.g. "[commit|branch|pr]". */
export function descriptionSuggestions(description: string | undefined): string[] {
  const match = description ? USAGE.exec(description) : null
  if (!match) return []
  return (match[1] ?? "")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean)
}

/** Argument hints derived from the command's own template and description. */
export function deriveCommandArguments(
  description: string | undefined,
  template: string | undefined,
): CommandArgument[] {
  const suggestions = descriptionSuggestions(description)

  if (template && FREE_FORM.test(template)) {
    return [{ position: 0, freeForm: true, suggestions }]
  }

  const positions = new Set<number>()
  if (template) {
    for (const match of template.matchAll(POSITIONAL)) positions.add(Number(match[1]))
  }
  if (positions.size > 0) {
    return [...positions]
      .sort((a, b) => a - b)
      .map((position) => ({ position, freeForm: false, suggestions: position === 1 ? suggestions : [] }))
  }

  // No template (built-in or markdown command): fall back to the usage the
  // description declares, if any. Commands with neither surface no hints.
  return suggestions.length > 0 ? [{ position: 1, freeForm: false, suggestions }] : []
}

/** Merges command templates from every config document; later documents win. */
export function mergeCommandTemplates(entries: CommandTemplateEntry[]): Map<string, string> {
  const templates = new Map<string, string>()
  for (const entry of entries) {
    const commands = entry?.info?.commands
    if (!commands) continue
    for (const [name, command] of Object.entries(commands)) {
      if (typeof command?.template === "string") templates.set(name, command.template)
    }
  }
  return templates
}
