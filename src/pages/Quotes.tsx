import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/profile'
import type { Quote, Company } from '../lib/types'
import { QuoteStatusBadge, DepositBadge } from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import { formatDate, formatMoney } from '../lib/format'
import { Plus, X, Search } from 'lucide-react'

const STATUS_OPTIONS = ['draft', 'sent', 'signed', 'declined', 'superseded'].map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))
const CURRENCY_OPTIONS = ['THB', 'MYR', 'USD'].map(c => ({ value: c, label: c }))
const TERMS_OPTIONS = [
  { value: 'deposit_before_work', label: 'Deposit before work' },
  { value: 'work_before_deposit', label: 'Work before deposit' },
]

type QuoteRow = Quote & { lines: { quantity: number; unit_price: number }[] }

function quoteTotal(q: QuoteRow): number {
  const subtotal = q.lines.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0)
  return subtotal * (1 + Number(q.tax_rate) / 100)
}

export default function Quotes() {
  const { toast } = useToast()
  const { profileId } = useProfile()
  const navigate = useNavigate()

  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [clients, setClients] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showSuperseded, setShowSuperseded] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [formClientId, setFormClientId] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formCurrency, setFormCurrency] = useState('THB')
  const [formTaxRate, setFormTaxRate] = useState('7')
  const [formTerms, setFormTerms] = useState('deposit_before_work')
  const [formDepositPct, setFormDepositPct] = useState('50')
  const [formNotes, setFormNotes] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!showForm) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowForm(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showForm])

  useEffect(() => {
    fetchQuotes()
    supabase.from('mock_cl_companies').select('*').eq('status', 'client').order('name').then(({ data }) => {
      if (data) setClients(data as Company[])
    })
  }, [])

  async function fetchQuotes() {
    setLoading(true)
    const { data } = await supabase
      .from('crm_quotes')
      .select('*, client:mock_cl_companies(id,name), lines:crm_quote_lines(quantity,unit_price)')
      .order('created_at', { ascending: false })
    if (data) setQuotes(data as unknown as QuoteRow[])
    setLoading(false)
  }

  const filtered = quotes.filter(q => {
    if (!showSuperseded && q.status === 'superseded') return false
    if (statusFilter && q.status !== statusFilter) return false
    if (clientFilter && q.client_id !== clientFilter) return false
    if (search) {
      const s = search.toLowerCase()
      if (!q.quote_number.toLowerCase().includes(s) && !(q.title ?? '').toLowerCase().includes(s)) return false
    }
    return true
  })

  const requiresDeposit = formTerms === 'deposit_before_work'

  const createDisabledReason = (() => {
    if (!formClientId) return 'Select a client'
    const tax = Number(formTaxRate)
    if (formTaxRate === '' || isNaN(tax) || tax < 0 || tax > 100) return 'Tax rate must be 0–100'
    if (requiresDeposit) {
      const pct = Number(formDepositPct)
      if (formDepositPct === '' || isNaN(pct) || pct < 1 || pct > 100) return 'Deposit % must be 1–100'
    }
    return null
  })()

  function resetForm() {
    setFormClientId(''); setFormTitle(''); setFormCurrency('THB'); setFormTaxRate('7')
    setFormTerms('deposit_before_work'); setFormDepositPct('50'); setFormNotes('')
  }

  async function handleCreate() {
    if (createDisabledReason) return
    setCreating(true)
    try {
      const { data: quoteNumber, error: numErr } = await supabase.rpc('generate_quote_number')
      if (numErr) throw numErr
      if (!quoteNumber) throw new Error('Could not generate a quote number')

      const { data: inserted, error } = await supabase
        .from('crm_quotes')
        .insert({
          quote_number: quoteNumber,
          client_id: formClientId,
          title: formTitle.trim() || null,
          currency: formCurrency,
          tax_rate: Number(formTaxRate),
          payment_terms: formTerms,
          deposit_pct: requiresDeposit ? Number(formDepositPct) : 0,
          notes: formNotes.trim() || null,
          created_by: profileId,
        })
        .select('id')
        .single()
      if (error) throw error

      toast('success', `${quoteNumber} created`)
      setShowForm(false)
      resetForm()
      navigate(`/quotes/${inserted.id}`)
    } catch (err: any) {
      toast('error', err.message || 'Failed to create quote')
    } finally {
      setCreating(false)
    }
  }

  const inputClass = 'w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="p-6">
      <PageHeader title="Quotes">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 h-10 bg-neutral-900 text-neutral-0 rounded-lg text-[13px] font-medium hover:bg-neutral-800"
        >
          <Plus size={15} />
          New Quote
        </button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search quote number or title…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-10 pl-8 pr-3 w-64 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <SearchableSelect options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} placeholder="All Statuses" className="w-44" />
        <SearchableSelect options={clients.map(c => ({ value: c.id, label: c.name }))} value={clientFilter} onChange={setClientFilter} placeholder="All Clients" className="w-52" />
        <label className="flex items-center gap-2 text-[12px] text-neutral-600 select-none">
          <input type="checkbox" checked={showSuperseded} onChange={e => setShowSuperseded(e.target.checked)} className="accent-brand-500" />
          Show superseded versions
        </label>
      </div>

      <div className="bg-neutral-0 border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[13px] text-neutral-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-neutral-400">No quotes match</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-[11px] uppercase tracking-[0.06em] text-neutral-500">
                <th className="text-left px-4 py-2.5 font-medium">Quote</th>
                <th className="text-left px-4 py-2.5 font-medium">Client</th>
                <th className="text-left px-4 py-2.5 font-medium">Title</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Deposit</th>
                <th className="text-right px-4 py-2.5 font-medium">Total</th>
                <th className="text-left px-4 py-2.5 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr
                  key={q.id}
                  onClick={() => navigate(`/quotes/${q.id}`)}
                  className="border-t border-neutral-200 hover:bg-neutral-25 cursor-pointer transition-colors duration-120"
                >
                  <td className="px-4 py-2.5 text-[12px] font-mono text-neutral-800">
                    {q.quote_number}
                    <span className="text-neutral-400"> v{q.version}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-neutral-700">{q.client?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-[12px] text-neutral-700 max-w-[260px] truncate">{q.title ?? <span className="text-neutral-400">—</span>}</td>
                  <td className="px-4 py-2.5"><QuoteStatusBadge status={q.status} /></td>
                  <td className="px-4 py-2.5"><DepositBadge status={q.deposit_status} /></td>
                  <td className="px-4 py-2.5 text-[12px] font-mono text-neutral-800 text-right">{formatMoney(quoteTotal(q), q.currency)}</td>
                  <td className="px-4 py-2.5 text-[12px] text-neutral-500 font-mono">{formatDate(q.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 animate-fade-in">
          <div className="bg-neutral-0 rounded-2xl shadow-lg w-full max-w-lg border border-neutral-200 animate-modal">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-[15px] font-semibold text-neutral-900">New Quote</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400"><X size={16} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Client <span className="text-danger-500">*</span></label>
                <SearchableSelect options={clients.map(c => ({ value: c.id, label: c.name }))} value={formClientId} onChange={setFormClientId} placeholder="Select client…" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Title <span className="text-neutral-400 font-normal">(optional)</span></label>
                <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Siam Paragon 3-screen rollout" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Currency</label>
                  <SearchableSelect options={CURRENCY_OPTIONS} value={formCurrency} onChange={setFormCurrency} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Tax rate %</label>
                  <input inputMode="decimal" value={formTaxRate} onChange={e => setFormTaxRate(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Payment terms</label>
                  <SearchableSelect options={TERMS_OPTIONS} value={formTerms} onChange={setFormTerms} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Deposit %</label>
                  <input
                    inputMode="numeric"
                    value={requiresDeposit ? formDepositPct : ''}
                    disabled={!requiresDeposit}
                    onChange={e => setFormDepositPct(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder={requiresDeposit ? '' : 'n/a'}
                    className={`${inputClass} disabled:bg-neutral-100 disabled:text-neutral-400`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Notes <span className="text-neutral-400 font-normal">(optional)</span></label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200">
              <button onClick={() => setShowForm(false)} className="h-10 px-4 rounded-lg border border-neutral-200 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <div className="relative group">
                <button
                  onClick={handleCreate}
                  disabled={creating || createDisabledReason !== null}
                  className="h-10 px-4 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating…' : 'Create draft'}
                </button>
                {createDisabledReason && (
                  <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg bg-[#2b2b2e] text-neutral-0 text-[12px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-lg">
                    {createDisabledReason}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
