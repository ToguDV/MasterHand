import { useState } from "react"
import {
  directoryName,
  filterSessions,
  formatRelative,
  rootSessions,
  type Session,
  type SessionFilter,
  type SessionStatus,
} from "@masterhand/client-core"

const FILTERS: Array<{ value: SessionFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "isolated", label: "Isolated" },
  { value: "standard", label: "Standard" },
]

/** Sessions rendered at once; more load on demand (no virtualization). */
const SESSION_PAGE_SIZE = 100

export function SessionList({
  sessions,
  statuses,
  selectedID,
  onSelect,
  onNew,
  onDelete,
  creating,
  canCreate,
}: {
  sessions: Session[]
  statuses: Record<string, SessionStatus>
  selectedID: string | null
  onSelect: (id: string) => void
  onNew: (isolated: boolean) => void
  onDelete: (id: string) => void
  creating: boolean
  canCreate: boolean
}) {
  const [filter, setFilter] = useState<SessionFilter>("all")
  const [isolated, setIsolated] = useState(false)
  const [visibleCount, setVisibleCount] = useState(SESSION_PAGE_SIZE)
  // Subagent children are reachable from their parent's card, not the list.
  const visible = filterSessions(rootSessions(sessions), filter)
  const shown = visible.slice(0, visibleCount)
  const remaining = visible.length - shown.length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-zinc-300">Sessions</h2>
        <div className="flex items-center gap-2">
          <label
            className="flex cursor-pointer items-center gap-1 text-[10px] text-zinc-400"
            title="Create the session in its own git worktree"
          >
            <input
              type="checkbox"
              checked={isolated}
              onChange={(event) => setIsolated(event.target.checked)}
              className="h-3 w-3 accent-indigo-500"
            />
            Isolated
          </label>
          <button
            type="button"
            onClick={() => onNew(isolated)}
            disabled={creating || !canCreate}
            title={canCreate ? undefined : "Add a workspace first"}
            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {creating ? "Creating…" : "+ New"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-1.5">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              filter === option.value
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <p className="p-4 text-sm text-zinc-500">
            {canCreate
              ? filter === "all"
                ? "No sessions yet."
                : "No sessions match this filter."
              : "Add a workspace to start working on a project."}
          </p>
        )}
        {shown.map((session) => {
          const status = statuses[session.id]
          const active = session.id === selectedID
          return (
            <div
              key={session.id}
              className={`flex items-stretch border-b border-zinc-900 ${active ? "bg-zinc-900" : "hover:bg-zinc-900/60"}`}
            >
              <button
                type="button"
                onClick={() => onSelect(session.id)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5 text-left"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      status?.type === "busy" ? "animate-pulse bg-amber-400" : "bg-zinc-700"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{session.title || "Untitled"}</span>
                  {session.isolation && (
                    <span
                      className="max-w-[9rem] shrink-0 truncate rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300"
                      title={session.isolation.branch}
                    >
                      {session.isolation.branch}
                    </span>
                  )}
                </span>
                <span className="pl-4 text-xs text-zinc-500">
                  {directoryName(session.location.directory)} · {formatRelative(session.time.updated)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(session.id)}
                aria-label={`Delete ${session.title || "session"}`}
                title="Delete session"
                className="shrink-0 px-3 text-zinc-600 hover:text-red-400"
              >
                ×
              </button>
            </div>
          )
        })}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + SESSION_PAGE_SIZE)}
            className="w-full border-b border-zinc-900 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200"
          >
            Show {Math.min(SESSION_PAGE_SIZE, remaining)} more ({remaining} hidden)
          </button>
        )}
      </div>
    </div>
  )
}
