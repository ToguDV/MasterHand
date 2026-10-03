import type { ToolAccent } from "@masterhand/client-core"

/**
 * Semantic accents for tool icons and badges. Each tool family gets a color so
 * the stream stays scannable; only the icon chip and small stats use it, so a
 * long transcript does not turn into a rainbow. Full class strings (no
 * interpolation) so Tailwind's scanner keeps them.
 */
export interface AccentStyle {
  text: string
  bg: string
}

export const accents: Record<ToolAccent, AccentStyle> = {
  emerald: { text: "text-emerald-300", bg: "bg-emerald-500/10" },
  amber: { text: "text-amber-300", bg: "bg-amber-500/10" },
  sky: { text: "text-sky-300", bg: "bg-sky-500/10" },
  violet: { text: "text-violet-300", bg: "bg-violet-500/10" },
  cyan: { text: "text-cyan-300", bg: "bg-cyan-500/10" },
  teal: { text: "text-teal-300", bg: "bg-teal-500/10" },
  indigo: { text: "text-indigo-300", bg: "bg-indigo-500/10" },
  zinc: { text: "text-zinc-400", bg: "bg-zinc-500/10" },
}

export function accentStyle(accent: ToolAccent): AccentStyle {
  return accents[accent] ?? accents.zinc
}
