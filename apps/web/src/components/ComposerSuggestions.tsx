export interface ComposerSuggestion {
  id: string
  label: string
  detail?: string
}

/**
 * Popover above the composer listing commands, subagent mentions or argument
 * suggestions. Purely presentational: the composer owns the trigger state and
 * keyboard handling, so the list works the same on web and desktop.
 */
export function ComposerSuggestions({
  id,
  title,
  hint,
  items,
  activeIndex,
  emptyLabel,
  onActive,
  onSelect,
}: {
  id?: string
  title: string
  hint?: string | null
  items: ComposerSuggestion[]
  activeIndex: number
  emptyLabel: string
  onActive: (index: number) => void
  onSelect: (index: number) => void
}) {
  return (
    <div
      id={id}
      role="listbox"
      aria-label={title}
      className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl"
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-1.5 text-[11px]">
        <span className="truncate font-medium text-zinc-400">{title}</span>
        {hint && <span className="shrink-0 text-zinc-500">{hint}</span>}
      </div>
      <ul className="max-h-64 overflow-y-auto p-1">
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              id={`${id ?? "composer-suggestions"}-${item.id}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onActive(index)}
              onClick={() => onSelect(index)}
              className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                index === activeIndex ? "bg-zinc-800" : "hover:bg-zinc-800/60"
              }`}
            >
              <span className="shrink-0 font-medium text-zinc-200">{item.label}</span>
              {item.detail && <span className="min-w-0 truncate text-[11px] text-zinc-500">{item.detail}</span>}
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="px-2 py-2 text-xs text-zinc-500">{emptyLabel}</li>}
      </ul>
    </div>
  )
}
