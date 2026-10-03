import type { ReactNode } from "react"
import type { ToolIcon as ToolIconName } from "@masterhand/client-core"

const paths: Record<ToolIconName, ReactNode> = {
  terminal: (
    <>
      <path d="M3 4.5l3 3-3 3" />
      <path d="M7.5 10.5H11" />
    </>
  ),
  file: (
    <>
      <path d="M4 2.5h3.5L10 5v6.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
      <path d="M7.5 2.5V5H10" />
    </>
  ),
  pencil: (
    <>
      <path d="M3 11.5l6.8-6.8 1.5 1.5-6.8 6.8H3v-1.5z" />
      <path d="M9.8 4.7l1.5 1.5" />
    </>
  ),
  diff: (
    <>
      <path d="M4.5 3v5.5" />
      <path d="M2 5.75h5" />
      <path d="M8.5 10.5h3.5" />
    </>
  ),
  search: (
    <>
      <circle cx="6.4" cy="6.4" r="3.4" />
      <path d="M9 9l2.5 2.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M2.5 7h9" />
      <path d="M7 2.5c1.1 1.2 1.7 2.7 1.7 4.5S8.1 10.3 7 11.5C5.9 10.3 5.3 8.8 5.3 7S5.9 3.7 7 2.5z" />
    </>
  ),
  checklist: (
    <>
      <rect x="2.5" y="2.5" width="9" height="9" rx="1.5" />
      <path d="M4.8 7l1.5 1.5L9.2 5.6" />
    </>
  ),
  question: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M5.7 5.6a1.4 1.4 0 1 1 2 1.3c-.4.2-.7.5-.7 1" />
      <path d="M7 9.9h.01" />
    </>
  ),
  tool: (
    <>
      <rect x="2.5" y="4.5" width="9" height="6.5" rx="1.5" />
      <path d="M2.5 7h9" />
      <path d="M5.5 4.5V3.2a.7.7 0 0 1 .7-.7h1.6a.7.7 0 0 1 .7.7v1.3" />
    </>
  ),
}

export function ToolIcon({ icon, className = "" }: { icon: ToolIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[icon]}
    </svg>
  )
}
