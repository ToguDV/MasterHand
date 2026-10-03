import { useState } from "react"
import {
  defaultAnswer,
  describeFormAnswer,
  fieldLabel,
  formIsQuestion,
  formToolCallID,
  isFieldVisible,
  toFormAnswer,
  validateForm,
  type ChatToolPart,
  type FormAnswer,
  type FormField,
  type FormInfo,
  type FormValue,
} from "@masterhand/client-core"
import { StatusDot } from "./tools/StatusDot"

/**
 * Inline card for the agent's `question` tool. While the form is pending it
 * renders the fields and replies with the typed answer; once answered (here or
 * on another device) it collapses into a read-only summary.
 */
export function QuestionCard({
  part,
  forms,
  answeredForms,
  busyFormID,
  onRespond,
  onCancel,
}: {
  part: ChatToolPart
  forms: FormInfo[]
  answeredForms: Array<{ form: FormInfo; answer: FormAnswer }>
  busyFormID: string | null
  onRespond: (form: FormInfo, answer: FormAnswer) => void
  onCancel: (form: FormInfo) => void
}) {
  const byCall = forms.find((form) => formToolCallID(form) === part.callID)
  const sameSession = forms.filter((form) => form.sessionID === part.sessionID && formIsQuestion(form))
  const form = byCall ?? (sameSession.length === 1 ? sameSession[0]! : null) ?? null

  if (form) {
    return <QuestionForm key={form.id} form={form} busy={busyFormID === form.id} onRespond={onRespond} onCancel={onCancel} />
  }

  const answered = answeredForms.find((entry) => formToolCallID(entry.form) === part.callID)
  return <AnsweredCard part={part} answered={answered ?? null} />
}

function QuestionForm({
  form,
  busy,
  onRespond,
  onCancel,
}: {
  form: FormInfo
  busy: boolean
  onRespond: (form: FormInfo, answer: FormAnswer) => void
  onCancel: (form: FormInfo) => void
}) {
  const [answer, setAnswer] = useState<FormAnswer>(() => defaultAnswer(form))
  const [submitted, setSubmitted] = useState(false)
  const errors = validateForm(form, answer)
  const valid = Object.keys(errors).length === 0

  function update(key: string, value: FormValue): void {
    setAnswer((previous) => ({ ...previous, [key]: value }))
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-indigo-500/40 bg-indigo-500/[0.06]"
      data-testid="question-card"
    >
      <div className="flex items-center gap-2 border-b border-indigo-500/20 px-3 py-2">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-50 motion-reduce:animate-none" />
          <span className="relative h-2 w-2 rounded-full bg-indigo-400" />
        </span>
        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
          Question
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
          {form.title || "The agent needs input"}
        </span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (valid) onRespond(form, toFormAnswer(form, answer))
        }}
        className="space-y-4 px-3 py-3"
      >
        {form.fields
          .filter((field) => isFieldVisible(field, answer))
          .map((field) => (
            <Field
              key={field.key}
              field={field}
              value={answer[field.key]}
              error={submitted ? errors[field.key] : undefined}
              onChange={(value) => update(field.key, value)}
            />
          ))}

        <div className="flex items-center gap-2 pt-0.5">
          <span className="flex-1 text-[11px] text-indigo-300/60">The agent is waiting for this answer.</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(form)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 disabled:opacity-50"
          >
            Dismiss
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Answer"}
          </button>
        </div>
      </form>
    </div>
  )
}

function AnsweredCard({
  part,
  answered,
}: {
  part: ChatToolPart
  answered: { form: FormInfo; answer: FormAnswer } | null
}) {
  const rows = answered ? describeFormAnswer(answered.form, answered.answer) : []
  const title = answered?.form.title || "Question"
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50" data-testid="question-answered">
      <div className="flex items-center gap-2 px-3 py-2">
        <StatusDot status={part.state.status} />
        <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300/80">
          Question
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-300">{title}</span>
        <span className="shrink-0 text-[11px] text-zinc-500">
          {part.state.status === "error" ? "Cancelled" : "Answered"}
        </span>
      </div>
      {rows.length > 0 ? (
        <dl className="space-y-1 border-t border-zinc-800/80 px-3 py-2">
          {rows.map((row) => (
            <div key={row.key} className="flex gap-2 text-xs">
              <dt className="w-32 shrink-0 truncate text-zinc-500" title={row.key}>
                {row.key}
              </dt>
              <dd className="min-w-0 flex-1 break-words text-zinc-300">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : part.state.output ? (
        <p className="border-t border-zinc-800/80 px-3 py-2 text-xs whitespace-pre-wrap text-zinc-400">
          {part.state.output}
        </p>
      ) : null}
    </div>
  )
}

function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField
  value: FormValue | undefined
  error?: string
  onChange: (value: FormValue) => void
}) {
  if (field.type === "boolean") {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200">{fieldLabel(field)}</p>
          {field.description && <p className="mt-0.5 text-xs text-zinc-500">{field.description}</p>}
        </div>
        <BooleanToggle checked={Boolean(value)} onChange={onChange} />
      </div>
    )
  }

  if (field.type === "external") {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-200">{fieldLabel(field)}</p>
        {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
        <a
          href={field.url}
          target="_blank"
          rel="noreferrer noopener"
          className="block truncate rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-xs text-cyan-300 hover:text-cyan-200"
        >
          {field.url} ↗
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-200">
        {fieldLabel(field)}
        {"required" in field && field.required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {field.description && <p className="-mt-1 text-xs text-zinc-500">{field.description}</p>}
      <FieldInput field={field} value={value} onChange={onChange} />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Exclude<FormField, { type: "boolean" } | { type: "external" }>
  value: FormValue | undefined
  onChange: (value: FormValue) => void
}) {
  if (field.type === "multiselect") return <MultiInput field={field} value={value} onChange={onChange} />
  if (field.type === "number" || field.type === "integer") {
    return <NumberInput field={field} value={value} onChange={onChange} />
  }
  return <StringInput field={field} value={value} onChange={onChange} />
}

const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/70 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/60 focus:outline-none"

const OPTION_CLASS = (active: boolean): string =>
  `flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
    active ? "border-indigo-500/50 bg-indigo-500/10" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
  }`

function StringInput({
  field,
  value,
  onChange,
}: {
  field: Extract<FormField, { type: "string" }>
  value: FormValue | undefined
  onChange: (value: FormValue) => void
}) {
  const [other, setOther] = useState(false)
  const text = typeof value === "string" ? value : ""
  const options = field.options ?? []

  if (options.length > 0) {
    return (
      <div role="radiogroup" className="space-y-1.5">
        {options.map((option) => {
          const active = !other && text === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setOther(false)
                onChange(option.value)
              }}
              className={OPTION_CLASS(active)}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  active ? "border-indigo-400" : "border-zinc-600"
                }`}
                aria-hidden="true"
              >
                {active && <span className="h-2 w-2 rounded-full bg-indigo-400" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm text-zinc-200">{option.label}</span>
                {option.description && <span className="mt-0.5 block text-xs text-zinc-500">{option.description}</span>}
              </span>
            </button>
          )
        })}
        {field.custom && (
          <button
            type="button"
            role="radio"
            aria-checked={other}
            onClick={() => {
              setOther(true)
              onChange("")
            }}
            className={OPTION_CLASS(other)}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                other ? "border-indigo-400" : "border-zinc-600"
              }`}
              aria-hidden="true"
            >
              {other && <span className="h-2 w-2 rounded-full bg-indigo-400" />}
            </span>
            <span className="text-sm text-zinc-200">Other…</span>
          </button>
        )}
        {other && (
          <input
            autoFocus
            value={text}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Type your answer"
            aria-label={fieldLabel(field)}
            className={INPUT_CLASS}
          />
        )}
      </div>
    )
  }

  return (
    <input
      type={inputType(field.format)}
      value={text}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
      aria-label={fieldLabel(field)}
      className={INPUT_CLASS}
    />
  )
}

function inputType(format: string | undefined): string {
  if (format === "email") return "email"
  if (format === "uri") return "url"
  if (format === "date") return "date"
  if (format === "date-time") return "datetime-local"
  return "text"
}

function NumberInput({
  field,
  value,
  onChange,
}: {
  field: Extract<FormField, { type: "number" | "integer" }>
  value: FormValue | undefined
  onChange: (value: FormValue) => void
}) {
  const minimum = typeof field.minimum === "number" ? field.minimum : undefined
  const maximum = typeof field.maximum === "number" ? field.maximum : undefined
  return (
    <input
      type="number"
      value={typeof value === "number" ? String(value) : ""}
      min={minimum}
      max={maximum}
      step={field.type === "integer" ? 1 : "any"}
      onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
      aria-label={fieldLabel(field)}
      className={INPUT_CLASS}
    />
  )
}

function MultiInput({
  field,
  value,
  onChange,
}: {
  field: Extract<FormField, { type: "multiselect" }>
  value: FormValue | undefined
  onChange: (value: FormValue) => void
}) {
  const selected = Array.isArray(value) ? value : []
  const [draft, setDraft] = useState("")
  const custom = selected.filter((item) => !field.options.some((option) => option.value === item))

  function toggle(option: string): void {
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option])
  }

  return (
    <div className="space-y-1.5">
      {field.options.map((option) => {
        const active = selected.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() => toggle(option.value)}
            className={OPTION_CLASS(active)}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${
                active ? "border-indigo-400 bg-indigo-500/20 text-indigo-200" : "border-zinc-600 text-transparent"
              }`}
              aria-hidden="true"
            >
              ✓
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm text-zinc-200">{option.label}</span>
              {option.description && <span className="mt-0.5 block text-xs text-zinc-500">{option.description}</span>}
            </span>
          </button>
        )
      })}
      {custom.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {custom.map((item) => (
            <span
              key={item}
              className="flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-200"
            >
              {item}
              <button type="button" onClick={() => toggle(item)} className="text-indigo-300/70 hover:text-indigo-100">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {field.custom && (
        <div className="flex gap-1.5">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              if (draft.trim()) {
                toggle(draft.trim())
                setDraft("")
              }
            }}
            placeholder="Add your own"
            aria-label={`Add ${fieldLabel(field)}`}
            className={INPUT_CLASS}
          />
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={() => {
              toggle(draft.trim())
              setDraft("")
            }}
            className="shrink-0 rounded-lg border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}

function BooleanToggle({ checked, onChange }: { checked: boolean; onChange: (value: FormValue) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-indigo-600" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4.5" : "translate-x-0.5"
        }`}
      />
    </button>
  )
}
