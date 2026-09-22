import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatDateTime } from '../lib/format'

interface Props {
  value: string // 'YYYY-MM-DDTHH:mm' in local time, or ''
  onChange: (value: string) => void
  className?: string
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const pad = (n: number) => String(n).padStart(2, '0')

function toValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromValue(v: string): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export default function MovementDateInput({ value, onChange, className = '' }: Props) {
  const selected = fromValue(value)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => (selected ?? new Date()).getFullYear())
  const [viewMonth, setViewMonth] = useState(() => (selected ?? new Date()).getMonth())
  const [hourText, setHourText] = useState(selected ? pad(selected.getHours()) : '')
  const [minuteText, setMinuteText] = useState(selected ? pad(selected.getMinutes()) : '')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    setHourText(selected ? pad(selected.getHours()) : '')
    setMinuteText(selected ? pad(selected.getMinutes()) : '')
    if (selected) {
      setViewYear(selected.getFullYear())
      setViewMonth(selected.getMonth())
    }
  }, [value])

  const now = new Date()
  const todayStart = startOfDay(now)

  function commit(d: Date) {
    const clamped = d > now ? now : d
    onChange(toValue(clamped))
  }

  function pickDay(day: Date) {
    const base = selected ?? now
    const next = new Date(day)
    next.setHours(base.getHours(), base.getMinutes(), 0, 0)
    commit(next)
  }

  function applyTime(hText: string, mText: string) {
    const h = Math.min(23, Math.max(0, parseInt(hText || '0', 10) || 0))
    const m = Math.min(59, Math.max(0, parseInt(mText || '0', 10) || 0))
    setHourText(pad(h))
    setMinuteText(pad(m))
    const base = selected ?? now
    const next = new Date(base)
    next.setHours(h, m, 0, 0)
    commit(next)
  }

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const canGoForward = new Date(viewYear, viewMonth + 1, 1) <= now

  return (
    <div className={className} ref={containerRef}>
      <label className="block text-sm font-medium text-neutral-700 mb-1">
        Movement Date <span className="text-danger-500">*</span>
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`w-full h-10 px-3 pr-9 rounded-lg border bg-neutral-0 text-sm text-left flex items-center focus:outline-none focus:ring-2 focus:ring-brand-500 ${
            open ? 'border-brand-500' : 'border-neutral-200'
          } ${selected ? 'text-neutral-900 font-mono' : 'text-neutral-400'}`}
        >
          {selected ? formatDateTime(selected) : 'Select date and time…'}
        </button>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onChange('') }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange('') } }}
              className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 cursor-pointer"
              aria-label="Clear date"
            >
              <X size={13} />
            </span>
          )}
          <Calendar size={14} className="text-neutral-400 pointer-events-none" />
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-[280px] bg-neutral-0 border border-neutral-200 rounded-xl shadow-lg p-3 animate-popover">
            {/* Month header */}
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="p-1 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-[13px] font-semibold text-neutral-800">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={!canGoForward}
                className="p-1 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Weekday row */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-medium uppercase tracking-[0.06em] text-neutral-400 py-1">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((day, i) => {
                if (!day) return <div key={i} />
                const isFuture = day > todayStart
                const isSelected = selected ? sameDay(day, selected) : false
                const isToday = sameDay(day, now)
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={isFuture}
                    onClick={() => pickDay(day)}
                    className={`h-8 w-full rounded-md text-[12px] font-mono transition-colors duration-120 ${
                      isSelected
                        ? 'bg-brand-500 text-neutral-0 font-semibold'
                        : isFuture
                          ? 'text-neutral-300 cursor-not-allowed'
                          : 'text-neutral-800 hover:bg-neutral-100'
                    } ${isToday && !isSelected ? 'ring-1 ring-inset ring-brand-500' : ''}`}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>

            {/* Time row */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
              <div className="flex items-center gap-1">
                <span className="text-[11px] uppercase tracking-[0.06em] text-neutral-500 mr-1">Time</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={hourText}
                  onChange={e => {
                    const t = e.target.value.replace(/\D/g, '').slice(0, 2)
                    setHourText(t)
                    if (t.length === 2) applyTime(t, minuteText)
                  }}
                  onBlur={() => applyTime(hourText, minuteText)}
                  onKeyDown={e => { if (e.key === 'Enter') applyTime(hourText, minuteText) }}
                  placeholder="HH"
                  className="w-10 h-8 px-1 rounded-md border border-neutral-200 bg-neutral-0 text-[13px] font-mono text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-neutral-400 font-mono">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={minuteText}
                  onChange={e => {
                    const t = e.target.value.replace(/\D/g, '').slice(0, 2)
                    setMinuteText(t)
                    if (t.length === 2) applyTime(hourText, t)
                  }}
                  onBlur={() => applyTime(hourText, minuteText)}
                  onKeyDown={e => { if (e.key === 'Enter') applyTime(hourText, minuteText) }}
                  placeholder="MM"
                  className="w-10 h-8 px-1 rounded-md border border-neutral-200 bg-neutral-0 text-[13px] font-mono text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { commit(new Date()); setOpen(false) }}
                  className="h-8 px-2.5 rounded-md text-[12px] font-medium text-brand-500 hover:bg-brand-50"
                >
                  Now
                </button>
                <button
                  type="button"
                  onClick={() => { if (selected) applyTime(hourText, minuteText); setOpen(false) }}
                  className="h-8 px-3 rounded-md bg-neutral-900 text-neutral-0 text-[12px] font-medium hover:bg-neutral-800"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
