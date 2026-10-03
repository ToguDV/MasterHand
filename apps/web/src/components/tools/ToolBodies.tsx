import { Fragment, useState, type ReactNode } from "react"
import { truncateLines, type TodoItem } from "@masterhand/client-core"

/** Fallback body for unknown tools: readable key/value rows instead of raw JSON. */
export function KeyValueList({ entries }: { entries: Array<{ key: string; value: string }> }) {
  if (entries.length === 0) return null
  return (
    <dl className="scroll-thin max-h-72 space-y-1.5 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
      {entries.map((entry) => (
        <div key={entry.key} className="flex gap-2 text-xs">
          <dt className="w-28 shrink-0 truncate font-mono text-zinc-500" title={entry.key}>
            {entry.key}
          </dt>
          <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-zinc-300">{entry.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Terminal-style block: the command line, its working directory and the output. */
export function TerminalBody({
  command,
  cwd,
  output,
  running,
  copySlot,
}: {
  command: string
  cwd?: string
  output?: string
  running: boolean
  copySlot?: ReactNode
}) {
  const cleaned = output ?? ""
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/15 bg-black/50 px-2.5 py-1.5">
        <span className="select-none font-mono text-xs leading-5 text-emerald-400">$</span>
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-zinc-100">
          {command}
        </code>
        {copySlot}
      </div>
      {cwd && <p className="px-0.5 font-mono text-[10px] text-zinc-600">{cwd}</p>}
      {cleaned ? (
        <TerminalOutput text={cleaned} />
      ) : running ? (
        <p className="px-0.5 text-xs text-zinc-500">Running…</p>
      ) : null}
    </div>
  )
}

function TerminalOutput({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const truncated = truncateLines(text, expanded ? Number.POSITIVE_INFINITY : 30)
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black/60">
      <pre className="scroll-thin max-h-80 overflow-auto p-2.5 font-mono text-xs leading-relaxed text-zinc-300">
        <code className="whitespace-pre-wrap break-words">{truncated.text}</code>
      </pre>
      {truncated.hiddenLines > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="block w-full border-t border-zinc-800/80 px-2.5 py-1 text-left text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          … {truncated.hiddenLines} more lines (show all)
        </button>
      )}
    </div>
  )
}

/** Highlights every occurrence of `pattern` inside a search result line. */
function Highlight({ text, pattern }: { text: string; pattern: string }) {
  if (!pattern) return <>{text}</>
  let regex: RegExp
  try {
    regex = new RegExp(pattern, "gi")
  } catch {
    return <>{text}</>
  }
  const parts = text.split(regex)
  const matches = text.match(regex) ?? []
  if (matches.length === 0) return <>{text}</>
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < matches.length && (
            <span className="rounded bg-teal-500/20 px-0.5 text-teal-200">{matches[index]}</span>
          )}
        </Fragment>
      ))}
    </>
  )
}

/** Search results: one monospace line per match, pattern highlighted. */
export function SearchBody({ pattern, matches }: { pattern: string; matches: string[] }) {
  const [expanded, setExpanded] = useState(false)
  if (matches.length === 0) return <p className="px-0.5 text-xs text-zinc-500">No matches</p>
  const shown = expanded ? matches : matches.slice(0, 40)
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/60">
      <div className="scroll-thin max-h-72 overflow-auto py-1">
        {shown.map((line, index) => (
          <p
            key={index}
            title={line}
            className="truncate whitespace-pre px-2.5 py-0.5 font-mono text-xs text-zinc-300 hover:bg-zinc-900/60"
          >
            <Highlight text={line} pattern={pattern} />
          </p>
        ))}
      </div>
      {matches.length > shown.length && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="block w-full border-t border-zinc-800/80 px-2.5 py-1 text-left text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          … {matches.length - shown.length} more matches (show all)
        </button>
      )}
    </div>
  )
}

const TODO_STYLES: Record<string, { icon: string; className: string }> = {
  completed: { icon: "✓", className: "text-emerald-400" },
  in_progress: { icon: "▸", className: "text-amber-300" },
  cancelled: { icon: "✕", className: "text-zinc-600" },
  pending: { icon: "○", className: "text-zinc-500" },
}

/** Checklist for the todo tool. */
export function TodoBody({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return null
  return (
    <ul className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
      {todos.map((todo, index) => {
        const style = TODO_STYLES[todo.status] ?? TODO_STYLES.pending!
        return (
          <li key={index} className="flex items-start gap-2 text-xs">
            <span className={`shrink-0 font-mono ${style.className}`}>{style.icon}</span>
            <span className={todo.status === "completed" ? "text-zinc-500 line-through" : "text-zinc-300"}>
              {todo.content}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
