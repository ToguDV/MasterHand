import { useState } from "react"
import type { DiffLine } from "@masterhand/client-core"

const MAX_ROWS = 160

function rowClass(line: DiffLine): string {
  if (line.kind === "add") return "bg-emerald-500/10 text-emerald-200"
  if (line.kind === "remove") return "bg-red-500/10 text-red-200"
  if (line.text.startsWith("@@")) return "bg-zinc-800/60 text-zinc-500"
  return "text-zinc-400"
}

function sign(line: DiffLine): string {
  if (line.kind === "add") return "+"
  if (line.kind === "remove") return "−"
  if (line.text.startsWith("@@")) return " "
  return " "
}

/** Unified line diff with +/− coloring and a row cap. */
export function DiffView({ diff, className = "" }: { diff: DiffLine[]; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? diff : diff.slice(0, MAX_ROWS)
  const hidden = diff.length - rows.length

  return (
    <div className={`overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 ${className}`}>
      <div className="scroll-thin max-h-80 overflow-auto">
        <pre className="min-w-full py-1 text-xs leading-relaxed">
          <code>
            {rows.map((line, index) => (
              <span key={index} className={`flex whitespace-pre-wrap break-words px-2 ${rowClass(line)}`}>
                <span className="w-3 shrink-0 select-none opacity-70">{sign(line)}</span>
                <span className="min-w-0 flex-1">{line.text || " "}</span>
              </span>
            ))}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-1 block w-full px-2 py-0.5 text-left text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                … {hidden} more lines (show all)
              </button>
            )}
          </code>
        </pre>
      </div>
    </div>
  )
}
