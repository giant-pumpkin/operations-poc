import type { ItemStatus, MovementType, TrackingType } from '../lib/types'

const STATUS_STYLES: Record<ItemStatus, string> = {
  available: 'bg-success-50 text-success-700',
  scheduled: 'bg-warning-50 text-warning-700',
  installed: 'bg-[#F3ECFC] text-[#6B3FA0]',
  in_transit: 'bg-info-50 text-info-700',
  defect: 'bg-danger-50 text-danger-700',
  in_repair: 'bg-[#F3E8FF] text-[#7C3AED]',
}

const MOVEMENT_STYLES: Record<MovementType, string> = {
  stock_in: 'bg-success-50 text-success-700',
  stock_out: 'bg-danger-50 text-danger-700',
  transfer: 'bg-info-50 text-info-700',
  return: 'bg-[#E0F7F5] text-[#0D9488]',
  adjustment: 'bg-warning-50 text-warning-700',
}

const TRACKING_STYLES: Record<TrackingType, string> = {
  serial_tracked: 'bg-info-50 text-info-700',
  quantity_only: 'bg-neutral-100 text-neutral-700',
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {formatLabel(status)}
    </span>
  )
}

export function MovementBadge({ type }: { type: MovementType }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${MOVEMENT_STYLES[type]}`}>
      {formatLabel(type)}
    </span>
  )
}

export function TrackingBadge({ type }: { type: TrackingType }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${TRACKING_STYLES[type]}`}>
      {type === 'serial_tracked' ? 'Serial' : 'Qty Only'}
    </span>
  )
}
