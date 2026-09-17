import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  sublabel?: string
}

interface SingleProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  multi?: false
}

interface MultiProps {
  options: SelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  multi: true
}

type Props = SingleProps | MultiProps

export default function SearchableSelect(props: Props) {
  const {
    options,
    placeholder = 'Select…',
    disabled = false,
    className = '',
  } = props

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isMulti = props.multi === true

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

  if (isMulti) {
    const multiProps = props as MultiProps
    const selected = multiProps.value
    const selectedOptions = options.filter(o => selected.includes(o.value))

    function toggle(val: string) {
      if (selected.includes(val)) {
        multiProps.onChange(selected.filter(v => v !== val))
      } else {
        multiProps.onChange([...selected, val])
      }
    }

    const buttonLabel = selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions.length} selected`

    return (
      <div className={`relative ${className}`} ref={containerRef}>
        {open ? (
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="w-full h-10 pl-8 pr-8 bg-neutral-0 border border-brand-500 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { if (!disabled) { setOpen(true); setQuery('') } }}
            disabled={disabled}
            className="w-full h-10 px-3 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-neutral-100 disabled:text-neutral-400"
          >
            <span className={`truncate ${selected.length > 0 ? 'text-neutral-900' : 'text-neutral-400'}`}>
              {buttonLabel}
            </span>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {selected.length > 0 && (
                <span
                  onClick={e => { e.stopPropagation(); multiProps.onChange([]) }}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-brand-500 text-neutral-0 hover:bg-brand-600 cursor-pointer transition-colors duration-120"
                >
                  Clear
                </span>
              )}
              <ChevronDown size={14} className="text-neutral-400" />
            </div>
          </button>
        )}

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-neutral-0 border border-neutral-200 rounded-lg shadow-md overflow-hidden">
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-neutral-400">No matches</div>
              ) : (
                filtered.map(o => {
                  const isChecked = selected.includes(o.value)
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggle(o.value)}
                      className={`w-full px-3 py-1.5 text-left text-[12px] flex items-center justify-between hover:bg-neutral-50 ${
                        isChecked ? 'text-brand-500 font-medium' : 'text-neutral-800'
                      }`}
                    >
                      <span className="truncate">
                        {o.label}
                        {o.sublabel && <span className="font-mono text-neutral-400 ml-1">({o.sublabel})</span>}
                      </span>
                      {isChecked && <Check size={13} className="text-brand-500 shrink-0 ml-2" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Single-select mode
  const singleProps = props as SingleProps
  const selected = options.find(o => o.value === singleProps.value)

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {open ? (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search..."
            autoFocus
            className="w-full h-10 pl-8 pr-8 bg-neutral-0 border border-brand-500 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { if (!disabled) { setOpen(true); setQuery('') } }}
          disabled={disabled}
          className="w-full h-10 px-3 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-neutral-100 disabled:text-neutral-400"
        >
          <span className={`truncate ${selected ? 'text-neutral-900' : 'text-neutral-400'}`}>
            {selected ? (selected.sublabel ? `${selected.label} (${selected.sublabel})` : selected.label) : placeholder}
          </span>
          <ChevronDown size={14} className="text-neutral-400 shrink-0 ml-2" />
        </button>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-neutral-0 border border-neutral-200 rounded-lg shadow-md overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {singleProps.value && (
              <button
                type="button"
                onClick={() => { singleProps.onChange(''); setOpen(false) }}
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
                  onClick={() => { singleProps.onChange(o.value); setOpen(false) }}
                  className={`w-full px-3 py-1.5 text-left text-[12px] flex items-center justify-between hover:bg-neutral-50 ${
                    o.value === singleProps.value ? 'text-brand-500 font-medium' : 'text-neutral-800'
                  }`}
                >
                  <span className="truncate">
                    {o.label}
                    {o.sublabel && <span className="font-mono text-neutral-400 ml-1">({o.sublabel})</span>}
                  </span>
                  {o.value === singleProps.value && <Check size={13} className="text-brand-500 shrink-0 ml-2" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
