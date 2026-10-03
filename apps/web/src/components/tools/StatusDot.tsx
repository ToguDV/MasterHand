import type { ChatToolStatus } from "@masterhand/client-core"

export function statusDotClass(status: ChatToolStatus): string {
  return status === "completed"
    ? "bg-emerald-400"
    : status === "error"
      ? "bg-red-400"
      : status === "running"
        ? "animate-pulse bg-amber-400"
        : "bg-zinc-600"
}

/** Small colored dot shared by every tool card header. */
export function StatusDot({ status, className = "" }: { status: ChatToolStatus; className?: string }) {
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(status)} ${className}`} />
}
