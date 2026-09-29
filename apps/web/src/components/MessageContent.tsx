import { useState } from "react"
import {
  isTaskTool,
  splitFences,
  subagentInfo,
  subagentOutput,
  toolTitle,
  type MessageWithParts,
  type ReasoningPart,
  type SubtaskPart,
  type TextPart,
  type ToolPart,
} from "@masterhand/client-core"

function MarkdownText({ text }: { text: string }) {
  const segments = splitFences(text)
  return (
    <div className="space-y-2 text-[15px] leading-relaxed">
      {segments.map((segment, index) =>
        segment.type === "code" ? (
          <pre
            key={index}
            className="scroll-thin overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed"
          >
            <code>{segment.content}</code>
          </pre>
        ) : (
          <p key={index} className="break-words whitespace-pre-wrap">
            {segment.content.trimEnd()}
          </p>
        ),
      )}
    </div>
  )
}

function ReasoningBlock({ part }: { part: ReasoningPart }) {
  return (
    <details className="text-sm text-zinc-500">
      <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide">Reasoning</summary>
      <p className="mt-1 break-words whitespace-pre-wrap">{part.text}</p>
    </details>
  )
}

function statusDot(status: ToolPart["state"]["status"]): string {
  return status === "completed"
    ? "bg-emerald-400"
    : status === "error"
      ? "bg-red-400"
      : status === "running"
        ? "animate-pulse bg-amber-400"
        : "bg-zinc-600"
}

function ToolCall({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false)
  const state = part.state
  const dot = statusDot(state.status)

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="shrink-0 font-mono text-xs text-zinc-400">{part.tool}</span>
        <span className="min-w-0 flex-1 truncate text-zinc-300">{toolTitle(part)}</span>
        <span className="shrink-0 text-xs text-zinc-500">{state.status}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-800 px-3 py-2">
          <pre className="scroll-thin overflow-x-auto text-xs text-zinc-400">{JSON.stringify(state.input, null, 2)}</pre>
          {state.status === "completed" && state.output && (
            <pre className="scroll-thin max-h-60 overflow-auto whitespace-pre-wrap border-t border-zinc-800 pt-2 text-xs text-zinc-300">
              {state.output}
            </pre>
          )}
          {state.status === "error" && <p className="text-xs text-red-400">{state.error}</p>}
        </div>
      )}
    </div>
  )
}

function SubagentCall({
  part,
  onOpenSession,
}: {
  part: ToolPart
  onOpenSession?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const state = part.state
  const info = subagentInfo(part)
  const output = subagentOutput(part)

  return (
    <div className="overflow-hidden rounded-lg border border-indigo-500/30 bg-indigo-500/5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(state.status)}`} />
        <span className="shrink-0 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
          Subagent
        </span>
        <span className="shrink-0 font-mono text-xs text-indigo-200">{info.name}</span>
        <span className="min-w-0 flex-1 truncate text-zinc-300">{info.description}</span>
        {info.background && (
          <span className="shrink-0 rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-300">background</span>
        )}
        <span className="shrink-0 text-xs text-zinc-500">{state.status}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-indigo-500/20 px-3 py-2">
          {info.prompt && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Prompt</p>
              <pre className="scroll-thin max-h-60 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">
                {info.prompt}
              </pre>
            </div>
          )}
          {output && (
            <div className="border-t border-indigo-500/20 pt-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Result</p>
              <pre className="scroll-thin max-h-60 overflow-auto whitespace-pre-wrap text-xs text-zinc-300">
                {output}
              </pre>
            </div>
          )}
          {state.status === "error" && <p className="text-xs text-red-400">{state.error}</p>}
        </div>
      )}

      {info.sessionID && onOpenSession && (
        <div className="border-t border-indigo-500/20 px-3 py-1.5">
          <button
            type="button"
            onClick={() => onOpenSession(info.sessionID!)}
            className="text-xs font-medium text-indigo-300 hover:text-indigo-200"
          >
            Open session →
          </button>
        </div>
      )}
    </div>
  )
}

function SubtaskCall({ part }: { part: SubtaskPart }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-lg border border-indigo-500/30 bg-indigo-500/5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <span className="shrink-0 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
          Subagent
        </span>
        <span className="shrink-0 font-mono text-xs text-indigo-200">{part.agent}</span>
        <span className="min-w-0 flex-1 truncate text-zinc-300">{part.description}</span>
      </button>
      {open && (
        <div className="border-t border-indigo-500/20 px-3 py-2">
          <pre className="scroll-thin max-h-60 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">
            {part.prompt}
          </pre>
        </div>
      )}
    </div>
  )
}

function PartView({
  part,
  onOpenSession,
}: {
  part: MessageWithParts["parts"][number]
  onOpenSession?: (id: string) => void
}) {
  switch (part.type) {
    case "text":
      return <MarkdownText text={(part as TextPart).text} />
    case "reasoning":
      return <ReasoningBlock part={part as ReasoningPart} />
    case "tool":
      return isTaskTool(part) ? (
        <SubagentCall part={part} onOpenSession={onOpenSession} />
      ) : (
        <ToolCall part={part as ToolPart} />
      )
    case "subtask":
      return <SubtaskCall part={part as SubtaskPart} />
    default:
      return null
  }
}

export function UserBubble({ entry }: { entry: MessageWithParts }) {
  const text = entry.parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
  if (!text.trim()) return null
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] break-words whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600/20 px-3.5 py-2.5 text-[15px] leading-relaxed">
        {text}
      </div>
    </div>
  )
}

export function AssistantBlock({
  entry,
  onOpenSession,
}: {
  entry: MessageWithParts
  onOpenSession?: (id: string) => void
}) {
  const visible = entry.parts.filter((part) => part.type !== "step-start" && part.type !== "step-finish")
  const info = entry.info
  const streaming = info.role === "assistant" && info.time.completed === undefined
  const assistant = info.role === "assistant" ? info : null
  const errorMessage = assistant?.error
    ? String((assistant.error as { data?: { message?: string } }).data?.message ?? "Agent error")
    : null

  return (
    <div className="flex flex-col gap-2">
      {visible.map((part) => (
        <PartView key={part.id} part={part} onOpenSession={onOpenSession} />
      ))}

      {streaming && visible.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" /> Thinking…
        </p>
      )}

      {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}

      {assistant && assistant.time.completed !== undefined && (
        <p className="text-xs text-zinc-600">
          {assistant.modelID}
          {assistant.cost > 0 ? ` · $${assistant.cost.toFixed(4)}` : ""}
          {assistant.tokens.output > 0 ? ` · ${assistant.tokens.output} tok` : ""}
        </p>
      )}
    </div>
  )
}
