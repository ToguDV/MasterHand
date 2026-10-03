import type { ChatToolStatus, ToolAccent, ToolIcon } from "@masterhand/client-core"
import { colors } from "../../theme"

/** Semantic accent colors (text + translucent chip background) per tool family. */
export const toolAccents: Record<ToolAccent, { text: string; bg: string }> = {
  emerald: { text: "#6ee7b7", bg: "rgba(16, 185, 129, 0.12)" },
  amber: { text: "#fcd34d", bg: "rgba(245, 158, 11, 0.12)" },
  sky: { text: "#7dd3fc", bg: "rgba(14, 165, 233, 0.12)" },
  violet: { text: "#c4b5fd", bg: "rgba(139, 92, 246, 0.12)" },
  cyan: { text: "#67e8f9", bg: "rgba(6, 182, 212, 0.12)" },
  teal: { text: "#5eead4", bg: "rgba(20, 184, 166, 0.12)" },
  indigo: { text: "#a5b4fc", bg: "rgba(99, 102, 241, 0.12)" },
  zinc: { text: "#a1a1aa", bg: "rgba(113, 113, 122, 0.12)" },
}

export function toolAccent(accent: ToolAccent): { text: string; bg: string } {
  return toolAccents[accent] ?? toolAccents.zinc
}

export function statusColor(status: ChatToolStatus): string {
  return status === "completed"
    ? colors.success
    : status === "error"
      ? colors.danger
      : status === "running"
        ? colors.warning
        : colors.muted
}

/** Monochrome glyphs, one per semantic icon (mirrors the web SVG set). */
export const toolGlyphs: Record<ToolIcon, string> = {
  terminal: ">_",
  file: "▤",
  pencil: "✎",
  diff: "±",
  search: "⌕",
  globe: "⊕",
  checklist: "☑",
  question: "?",
  tool: "⚙",
}
