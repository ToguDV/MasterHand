import { useState } from "react"

export function RemoveWorkspaceDialog({
  name,
  busy,
  onConfirm,
  onClose,
}: {
  name: string
  busy: boolean
  onConfirm: (deleteFiles: boolean) => Promise<void>
  onClose: () => void
}) {
  const [deleteFiles, setDeleteFiles] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-4">
      <div className="pb-safe w-full max-w-lg space-y-3 rounded-t-2xl border border-zinc-800 bg-zinc-900 p-4 md:rounded-2xl">
        <div>
          <h3 className="text-base font-semibold">Remove workspace</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Remove <span className="font-medium text-zinc-300">{name}</span> from MasterHand. Sessions are kept.
          </p>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(event) => setDeleteFiles(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-red-500"
          />
          <span className="text-xs text-zinc-300">
            Also delete its folder and all files from disk. This cannot be undone.
          </span>
        </label>

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
            type="button"
            onClick={() => void onConfirm(deleteFiles)}
            disabled={busy}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  )
}
