import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  sublabel?: string
}

interface Props {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

  const filtered = query
    ? options.filter(o => {
        const q = query.toLowerCase()
        return o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q)
      })
    : options

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => { if (!disabled) { setOpen(!open); setQuery('') } }}
        disabled={disabled}
        className="w-full h-10 px-3 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-neutral-100 disabled:text-neutral-400"
      >
        <span className={`truncate ${selected ? 'text-neutral-900' : 'text-neutral-400'}`}>
          {selected ? (selected.sublabel ? `${selected.label} (${selected.sublabel})` : selected.label) : placeholder}
        </span>
        <ChevronDown size={14} className="text-neutral-400 shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-neutral-0 border border-neutral-200 rounded-lg shadow-md overflow-hidden">
          {options.length > 5 && (
            <div className="p-1.5 border-b border-neutral-200">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search..."
                  autoFocus
                  className="w-full h-8 pl-7 pr-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-[12px] placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="w-full px-3 py-1.5 text-left text-[12px] text-neutral-400 italic hover:bg-neutral-50"
              >
                Clear
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-neutral-400">No matches</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className={`w-full px-3 py-1.5 text-left text-[12px] flex items-center justify-between hover:bg-neutral-50 ${
                    o.value === value ? 'text-brand-500 font-medium' : 'text-neutral-800'
                  }`}
                >
                  <span className="truncate">
                    {o.label}
                    {o.sublabel && <span className="font-mono text-neutral-400 ml-1">({o.sublabel})</span>}
                  </span>
                  {o.value === value && <Check size={13} className="text-brand-500 shrink-0 ml-2" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
