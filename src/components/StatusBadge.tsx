import type { ItemStatus, MovementType, TrackingType, Designation, JobStatus, JobItemDirection, QuoteStatus, DepositStatus, QuoteLineType } from '../lib/types'

const STATUS_STYLES: Record<ItemStatus, string> = {
  available: 'bg-success-50 text-success-700',
  scheduled: 'bg-warning-50 text-warning-700',
  installed: 'bg-[#F3ECFC] text-[#6B3FA0]',
  in_transit: 'bg-info-50 text-info-700',
  defect: 'bg-danger-50 text-danger-700',
  in_repair: 'bg-[#F3E8FF] text-[#7C3AED]',
  written_off: 'bg-neutral-100 text-neutral-500',
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

const DESIGNATION_STYLES: Record<Designation, string> = {
  deployment: 'bg-info-50 text-info-700',
  spare: 'bg-warning-50 text-warning-700',
  maintenance: 'bg-[#F3E8FF] text-[#7C3AED]',
}

export function DesignationBadge({ designation }: { designation: Designation }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${DESIGNATION_STYLES[designation]}`}>
      {formatLabel(designation)}
    </span>
  )
}

const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  tentative: 'bg-neutral-100 text-neutral-500',
  scheduled: 'bg-warning-50 text-warning-700',
  in_progress: 'bg-info-50 text-info-700',
  completed: 'bg-success-50 text-success-700',
  closed: 'bg-neutral-200 text-neutral-700',
  incomplete: 'bg-danger-50 text-danger-700',
  cancelled: 'bg-neutral-100 text-neutral-400',
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${JOB_STATUS_STYLES[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {formatLabel(status)}
    </span>
  )
}

export function JobTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-700">
      {formatLabel(type)}
    </span>
  )
}

const DIRECTION_STYLES: Record<JobItemDirection, string> = {
  outbound: 'bg-info-50 text-info-700',
  inbound: 'bg-[#E0F7F5] text-[#0D9488]',
}

export function DirectionBadge({ direction }: { direction: JobItemDirection }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${DIRECTION_STYLES[direction]}`}>
      {formatLabel(direction)}
    </span>
  )
}

const QUOTE_STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: 'bg-neutral-100 text-neutral-500',
  sent: 'bg-info-50 text-info-700',
  signed: 'bg-success-50 text-success-700',
  declined: 'bg-danger-50 text-danger-700',
  superseded: 'bg-neutral-100 text-neutral-400',
}

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${QUOTE_STATUS_STYLES[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {formatLabel(status)}
    </span>
  )
}

const DEPOSIT_STYLES: Record<DepositStatus, string> = {
  not_required: 'bg-neutral-100 text-neutral-500',
  pending: 'bg-warning-50 text-warning-700',
  invoiced: 'bg-info-50 text-info-700',
  paid: 'bg-success-50 text-success-700',
}

const DEPOSIT_LABEL: Record<DepositStatus, string> = {
  not_required: 'No deposit',
  pending: 'Deposit pending',
  invoiced: 'Deposit invoiced',
  paid: 'Deposit paid',
}

export function DepositBadge({ status }: { status: DepositStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${DEPOSIT_STYLES[status]}`}>
      {DEPOSIT_LABEL[status]}
    </span>
  )
}

const LINE_TYPE_STYLES: Record<QuoteLineType, string> = {
  hardware: 'bg-info-50 text-info-700',
  service: 'bg-neutral-100 text-neutral-700',
  subscription: 'bg-[#F3E8FF] text-[#7C3AED]',
}

export function LineTypeBadge({ type }: { type: QuoteLineType }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${LINE_TYPE_STYLES[type]}`}>
      {formatLabel(type)}
    </span>
  )
}
