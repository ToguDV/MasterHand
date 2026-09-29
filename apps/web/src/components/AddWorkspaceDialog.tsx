import { useState } from "react"
import { ApiError, type CreateWorkspaceInput } from "@masterhand/client-core"

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "That workspace already exists"
    if (error.status === 400) return "Enter a valid folder name (no slashes or leading dots)"
  }
  return "Could not add the workspace"
}

export function AddWorkspaceDialog({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: CreateWorkspaceInput) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ name: trimmed })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="pb-safe w-full max-w-lg space-y-3 rounded-t-2xl border border-zinc-800 bg-zinc-900 p-4 md:rounded-2xl"
      >
        <div>
          <h3 className="text-base font-semibold">Add workspace</h3>
          <p className="mt-1 text-xs text-zinc-500">
            A new folder with this name is created inside the workspaces root, isolated from the others.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-400">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="my-project"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
    </div>
  )
}
