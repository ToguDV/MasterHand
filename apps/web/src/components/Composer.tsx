import { useEffect, useMemo, useState } from "react"
import {
  ApiError,
  defaultModelValue,
  flattenModels,
  parseModel,
  selectableAgents,
  useAgents,
  useConfig,
  useProviders,
  variantLabel,
} from "@masterhand/client-core"
import { client } from "../client"

export function Composer({ sessionID, busy }: { sessionID: string; busy: boolean }) {
  const agentsQuery = useAgents(client)
  const providersQuery = useProviders(client)
  const configQuery = useConfig(client)

  const agents = useMemo(() => selectableAgents(agentsQuery.data ?? []), [agentsQuery.data])

  const modelOptions = useMemo(() => flattenModels(providersQuery.data?.providers ?? []), [providersQuery.data])

  const defaultModel = useMemo(
    () => defaultModelValue(configQuery.data?.model, providersQuery.data?.default ?? {}, modelOptions),
    [configQuery.data, providersQuery.data, modelOptions],
  )

  const [text, setText] = useState("")
  const [agent, setAgent] = useState("")
  const [model, setModel] = useState("")
  const [variant, setVariant] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const variants = useMemo(
    () => modelOptions.find((option) => option.value === model)?.variants ?? [],
    [model, modelOptions],
  )

  useEffect(() => {
    if (!agent && agents[0]) setAgent(agents[0].name)
  }, [agent, agents])

  useEffect(() => {
    if (!model && defaultModel) setModel(defaultModel)
  }, [defaultModel, model])

  useEffect(() => {
    if (variant && !variants.includes(variant)) setVariant("")
  }, [variant, variants])

  async function send() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      const modelValue = model ? parseModel(model) : undefined
      await client.api.promptAsync(sessionID, {
        parts: [{ type: "text", text: trimmed }],
        ...(agent ? { agent } : {}),
        ...(variant ? { variant } : {}),
        ...(modelValue ? { model: modelValue } : {}),
      })
      setText("")
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

  const selectClass =
    "min-w-0 flex-1 basis-32 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none focus:border-indigo-500"

  return (
    <div className="pb-safe border-t border-zinc-800 bg-zinc-950/95 px-3 pt-2 md:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-2">
        <div className="flex flex-wrap gap-2">
          <select value={agent} onChange={(event) => setAgent(event.target.value)} className={selectClass} aria-label="Agent">
            {agents.length === 0 && <option value="">agent…</option>}
            {agents.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <select value={model} onChange={(event) => setModel(event.target.value)} className={selectClass} aria-label="Model">
            {modelOptions.length === 0 && <option value="">model…</option>}
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {variants.length > 0 && (
            <select
              value={variant}
              onChange={(event) => setVariant(event.target.value)}
              className={selectClass}
              aria-label="Effort"
            >
              <option value="">Effort: default</option>
              {variants.map((key) => (
                <option key={key} value={key}>
                  Effort: {variantLabel(key)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
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

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}
