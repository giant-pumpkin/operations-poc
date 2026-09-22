import DateTimePicker from './DateTimePicker'

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
}

// Movements record something that already happened, so the future is never selectable.
export default function MovementDateInput({ value, onChange, className = '' }: Props) {
  return (
    <DateTimePicker
      value={value}
      onChange={onChange}
      label="Movement Date"
      required
      allowFuture={false}
      className={className}
    />
  )
}
