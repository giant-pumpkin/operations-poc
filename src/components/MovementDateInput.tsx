interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
}

function nowLocalValue(): string {
  const d = new Date()
  d.setSeconds(0, 0)
  const tzOffsetMs = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16)
}

export default function MovementDateInput({ value, onChange, className = '' }: Props) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-neutral-700 mb-1">
        Movement Date <span className="text-danger-500">*</span>
      </label>
      <input
        type="datetime-local"
        value={value}
        onChange={e => onChange(e.target.value)}
        max={nowLocalValue()}
        required
        className="w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1"
      />
    </div>
  )
}
