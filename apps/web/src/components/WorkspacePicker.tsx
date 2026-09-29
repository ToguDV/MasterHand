import type { WorkspaceRecord } from "@masterhand/client-core"

export function WorkspacePicker({
  workspaces,
  selectedID,
  onSelect,
  onAdd,
  onDelete,
}: {
  workspaces: WorkspaceRecord[]
  selectedID: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onDelete: (id: string) => void
}) {
  const selected = workspaces.find((workspace) => workspace.id === selectedID) ?? null

  return (
    <div className="space-y-1.5 border-b border-zinc-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <select
          aria-label="Workspace"
          value={selectedID ?? ""}
          onChange={(event) => onSelect(event.target.value || null)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-indigo-500"
        >
          {workspaces.length === 0 && <option value="">No workspaces</option>}
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add workspace"
          title="Add workspace"
          className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-sm leading-none text-zinc-200 hover:bg-zinc-700"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => selectedID && onDelete(selectedID)}
          disabled={!selectedID}
          aria-label="Remove workspace"
          title="Remove workspace"
          className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-sm leading-none text-zinc-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
        >
          −
        </button>
      </div>
      {selected && (
        <p className="truncate text-[10px] text-zinc-600" title={selected.path}>
          {selected.path}
        </p>
      )}
    </div>
  )
}
