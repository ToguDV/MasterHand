import { Fragment, useEffect, useState, type ReactNode } from "react"
import {
  describeTool,
  formatDuration,
  looksLineNumbered,
  stripAnsi,
  type ChatToolPart,
  type ChatToolStatus,
  type ChatToolTiming,
  type ToolSummary,
} from "@masterhand/client-core"
import { accentStyle } from "./theme"
import { StatusDot } from "./StatusDot"
import { ToolIcon } from "./ToolIcon"
import { CodeBlock, CopyButton } from "./CodeBlock"
import { DiffView } from "./DiffView"
import { KeyValueList, SearchBody, TerminalBody, TodoBody } from "./ToolBodies"

/**
 * Live duration for running tools: recomputes once per second while the tool
 * runs, then freezes with the final mark. Returns `null` when timing is absent.
 */
function useLiveDuration(status: ChatToolStatus, timing?: ChatToolTiming): number | null {
  const running = status === "running" && timing?.created !== undefined && timing.completed === undefined
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  if (timing?.created === undefined) return null
  const end = timing.completed ?? (running ? Date.now() : undefined)
  return end === undefined ? null : Math.max(0, end - timing.created)
}

function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{children}</span>
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3 w-3 shrink-0 text-zinc-600 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      aria-hidden="true"
    >
      <path d="M3.5 2l3 3-3 3" />
    </svg>
  )
}

function HeaderStats({ summary, duration }: { summary: ToolSummary; duration: number | null }) {
  const badges: ReactNode[] = []
  if (summary.kind === "shell" && summary.exitCode !== null) {
    badges.push(
      <Badge
        key="exit"
        className={
          summary.exitCode === 0
            ? "bg-emerald-500/10 font-mono text-emerald-300"
            : "bg-red-500/10 font-mono text-red-300"
        }
      >
        exit {summary.exitCode}
      </Badge>,
    )
  }
  if (summary.kind === "edit" && (summary.additions > 0 || summary.deletions > 0)) {
    badges.push(
      <span key="diff" className="flex gap-1 font-mono text-[10px]">
        <span className="text-emerald-400">+{summary.additions}</span>
        <span className="text-red-400">−{summary.deletions}</span>
      </span>,
    )
  }
  if (summary.kind === "search" && summary.matches.length > 0) {
    badges.push(
      <Badge key="matches" className="bg-teal-500/10 text-teal-300">
        {summary.matches.length} matches
      </Badge>,
    )
  }
  if (summary.kind === "todo" && summary.todos.length > 0) {
    const done = summary.todos.filter((todo) => todo.status === "completed").length
    badges.push(
      <Badge key="todos" className="bg-indigo-500/10 text-indigo-300">
        {done}/{summary.todos.length}
      </Badge>,
    )
  }
  if (duration !== null && duration >= 400) {
    badges.push(
      <span key="time" className="font-mono text-[10px] text-zinc-500">
        {formatDuration(duration)}
      </span>,
    )
  }
  if (badges.length === 0) return null
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {badges.map((badge, index) => (
        <Fragment key={index}>{badge}</Fragment>
      ))}
    </span>
  )
}

function PendingBody() {
  return (
    <div className="space-y-1.5" data-testid="tool-pending">
      <span className="block h-2 w-2/3 animate-pulse rounded bg-zinc-800" />
      <span className="block h-2 w-1/3 animate-pulse rounded bg-zinc-800" />
    </div>
  )
}

function ToolBody({ summary }: { summary: ToolSummary }) {
  switch (summary.kind) {
    case "shell":
      return (
        <TerminalBody
          command={summary.command}
          cwd={summary.cwd}
          output={summary.output ? stripAnsi(summary.output) : undefined}
          running={summary.status === "running"}
          copySlot={<CopyButton text={summary.command} />}
        />
      )
    case "read":
      if (summary.content === undefined) return <p className="px-0.5 text-xs text-zinc-500">Reading…</p>
      if (summary.content === "") return <p className="px-0.5 text-xs text-zinc-500">Empty file</p>
      return (
        <div className="space-y-1.5">
          <CodeBlock
            text={summary.content}
            numbered={!looksLineNumbered(summary.content)}
            startLine={summary.startLine ?? 1}
            maxLines={28}
            className="border-zinc-800/70"
          />
          {summary.truncatedNext !== undefined && (
            <p className="px-0.5 text-[10px] text-zinc-600">
              Output truncated · continue from line {summary.truncatedNext}
            </p>
          )}
        </div>
      )
    case "write":
      return summary.content ? (
        <CodeBlock text={summary.content} maxLines={28} />
      ) : (
        <p className="px-0.5 text-xs text-zinc-500">Writing…</p>
      )
    case "edit":
      if (summary.diff.length > 0) return <DiffView diff={summary.diff} />
      return summary.output ? (
        <CodeBlock text={summary.output} numbered={false} maxLines={12} />
      ) : (
        <p className="px-0.5 text-xs text-zinc-500">Applying edit…</p>
      )
    case "search":
      return <SearchBody pattern={summary.pattern} matches={summary.matches} />
    case "web":
      return (
        <div className="space-y-2">
          {summary.url && (
            <a
              href={summary.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block truncate rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-xs text-cyan-300 hover:border-cyan-500/30 hover:text-cyan-200"
            >
              {summary.url} ↗
            </a>
          )}
          {summary.output && <CodeBlock text={summary.output} numbered={false} maxLines={20} />}
        </div>
      )
    case "todo":
      return <TodoBody todos={summary.todos} />
    case "question":
      // Fallback when no form state is available (e.g. a side-question panel):
      // a readable list of what the agent asked instead of raw JSON.
      return (
        <ul className="space-y-2">
          {summary.questions.map((question, index) => (
            <li key={index} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
              {question.header && (
                <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-300/80">
                  {question.header}
                </p>
              )}
              <p className="text-sm text-zinc-200">{question.question}</p>
              {question.options.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {question.options.map((option) => (
                    <li key={option.label} className="text-xs text-zinc-400">
                      <span className="text-zinc-300">{option.label}</span>
                      {option.description ? ` — ${option.description}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )
    default:
      return (
        <div className="space-y-2">
          <KeyValueList entries={summary.entries} />
          {summary.output && <CodeBlock text={stripAnsi(summary.output)} numbered={false} maxLines={24} />}
        </div>
      )
  }
}

/**
 * Collapsible card for every agent tool. The header carries a semantic summary
 * (command, path, diff stats, matches…) and the body renders the tool-specific
 * view; unknown tools fall back to a readable key/value list, never raw JSON.
 */
export function ToolCard({ part }: { part: ChatToolPart }) {
  const [open, setOpen] = useState(false)
  const summary = describeTool(part)
  const accent = accentStyle(summary.accent)
  const duration = useLiveDuration(summary.status, summary.timing)
  const pending = summary.status === "pending"
  const showSubtitle = summary.subtitle && summary.kind !== "edit"

  return (
    <div
      className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50"
      data-testid="tool-card"
      data-tool={summary.tool}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-900/80"
      >
        <StatusDot status={summary.status} />
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${accent.bg} ${accent.text}`}>
          <ToolIcon icon={summary.icon} className="h-3.5 w-3.5" />
        </span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">{summary.tool}</span>
        <span className={`min-w-0 flex-1 truncate text-[13px] ${pending ? "text-zinc-500" : "text-zinc-200"}`}>
          {summary.title}
        </span>
        {showSubtitle && (
          <span className="hidden max-w-[26%] truncate text-xs text-zinc-500 sm:block">{summary.subtitle}</span>
        )}
        <HeaderStats summary={summary} duration={duration} />
        <Chevron open={open} />
      </button>

      {open && (
        <div className="mh-reveal space-y-2 border-t border-zinc-800/80 px-3 py-2.5">
          {pending ? <PendingBody /> : <ToolBody summary={summary} />}
          {summary.error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
              {summary.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
