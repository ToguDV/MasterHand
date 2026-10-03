import type { FormAnswer, FormField, FormInfo, FormValue } from "./types"
import type { KeyValueEntry } from "./tools"

/**
 * Pure helpers for opencode v2 forms (the primitive behind the agent's
 * `question` tool). A form blocks the turn until the user replies or cancels,
 * so the clients reconcile pending forms on reconnect and validate answers
 * locally before replying.
 */

/**
 * Reconciles locally tracked pending forms with the server snapshot for the
 * sessions the client just queried. Mirrors `reconcilePermissions`: covered
 * sessions are authoritative from the snapshot, forms of uncovered sessions
 * are kept untouched.
 */
export function reconcileForms(
  local: readonly FormInfo[],
  snapshot: readonly FormInfo[],
  coveredSessionIDs: ReadonlySet<string>,
): FormInfo[] {
  const kept = local.filter((form) => !coveredSessionIDs.has(form.sessionID))
  const keptIDs = new Set(kept.map((form) => form.id))
  return [...kept, ...snapshot.filter((form) => !keptIDs.has(form.id))]
}

/** True when the form was created by the agent's `question` tool. */
export function formIsQuestion(form: FormInfo): boolean {
  return form.metadata?.kind === "question"
}

/**
 * The tool call that created the form (`metadata.tool.id`), which matches the
 * `ChatToolPart.callID` of the `question` tool part. `null` for other forms.
 */
export function formToolCallID(form: FormInfo): string | null {
  const tool = form.metadata?.tool
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return null
  const id = (tool as Record<string, unknown>).id
  return typeof id === "string" && id.length > 0 ? id : null
}

/** Display label for a field: its title when present, else the raw key. */
export function fieldLabel(field: FormField): string {
  return ("title" in field && field.title) || field.key
}

function valuesMatch(value: FormValue | undefined, expected: unknown): boolean {
  if (Array.isArray(value)) return value.map(String).includes(String(expected))
  if (value === undefined) return false
  if (typeof value === typeof expected) return value === expected
  return String(value) === String(expected)
}

/**
 * A field is visible when it is not `hidden` and every `when` condition holds
 * against the current answers. Conditions on untouched keys are considered
 * unmet for `eq` (and met for `neq`), so dependent fields stay hidden until
 * their trigger is answered.
 */
export function isFieldVisible(field: FormField, answer: FormAnswer): boolean {
  if ("hidden" in field && field.hidden) return false
  if (!("when" in field) || !field.when || field.when.length === 0) return true
  return field.when.every((condition) => {
    const matches = valuesMatch(answer[condition.key], condition.value)
    return condition.op === "eq" ? matches : !matches
  })
}

/** Initial answer: declared defaults, plus `false` for booleans. */
export function defaultAnswer(form: FormInfo): FormAnswer {
  const answer: FormAnswer = {}
  for (const field of form.fields) {
    if (!isFieldVisible(field, answer)) continue
    switch (field.type) {
      case "string":
        if (field.default !== undefined) answer[field.key] = field.default
        break
      case "number":
      case "integer":
        if (typeof field.default === "number") answer[field.key] = field.default
        break
      case "boolean":
        answer[field.key] = field.default ?? false
        break
      case "multiselect":
        if (field.default) answer[field.key] = [...field.default]
        break
      default:
        break
    }
  }
  return answer
}

function isEmpty(field: FormField, value: FormValue | undefined): boolean {
  switch (field.type) {
    case "boolean":
      return false
    case "multiselect":
      return !Array.isArray(value) || value.length === 0
    case "number":
    case "integer":
      return typeof value !== "number" || !Number.isFinite(value)
    default:
      return typeof value !== "string" || value.trim().length === 0
  }
}

/**
 * Validates visible fields against their constraints. Returns a map of
 * `key -> message`; an empty object means the answer can be submitted.
 */
export function validateForm(form: FormInfo, answer: FormAnswer): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of form.fields) {
    if (!isFieldVisible(field, answer)) continue
    const value = answer[field.key]
    if (field.type === "external") continue
    if ("required" in field && field.required && isEmpty(field, value)) {
      errors[field.key] = "This field is required"
      continue
    }
    if (isEmpty(field, value) && value === undefined) continue

    if (field.type === "string") {
      const text = typeof value === "string" ? value : ""
      if (field.minLength !== undefined && text.length < field.minLength) {
        errors[field.key] = `At least ${field.minLength} characters`
      } else if (field.maxLength !== undefined && text.length > field.maxLength) {
        errors[field.key] = `At most ${field.maxLength} characters`
      } else if (field.pattern) {
        try {
          if (!new RegExp(field.pattern).test(text)) errors[field.key] = `Must match ${field.pattern}`
        } catch {
          // An invalid pattern coming from the agent is not the user's problem.
        }
      }
    } else if (field.type === "number" || field.type === "integer") {
      const number = typeof value === "number" ? value : Number(value)
      if (Number.isFinite(number)) {
        const minimum = typeof field.minimum === "number" ? field.minimum : null
        const maximum = typeof field.maximum === "number" ? field.maximum : null
        if (minimum !== null && number < minimum) errors[field.key] = `Must be at least ${minimum}`
        else if (maximum !== null && number > maximum) errors[field.key] = `Must be at most ${maximum}`
      }
    } else if (field.type === "multiselect") {
      const selected = Array.isArray(value) ? value : []
      if (field.minItems !== undefined && selected.length < field.minItems) {
        errors[field.key] = `Select at least ${field.minItems}`
      } else if (field.maxItems !== undefined && selected.length > field.maxItems) {
        errors[field.key] = `Select at most ${field.maxItems}`
      }
    }
  }
  return errors
}

/** Coerces the UI state into the typed payload the reply endpoint expects. */
export function toFormAnswer(form: FormInfo, answer: FormAnswer): FormAnswer {
  const result: FormAnswer = {}
  for (const field of form.fields) {
    if (!isFieldVisible(field, answer)) continue
    const value = answer[field.key]
    switch (field.type) {
      case "external":
        break
      case "boolean":
        result[field.key] = typeof value === "boolean" ? value : false
        break
      case "multiselect":
        result[field.key] = Array.isArray(value) ? value.map(String) : []
        break
      case "number":
      case "integer": {
        const number = typeof value === "number" ? value : Number(value)
        if (Number.isFinite(number)) result[field.key] = number
        break
      }
      default:
        if (typeof value === "string") result[field.key] = value
        else if (value !== undefined) result[field.key] = String(value)
    }
  }
  return result
}

/** Human string for an answered value (used by the read-only answered card). */
export function formatAnswerValue(value: FormValue | undefined): string {
  if (value === undefined || value === null) return "—"
  if (Array.isArray(value)) return value.map(String).join(", ")
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return String(value)
}

/** `key/label -> formatted answer` rows for the fields of an answered form. */
export function describeFormAnswer(form: FormInfo, answer: FormAnswer): KeyValueEntry[] {
  return form.fields
    .filter((field) => !("hidden" in field && field.hidden))
    .map((field) => ({ key: fieldLabel(field), value: formatAnswerValue(answer[field.key]) }))
}
