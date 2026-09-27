import { directoryName, formatRelative, type Session, type SessionStatus } from "@masterhand/client-core"

export function SessionList({
  sessions,
  statuses,
  selectedID,
  onSelect,
  onNew,
  creating,
}: {
  sessions: Session[]
  statuses: Record<string, SessionStatus>
  selectedID: string | null
  onSelect: (id: string) => void
  onNew: () => void
  creating: boolean
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-zinc-300">Sessions</h2>
        <button
          type="button"
          onClick={onNew}
          disabled={creating}
          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {creating ? "Creating…" : "+ New"}
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {sessions.length === 0 && <p className="p-4 text-sm text-zinc-500">No sessions yet.</p>}
        {sessions.map((session) => {
          const status = statuses[session.id]
          const active = session.id === selectedID
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelect(session.id)}
              className={`flex w-full flex-col gap-0.5 border-b border-zinc-900 px-3 py-2.5 text-left ${
                active ? "bg-zinc-900" : "hover:bg-zinc-900/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    status?.type === "busy" ? "animate-pulse bg-amber-400" : "bg-zinc-700"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{session.title || "Untitled"}</span>
              </span>
              <span className="pl-4 text-xs text-zinc-500">
                {directoryName(session.directory)} · {formatRelative(session.time.updated)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
