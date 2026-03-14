import { useState, useRef, useEffect, useCallback } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
  size?: 'sm' | 'md'
}

export function Select({ value, onChange, options, className = '', size = 'md' }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value

  const close = useCallback(() => {
    setOpen(false)
    setFocusedIndex(-1)
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, options.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault()
        onChange(options[focusedIndex].value)
        close()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, focusedIndex, options, onChange, close])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return
    const item = listRef.current.children[focusedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex])

  const padding = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5'

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${padding} flex items-center gap-2 bg-[#1a1a1a] border border-[#333] rounded-lg text-[var(--foreground)] hover:border-[#555] focus:outline-none focus:border-[var(--primary)] transition-colors cursor-pointer select-none whitespace-nowrap`}
      >
        <span className="truncate">{selectedLabel}</span>
        <i
          className={`fa-solid fa-chevron-down text-[10px] text-[var(--muted-foreground)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          className="dropdown-menu absolute z-50 mt-1.5 min-w-full w-max max-h-64 overflow-y-auto rounded-xl border border-[#333] bg-[#1a1a1a] shadow-xl shadow-black/40 py-1"
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            const isFocused = i === focusedIndex
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  close()
                }}
                onMouseEnter={() => setFocusedIndex(i)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer flex items-center justify-between gap-4 ${
                  isSelected
                    ? 'text-[var(--primary)] font-medium'
                    : 'text-[var(--foreground)]'
                } ${isFocused ? 'bg-[#2a2a2a]' : 'hover:bg-[#2a2a2a]'}`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <i className="fa-solid fa-check text-[var(--primary)] text-xs shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
