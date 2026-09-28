import { useEffect, useMemo, useRef, useState } from "react"

export interface SearchSelectOption {
  value: string
  label: string
}

export function SearchSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  previewCount = 6,
}: {
  value: string
  options: SearchSelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
  placeholder: string
  previewCount?: number
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((option) => option.value === value)
  const searchable = options.length > previewCount

  useEffect(() => {
    if (!open) {
      setQuery("")
      setExpanded(false)
      return
    }
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (term) return options.filter((option) => option.label.toLowerCase().includes(term))
    if (!searchable || expanded) return options
    const pinned = selected ? [selected, ...options.filter((option) => option.value !== selected.value)] : options
    return pinned.slice(0, previewCount)
  }, [options, query, searchable, expanded, selected, previewCount])

  const truncated = searchable && !expanded && !query.trim()

  return (
    <div ref={rootRef} className="relative min-w-0 basis-full md:basis-32 md:flex-1">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className={triggerClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={`truncate ${selected ? "text-zinc-300" : "text-zinc-500"}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 fill-zinc-500">
          <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-72 max-w-[85vw] rounded-xl border border-zinc-800 bg-zinc-900 p-2 shadow-xl">
          {searchable && (
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && visible[0]) {
                  event.preventDefault()
                  onChange(visible[0].value)
                  setOpen(false)
                }
              }}
              placeholder="Search…"
              aria-label={`Search ${ariaLabel.toLowerCase()}`}
              className="mb-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-indigo-500"
            />
          )}

          <ul role="listbox" aria-label={ariaLabel} className="max-h-60 space-y-0.5 overflow-y-auto">
            {visible.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`w-full truncate rounded-lg px-2 py-1.5 text-left text-xs hover:bg-zinc-800 ${
                    option.value === value ? "text-indigo-400" : "text-zinc-300"
                  }`}
                >
                  {option.label}
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="px-2 py-3 text-xs text-zinc-500">No matches</li>}
          </ul>

          {truncated && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-indigo-400 hover:bg-zinc-800"
            >
              Show all {options.length} {ariaLabel.toLowerCase()}s
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const triggerClass =
  "flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs outline-none focus:border-indigo-500"
