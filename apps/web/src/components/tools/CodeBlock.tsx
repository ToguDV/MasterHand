import { useState } from "react"
import { looksLineNumbered, truncateLines } from "@masterhand/client-core"

/** Clipboard button with a transient "Copied" state; hidden when unavailable. */
function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const available = typeof navigator !== "undefined" && Boolean(navigator.clipboard)
  if (!available) return null
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          })
          .catch(() => {})
      }}
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
      title={label}
    >
      {copied ? "Copied" : label}
    </button>
  )
}

/**
 * Monospace block with optional line numbers, a copy action and a per-block
 * "show all" toggle. Text that already carries opencode line numbers
 * (`00001| …`) is not numbered twice.
 */
export function CodeBlock({
  text,
  title,
  maxLines = 24,
  numbered = true,
  className = "",
}: {
  text: string
  /** Small label on the top-left (file name, language…). */
  title?: string
  maxLines?: number
  numbered?: boolean
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const alreadyNumbered = looksLineNumbered(text)
  const truncated = truncateLines(text, expanded ? Number.POSITIVE_INFINITY : maxLines)
  const lines = truncated.text.split("\n")
  const showNumbers = numbered && !alreadyNumbered

  return (
    <div className={`overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 ${className}`}>
      {(title || truncated.hiddenLines > 0) && (
        <div className="flex items-center gap-2 border-b border-zinc-800/80 px-2.5 py-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-500">{title}</span>
          <CopyButton text={text} />
          {truncated.hiddenLines > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Show all ({truncated.totalLines} lines)
            </button>
          )}
        </div>
      )}
      <div className="scroll-thin max-h-80 overflow-auto">
        <pre className="min-w-full p-2.5 text-xs leading-relaxed text-zinc-300">
          <code>
            {lines.map((line, index) => (
              <span key={index} className="block whitespace-pre-wrap break-words">
                {showNumbers && (
                  <span className="mr-3 inline-block w-6 select-none text-right text-zinc-600">{index + 1}</span>
                )}
                {line || " "}
              </span>
            ))}
            {truncated.hiddenLines > 0 && (
              <span className="block pt-1 text-[10px] text-zinc-600">… {truncated.hiddenLines} more lines</span>
            )}
          </code>
        </pre>
      </div>
    </div>
  )
}

/** Copy action exported for the terminal block (command line). */
export { CopyButton }
