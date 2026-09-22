import type { JobReadiness, Readiness } from '../lib/types'
import { Check, X, Clock, Minus } from 'lucide-react'

const READINESS_STYLE: Record<Readiness, string> = {
  blocked: 'bg-danger-50 text-danger-700',
  ready: 'bg-success-50 text-success-700',
  scheduled: 'bg-warning-50 text-warning-700',
  in_progress: 'bg-info-50 text-info-700',
  done: 'bg-neutral-100 text-neutral-500',
}

export const READINESS_LABEL: Record<Readiness, string> = {
  blocked: 'Blocked',
  ready: 'Ready to schedule',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  done: 'Done',
}

export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${READINESS_STYLE[readiness]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {READINESS_LABEL[readiness]}
    </span>
  )
}

type GateState = 'ok' | 'warn' | 'fail' | 'na'

export interface Gate {
  key: string
  label: string
  state: GateState
  detail: string
}

// Turns a readiness row into the five gates the team talks about, each with a one-line reason.
export function gatesFor(r: JobReadiness): Gate[] {
  const quote: Gate = r.quote_gate === 'ok'
    ? { key: 'quote', label: 'Quote signed', state: 'ok', detail: r.quote_summary ?? 'Signed' }
    : r.quote_gate === 'missing'
      ? { key: 'quote', label: 'Quote signed', state: 'fail', detail: 'No quote linked to this job' }
      : { key: 'quote', label: 'Quote signed', state: 'fail', detail: `Not signed yet — ${r.quote_summary ?? ''}` }

  const deposit: Gate = r.deposit_gate === 'ok'
    ? { key: 'deposit', label: 'Deposit', state: 'ok', detail: 'Every deposit-before-work quote is paid' }
    : r.deposit_gate === 'not_required'
      ? { key: 'deposit', label: 'Deposit', state: 'na', detail: 'Terms don\'t require a deposit before work' }
      : r.deposit_gate === 'missing'
        ? { key: 'deposit', label: 'Deposit', state: 'fail', detail: 'Depends on a linked quote' }
        : { key: 'deposit', label: 'Deposit', state: 'fail', detail: `Unpaid: ${r.unpaid_summary ?? ''}` }

  const stock: Gate = r.stock_gate === 'ok'
    ? { key: 'stock', label: 'Stock', state: 'ok', detail: 'Client pool covers every outbound item' }
    : r.stock_gate === 'on_order'
      ? { key: 'stock', label: 'Stock', state: 'warn', detail: `Covered once orders land — ${r.stock_summary ?? ''}` }
      : { key: 'stock', label: 'Stock', state: 'fail', detail: `Short — ${r.stock_summary ?? ''}` }

  const partner: Gate = r.partner_gate === 'ok'
    ? { key: 'partner', label: 'Partner confirmed', state: 'ok', detail: 'Confirmed' }
    : { key: 'partner', label: 'Partner confirmed', state: 'warn', detail: 'Not confirmed yet' }

  const schedule: Gate = r.schedule_gate === 'ok'
    ? { key: 'schedule', label: 'Scheduled', state: 'ok', detail: 'Date set' }
    : { key: 'schedule', label: 'Scheduled', state: 'warn', detail: 'No date yet' }

  return [quote, deposit, stock, partner, schedule]
}

export function blockingReasons(r: JobReadiness): string[] {
  return gatesFor(r).filter(g => g.state === 'fail').map(g => `${g.label}: ${g.detail}`)
}

const GATE_ICON_STYLE: Record<GateState, string> = {
  ok: 'bg-success-50 text-success-700',
  warn: 'bg-warning-50 text-warning-700',
  fail: 'bg-danger-50 text-danger-700',
  na: 'bg-neutral-100 text-neutral-400',
}

export function GateIcon({ state }: { state: GateState }) {
  const Icon = state === 'ok' ? Check : state === 'fail' ? X : state === 'warn' ? Clock : Minus
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${GATE_ICON_STYLE[state]}`}>
      <Icon size={12} strokeWidth={2.5} />
    </span>
  )
}

export function GateList({ readiness, compact = false }: { readiness: JobReadiness; compact?: boolean }) {
  return (
    <ul className={compact ? 'space-y-1' : 'space-y-2'}>
      {gatesFor(readiness).map(g => (
        <li key={g.key} className="flex items-start gap-2">
          <GateIcon state={g.state} />
          <div className="min-w-0">
            <div className={`${compact ? 'text-[12px]' : 'text-[13px]'} font-medium text-neutral-800 leading-5`}>{g.label}</div>
            {!compact && <div className="text-[12px] text-neutral-500">{g.detail}</div>}
            {compact && g.state !== 'ok' && g.state !== 'na' && <div className="text-[11px] text-neutral-500 truncate">{g.detail}</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}
