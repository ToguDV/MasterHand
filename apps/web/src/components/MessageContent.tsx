import { memo, useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import {
  isTaskTool,
  subagentInfo,
  subagentOutput,
  toolTitle,
  type ChatMessage,
  type ChatPart,
  type ChatReasoningPart,
  type ChatTextPart,
  type ChatToolPart,
} from "@masterhand/client-core"

// Assistant output is markdown; render it as such (GFM + single newlines as
// breaks, matching what the model expects to see). Tailwind has no typography
// plugin installed, so every element is styled explicitly for the dark theme.
const markdownComponents: Components = {
  p: ({ node, ...props }) => <p className="my-2 break-words first:mt-0 last:mb-0" {...props} />,
  h1: ({ node, ...props }) => <h1 className="mt-4 mb-2 text-xl font-semibold first:mt-0" {...props} />,
  h2: ({ node, ...props }) => <h2 className="mt-4 mb-2 text-lg font-semibold first:mt-0" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mt-3 mb-1.5 text-base font-semibold first:mt-0" {...props} />,
  h4: ({ node, ...props }) => <h4 className="mt-3 mb-1.5 text-[15px] font-semibold first:mt-0" {...props} />,
  h5: ({ node, ...props }) => <h5 className="mt-3 mb-1.5 text-[15px] font-semibold first:mt-0" {...props} />,
  h6: ({ node, ...props }) => <h6 className="mt-3 mb-1.5 text-[15px] font-semibold text-zinc-400 first:mt-0" {...props} />,
  ul: ({ node, ...props }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0 [&>li:has(>input)]:list-none" {...props} />
  ),
  ol: ({ node, ...props }) => <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0" {...props} />,
  li: ({ node, ...props }) => <li className="break-words [&>p]:my-0 [&>ol]:my-1 [&>ul]:my-1" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="my-2 border-l-2 border-zinc-700 pl-3 text-zinc-400 first:mt-0 last:mb-0" {...props} />
  ),
  a: ({ node, ...props }) => (
    <a
      className="text-indigo-400 underline decoration-indigo-400/40 underline-offset-2 hover:text-indigo-300"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  code: ({ node, ...props }) => (
    <code className="rounded bg-zinc-800/80 px-1 py-0.5 font-mono text-[13px] text-zinc-100" {...props} />
  ),
  pre: ({ node, ...props }) => (
    <pre
      className="scroll-thin my-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-200 first:mt-0 last:mb-0 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit"
      {...props}
    />
  ),
  table: ({ node, ...props }) => (
    <div className="scroll-thin my-3 overflow-x-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th className="border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-left font-semibold" {...props} />
  ),
  td: ({ node, ...props }) => <td className="border border-zinc-800 px-2 py-1 align-top" {...props} />,
  hr: ({ node, ...props }) => <hr className="my-4 border-zinc-800" {...props} />,
  img: ({ node, ...props }) => <img className="my-2 max-w-full rounded-lg" {...props} />,
  input: ({ node, ...props }) => <input className="mr-1.5 accent-indigo-500" {...props} />,
}

// Memoized: streaming updates rebuild the message list on every delta, but the
// text of every other part keeps the same string value, so parsing is skipped.
const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  if (!text.trim()) return null
  return (
    <div data-testid="markdown" className="text-[15px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  )
})

function ReasoningBlock({ part }: { part: ChatReasoningPart }) {
  return (
    <details className="text-sm text-zinc-500">
      <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide">Reasoning</summary>
      <p className="mt-1 break-words whitespace-pre-wrap">{part.text}</p>
    </details>
  )
}

function statusDot(status: ChatToolPart["state"]["status"]): string {
  return status === "completed"
    ? "bg-emerald-400"
    : status === "error"
      ? "bg-red-400"
      : status === "running"
        ? "animate-pulse bg-amber-400"
        : "bg-zinc-600"
}

function ToolCall({ part }: { part: ChatToolPart }) {
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
  part: ChatToolPart
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

function PartView({
  part,
  onOpenSession,
}: {
  part: ChatPart
  onOpenSession?: (id: string) => void
}) {
  switch (part.type) {
    case "text":
      return <MarkdownText text={part.text} />
    case "reasoning":
      return <ReasoningBlock part={part} />
    case "tool":
      return isTaskTool(part) ? (
        <SubagentCall part={part} onOpenSession={onOpenSession} />
      ) : (
        <ToolCall part={part} />
      )
    default:
      return null
  }
}

export function UserBubble({ entry }: { entry: ChatMessage }) {
  const text = entry.parts
    .filter((part): part is ChatTextPart => part.type === "text")
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
  entry: ChatMessage
  onOpenSession?: (id: string) => void
}) {
  const visible = entry.parts
  const info = entry.info
  const streaming = info.time.completed === undefined
  const errorMessage = info.error ? info.error.message || "Agent error" : null

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

      {info.time.completed !== undefined && (
        <p className="text-xs text-zinc-600">
          {info.modelID}
          {(info.cost ?? 0) > 0 ? ` · $${(info.cost ?? 0).toFixed(4)}` : ""}
          {(info.tokens?.input ?? 0) > 0 ? ` · ${info.tokens?.input} in` : ""}
          {(info.tokens?.output ?? 0) > 0 ? ` · ${info.tokens?.output} out` : ""}
          {(info.tokens?.input ?? 0) > 0 || (info.tokens?.output ?? 0) > 0 ? " tok" : ""}
        </p>
      )}
    </div>
  )
}
