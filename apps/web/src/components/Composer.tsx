import { useEffect, useMemo, useRef, useState } from "react"
import {
  ApiError,
  buildComposerPopover,
  collectAgentMentions,
  composerTrigger,
  defaultModelValue,
  flattenModels,
  mentionableAgents,
  parseModel,
  recentModelValue,
  selectableAgents,
  sessionModelValue,
  splitCommand,
  useAgents,
  useCommands,
  useModels,
  useSessions,
  variantLabel,
  type ComposerPopover,
  type ComposerTrigger,
} from "@masterhand/client-core"
import { client } from "../client"
import { ComposerSuggestions } from "./ComposerSuggestions"
import { SearchSelect } from "./SearchSelect"

const PREFERENCES_STORAGE_KEY = "masterhand.sessionPreferences"

interface SessionPreferences {
  agent: string
  model: string
  variant: string
}

function readPreferences(sessionID: string): Partial<SessionPreferences> {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, Partial<SessionPreferences>>) : {}
    const value = map[sessionID]
    if (!value || typeof value !== "object") return {}
    return {
      ...(typeof value.agent === "string" ? { agent: value.agent } : {}),
      ...(typeof value.model === "string" ? { model: value.model } : {}),
      ...(typeof value.variant === "string" ? { variant: value.variant } : {}),
    }
  } catch {
    return {}
  }
}

function writePreferences(sessionID: string, preferences: SessionPreferences): void {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, SessionPreferences>) : {}
    map[sessionID] = preferences
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // storage may be unavailable (private mode)
  }
}

export function Composer({
  sessionID,
  busy,
  workspaceID,
  directory = null,
  autoAccept,
  onToggleAutoAccept,
}: {
  sessionID: string
  busy: boolean
  workspaceID: string | null
  directory?: string | null
  autoAccept: boolean
  onToggleAutoAccept: (on: boolean) => void
}) {
  const agentsQuery = useAgents(client)
  const modelsQuery = useModels(client)
  const sessionsQuery = useSessions(client, true, 10_000, workspaceID)
  const commandsQuery = useCommands(client, directory)

  const agents = useMemo(() => selectableAgents(agentsQuery.data ?? []), [agentsQuery.data])
  const subagents = useMemo(() => mentionableAgents(agentsQuery.data ?? []), [agentsQuery.data])
  const commands = commandsQuery.data ?? []

  const catalog = modelsQuery.data
  const modelOptions = useMemo(
    () => flattenModels(catalog?.models ?? [], catalog?.providers ?? []),
    [catalog],
  )
  const session = sessionsQuery.data?.find((item) => item.id === sessionID)
  const defaultModel = useMemo(() => {
    const sessions = sessionsQuery.data ?? []
    const preferred = sessionModelValue(session, modelOptions) ?? recentModelValue(sessions, modelOptions)
    return defaultModelValue(catalog?.defaultModel ?? null, modelOptions, preferred)
  }, [catalog, modelOptions, sessionsQuery.data, session])

  // Per-session selections: restored on mount (the view is keyed by session)
  // and written back so switching sessions or reloading keeps them.
  const stored = useMemo(() => readPreferences(sessionID), [sessionID])
  const [text, setText] = useState("")
  const [agent, setAgent] = useState(stored.agent ?? "")
  const [model, setModel] = useState(stored.model ?? "")
  const [variant, setVariant] = useState(stored.variant ?? "")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const modelTouched = useRef(Boolean(stored.model))

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [caret, setCaret] = useState(0)
  const [caretTick, setCaretTick] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const variants = useMemo(
    () => modelOptions.find((option) => option.value === model)?.variants ?? [],
    [model, modelOptions],
  )

  useEffect(() => {
    const fallback = agents[0]
    if (!fallback) return
    if (!agent || !agents.some((item) => item.id === agent)) setAgent(fallback.id)
  }, [agent, agents])

  useEffect(() => {
    if (modelTouched.current) return
    setModel(defaultModel)
  }, [defaultModel])

  useEffect(() => {
    if (modelOptions.length === 0 || !model) return
    if (!modelOptions.some((option) => option.value === model)) {
      modelTouched.current = false
      setModel(defaultModel)
    }
  }, [model, modelOptions, defaultModel])

  useEffect(() => {
    if (!modelOptions.some((option) => option.value === model)) return
    if (variant && !variants.includes(variant)) setVariant("")
  }, [model, modelOptions, variant, variants])

  useEffect(() => {
    writePreferences(sessionID, { agent, model, variant })
  }, [sessionID, agent, model, variant])

  // The active trigger is derived from the text and caret, so it stays in sync
  // with edits and cursor moves instead of being a separate mode to maintain.
  const trigger = useMemo(
    () => (dismissed ? null : composerTrigger(text, caret)),
    [text, caret, dismissed],
  )

  const popover = useMemo<ComposerPopover | null>(
    () => (trigger ? buildComposerPopover(trigger, commands, subagents) : null),
    [trigger, commands, subagents],
  )

  useEffect(() => {
    setActiveIndex(0)
  }, [popover])

  // Programmatic edits (suggestion selection) must move the caret after React
  // commits the new value.
  useEffect(() => {
    if (caretTick === 0) return
    const position = pendingCaret.current
    if (position === null) return
    pendingCaret.current = null
    const element = textareaRef.current
    if (!element) return
    element.focus()
    element.setSelectionRange(position, position)
  }, [caretTick])

  function moveCaret(position: number): void {
    setCaret(position)
  }

  function applyReplacement(active: ComposerTrigger, replacement: string): void {
    // Collapse a space that already followed the trigger, so selecting a
    // suggestion never leaves a double space.
    const end = replacement.endsWith(" ") && text[active.end] === " " ? active.end + 1 : active.end
    const next = text.slice(0, active.start) + replacement + text.slice(end)
    const position = active.start + replacement.length
    pendingCaret.current = position
    setText(next)
    setCaret(position)
    setCaretTick((tick) => tick + 1)
    setDismissed(false)
  }

  function selectSuggestion(index: number): void {
    if (!popover || !trigger) return
    const item = popover.items[Math.min(index, popover.items.length - 1)]
    if (!item) return
    applyReplacement(trigger, item.replacement)
  }

  async function send() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      const modelValue = model ? parseModel(model, variant || undefined) : undefined
      const command = splitCommand(trimmed, commands)
      const mentionText = command ? command.text : trimmed
      const mentions = collectAgentMentions(mentionText, subagents)
      const context = {
        ...(agent ? { agent } : {}),
        ...(modelValue ? { model: modelValue } : {}),
        ...(mentions.length > 0 ? { agents: mentions } : {}),
      }
      if (command) {
        await client.api.runCommand(
          sessionID,
          { name: command.command.name, text: command.text, ...context },
          { agent: session?.agent, model: session?.model },
        )
      } else {
        await client.api.prompt(
          sessionID,
          { text: trimmed, ...context },
          { agent: session?.agent, model: session?.model },
        )
      }
      setText("")
      setCaret(0)
      setDismissed(false)
    } catch (err) {
      setError(err instanceof ApiError ? `Could not send (HTTP ${err.status})` : "Could not send")
    } finally {
      setSending(false)
    }
  }

  async function stop() {
    try {
      await client.api.abortSession(sessionID)
    } catch {
      // the state reconciles through events
    }
  }

  return (
    <div className="pb-safe border-t border-zinc-800 bg-zinc-950/95 px-3 pt-2 md:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-2">
        <div className="flex flex-wrap gap-2">
          <SearchSelect
            value={agent}
            options={agents.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setAgent}
            ariaLabel="Agent"
            placeholder="agent…"
          />
          <SearchSelect
            value={model}
            options={modelOptions.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => {
              modelTouched.current = true
              setModel(value)
            }}
            ariaLabel="Model"
            placeholder="model…"
          />
          {variants.length > 0 && (
            <SearchSelect
              value={variant}
              options={[
                { value: "", label: "Effort: default" },
                ...variants.map((key) => ({ value: key, label: `Effort: ${variantLabel(key)}` })),
              ]}
              onChange={setVariant}
              ariaLabel="Effort"
              placeholder="Effort: default"
            />
          )}
          <button
            type="button"
            aria-pressed={autoAccept}
            onClick={() => onToggleAutoAccept(!autoAccept)}
            title="Auto-accept permission requests for this session (answers “once”)"
            className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
              autoAccept
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
            }`}
          >
            {autoAccept ? "Auto-accept: on" : "Auto-accept"}
          </button>
        </div>

        <div className="relative">
          {popover && (
            <ComposerSuggestions
              id="composer-suggestions"
              title={popover.title}
              hint={popover.hint}
              items={popover.items}
              activeIndex={Math.min(activeIndex, Math.max(0, popover.items.length - 1))}
              emptyLabel={popover.emptyLabel}
              onActive={setActiveIndex}
              onSelect={selectSuggestion}
            />
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={text}
              role="combobox"
              aria-expanded={Boolean(popover)}
              aria-controls={popover ? "composer-suggestions" : undefined}
              aria-autocomplete="list"
              aria-activedescendant={
                popover && popover.items.length > 0
                  ? `composer-suggestions-${popover.items[Math.min(activeIndex, popover.items.length - 1)]?.id}`
                  : undefined
              }
              onChange={(event) => {
                setText(event.target.value)
                setCaret(event.target.selectionStart ?? event.target.value.length)
                setDismissed(false)
              }}
              onKeyDown={(event) => {
                if (popover && popover.items.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    setActiveIndex((index) => (index + 1) % popover.items.length)
                    return
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault()
                    setActiveIndex((index) => (index - 1 + popover.items.length) % popover.items.length)
                    return
                  }
                  if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
                    event.preventDefault()
                    selectSuggestion(activeIndex)
                    return
                  }
                }
                if (event.key === "Escape" && popover) {
                  event.preventDefault()
                  setDismissed(true)
                  return
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void send()
                }
              }}
              onClick={(event) => {
                setDismissed(false)
                moveCaret(event.currentTarget.selectionStart ?? 0)
              }}
              onKeyUp={(event) => {
                if (event.key !== "Escape") setDismissed(false)
                moveCaret(event.currentTarget.selectionStart ?? 0)
              }}
              rows={1}
              placeholder="Write a message…"
              className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-[15px] outline-none focus:border-indigo-500"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => void stop()}
                className="h-11 shrink-0 rounded-xl border border-red-500/40 bg-red-500/10 px-4 text-sm font-semibold text-red-300 hover:bg-red-500/20"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send()}
                disabled={!text.trim() || sending}
                className="h-11 shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
              >
                Send
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}
