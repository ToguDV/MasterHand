import type { Permission } from "@masterhand/client-core"

export function PermissionDialog({
  permission,
  busy,
  onRespond,
}: {
  permission: Permission
  busy: boolean
  onRespond: (response: "once" | "always" | "reject") => void
}) {
  const resources = permission.resources.join(", ")

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-4">
      <div className="pb-safe w-full max-w-lg rounded-t-2xl border border-zinc-800 bg-zinc-900 p-4 md:rounded-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Permission required</p>
        <h3 data-testid="permission-kind" className="mt-1 break-words text-base font-semibold">
          {permission.action}
        </h3>
        {resources && (
          <p data-testid="permission-patterns" className="mt-1 break-words text-xs text-zinc-500">
            {resources}
          </p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond("reject")}
            className="rounded-lg border border-red-500/40 bg-red-500/10 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond("always")}
            className="rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            Always
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond("once")}
            className="rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            Once
          </button>
        </div>
      </div>
    </div>
  )
}
