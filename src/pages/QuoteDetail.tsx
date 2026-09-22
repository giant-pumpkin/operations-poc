import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/profile'
import type { Quote, QuoteLine, QuoteLineCoverage, Company, Location, Product, Job, SubContract, JobType } from '../lib/types'
import { QuoteStatusBadge, DepositBadge, LineTypeBadge, JobStatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import DateTimePicker from '../components/DateTimePicker'
import { formatDate, formatDateTime, formatMoney } from '../lib/format'
import { ArrowLeft, Plus, Trash2, X, Send, PenLine, Ban, GitBranch, Briefcase, ExternalLink } from 'lucide-react'

const LINE_TYPE_OPTIONS = [
  { value: 'hardware', label: 'Hardware — from product registry' },
  { value: 'service', label: 'Service — installation, survey, training' },
  { value: 'subscription', label: 'Subscription — recurring licence' },
]
const CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
]
const JOB_TYPE_OPTIONS: { value: JobType; label: string }[] = [
  'installation', 'delivery', 'collect', 'un_installation', 'rework',
  'survey', 'ma_audit', 'ma_preventive', 'ma_reactive', 'account_setup', 'pre_sale',
].map(t => ({ value: t as JobType, label: t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))

const TERMS_LABEL = { deposit_before_work: 'Deposit before work', work_before_deposit: 'Work before deposit' }

const tooltipClass = 'absolute bottom-full left-0 mb-2 px-3 py-1.5 rounded-lg bg-[#2b2b2e] text-neutral-0 text-[12px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-lg z-10'
const inputClass = 'w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500'
const btnPrimary = 'h-9 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5'
const btnSecondary = 'h-9 px-3 rounded-lg border border-neutral-200 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5'

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { profileId, profile } = useProfile()

  const [quote, setQuote] = useState<Quote | null>(null)
  const [lines, setLines] = useState<QuoteLine[]>([])
  const [coverage, setCoverage] = useState<QuoteLineCoverage[]>([])
  const [versions, setVersions] = useState<Quote[]>([])
  const [linkedJobs, setLinkedJobs] = useState<Job[]>([])
  const [contracts, setContracts] = useState<SubContract[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [sites, setSites] = useState<Location[]>([])
  const [partners, setPartners] = useState<Company[]>([])
  const [pricing, setPricing] = useState<{ product_id: string; client_id: string | null; sell_price: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // add line
  const [lineType, setLineType] = useState<'hardware' | 'service' | 'subscription'>('hardware')
  const [lineProductId, setLineProductId] = useState('')
  const [lineDescription, setLineDescription] = useState('')
  const [lineSiteId, setLineSiteId] = useState('')
  const [lineQty, setLineQty] = useState('1')
  const [linePrice, setLinePrice] = useState('')
  const [lineTerm, setLineTerm] = useState('12')
  const [lineCycle, setLineCycle] = useState('monthly')

  // sign / deposit
  const [signEvidence, setSignEvidence] = useState('')
  const [showSign, setShowSign] = useState(false)
  const [depositRef, setDepositRef] = useState('')

  // create job
  const [showJobForm, setShowJobForm] = useState(false)
  const [jobLocationId, setJobLocationId] = useState('')
  const [jobType, setJobType] = useState<JobType>('installation')
  const [jobPartnerId, setJobPartnerId] = useState('')
  const [jobDate, setJobDate] = useState('')
  const [jobNotes, setJobNotes] = useState('')
  const [jobLineQty, setJobLineQty] = useState<Record<string, string>>({})

  useEffect(() => { fetchAll() }, [id])

  useEffect(() => {
    if (!showJobForm) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowJobForm(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showJobForm])

  async function fetchAll() {
    setLoading(true)
    const { data: q } = await supabase
      .from('crm_quotes')
      .select('*, client:mock_cl_companies!crm_quotes_client_id_fkey(id,name), deposit_setter:mock_plat_profiles!crm_quotes_deposit_set_by_fkey(id,full_name,role)')
      .eq('id', id)
      .single()
    if (!q) { setQuote(null); setLoading(false); return }
    const quoteRow = q as unknown as Quote
    setQuote(quoteRow)

    const [linesRes, covRes, versRes, jobsRes, subRes, prodRes, siteRes, partnerRes, priceRes] = await Promise.all([
      supabase.from('crm_quote_lines').select('*, product:inv_product_registry(id,name,sku,tracking_type), location:mock_cl_locations(id,name)').eq('quote_id', id).order('sort_order').order('id'),
      supabase.from('crm_quote_line_coverage').select('*').eq('quote_id', id),
      supabase.from('crm_quotes').select('id, quote_number, version, status, created_at').eq('quote_number', quoteRow.quote_number).order('version'),
      supabase.from('job_quotes').select('job:job_jobs(id, job_number, status, scheduled_date, location:mock_cl_locations(id,name))').eq('quote_id', id),
      supabase.from('sub_contracts').select('*').eq('quote_id', id).order('created_at'),
      supabase.from('inv_product_registry').select('*').eq('active', true).order('name'),
      supabase.from('mock_cl_locations').select('*').eq('cl_company_id', quoteRow.client_id).eq('type', 'client_site').order('name'),
      supabase.from('mock_cl_companies').select('*').in('status', ['client', 'partner']).order('name'),
      supabase.from('inv_product_pricing').select('product_id, client_id, sell_price').or(`client_id.eq.${quoteRow.client_id},client_id.is.null`).order('effective_date', { ascending: false }),
    ])
    setLines((linesRes.data as unknown as QuoteLine[]) ?? [])
    setCoverage((covRes.data as QuoteLineCoverage[]) ?? [])
    setVersions((versRes.data as unknown as Quote[]) ?? [])
    setLinkedJobs(((jobsRes.data ?? []) as any[]).map(r => r.job).filter(Boolean) as Job[])
    setContracts((subRes.data as SubContract[]) ?? [])
    setProducts((prodRes.data as Product[]) ?? [])
    setSites((siteRes.data as unknown as Location[]) ?? [])
    setPartners((partnerRes.data as Company[]) ?? [])
    setPricing((priceRes.data as any[]) ?? [])
    setLoading(false)
  }

  const isDraft = quote?.status === 'draft'
  const requiresDeposit = !!quote && quote.payment_terms === 'deposit_before_work' && quote.deposit_pct > 0

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0)
    const tax = subtotal * (Number(quote?.tax_rate ?? 0) / 100)
    const total = subtotal + tax
    const deposit = requiresDeposit ? total * (quote!.deposit_pct / 100) : 0
    return { subtotal, tax, total, deposit }
  }, [lines, quote, requiresDeposit])

  const coverageByLine = useMemo(() => new Map(coverage.map(c => [c.quote_line_id, c])), [coverage])
  const hardwareLines = lines.filter(l => l.line_type === 'hardware')

  function prefillFromProduct(productId: string) {
    setLineProductId(productId)
    const p = products.find(x => x.id === productId)
    if (p) setLineDescription(p.name)
    const price = pricing.find(r => r.product_id === productId && r.client_id === quote?.client_id)
      ?? pricing.find(r => r.product_id === productId && r.client_id === null)
    if (price) setLinePrice(String(price.sell_price))
  }

  const addLineDisabledReason = (() => {
    if (lineType === 'hardware' && !lineProductId) return 'Select a product'
    if (!lineDescription.trim()) return 'Enter a description'
    if (!(Number(lineQty) > 0)) return 'Quantity must be at least 1'
    if (linePrice === '' || isNaN(Number(linePrice)) || Number(linePrice) < 0) return 'Enter a unit price'
    if (lineType === 'subscription' && !(Number(lineTerm) > 0)) return 'Enter a term in months'
    return null
  })()

  async function handleAddLine() {
    if (!quote || addLineDisabledReason) return
    setBusy(true)
    try {
      const { error } = await supabase.from('crm_quote_lines').insert({
        quote_id: quote.id,
        line_type: lineType,
        product_id: lineType === 'hardware' ? lineProductId : null,
        description: lineDescription.trim(),
        location_id: lineSiteId || null,
        quantity: Number(lineQty),
        unit_price: Number(linePrice),
        term_months: lineType === 'subscription' ? Number(lineTerm) : null,
        billing_cycle: lineType === 'subscription' ? lineCycle : null,
        sort_order: lines.length,
      })
      if (error) throw error
      setLineProductId(''); setLineDescription(''); setLineSiteId(''); setLineQty('1'); setLinePrice('')
      fetchAll()
    } catch (err: any) {
      toast('error', err.message || 'Failed to add line')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteLine(lineId: string) {
    setBusy(true)
    try {
      const { error } = await supabase.from('crm_quote_lines').delete().eq('id', lineId)
      if (error) throw error
      fetchAll()
    } catch (err: any) {
      toast('error', err.message || 'Failed to remove line')
    } finally {
      setBusy(false)
    }
  }

  async function rpc(name: string, params: Record<string, unknown>, successMsg: string) {
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc(name, params)
      if (error) throw error
      toast('success', successMsg)
      await fetchAll()
      return data
    } catch (err: any) {
      toast('error', err.message || 'Action failed')
      return undefined
    } finally {
      setBusy(false)
    }
  }

  async function handleRevise() {
    if (!quote) return
    const newId = await rpc('create_quote_revision', { p_quote_id: quote.id, p_profile: profileId }, `${quote.quote_number} v${quote.version + 1} created as draft`)
    if (newId) navigate(`/quotes/${newId}`)
  }

  const jobDisabledReason = (() => {
    if (!jobLocationId) return 'Select a site'
    if (!jobPartnerId) return 'Select a partner'
    const anyQty = hardwareLines.some(l => Number(jobLineQty[l.id] ?? '0') > 0)
    for (const l of hardwareLines) {
      const q = Number(jobLineQty[l.id] ?? '0')
      const remaining = coverageByLine.get(l.id)?.remaining ?? l.quantity
      if (q > remaining) return `${l.description}: only ${remaining} remaining on this quote`
    }
    if (!anyQty && hardwareLines.length > 0) return 'Enter a quantity for at least one line'
    return null
  })()

  function openJobForm() {
    const initial: Record<string, string> = {}
    for (const l of hardwareLines) initial[l.id] = String(coverageByLine.get(l.id)?.remaining ?? l.quantity)
    setJobLineQty(initial)
    setJobLocationId(hardwareLines.find(l => l.location_id)?.location_id ?? (sites.length === 1 ? sites[0].id : ''))
    setShowJobForm(true)
  }

  async function handleCreateJob() {
    if (!quote || jobDisabledReason) return
    const payload = hardwareLines
      .map(l => ({ line_id: l.id, qty: Number(jobLineQty[l.id] ?? '0') }))
      .filter(x => x.qty > 0)
    const newJobId = await rpc('create_job_from_quote', {
      p_quote_id: quote.id,
      p_location_id: jobLocationId,
      p_lines: payload,
      p_job_type: jobType,
      p_partner_id: jobPartnerId,
      p_scheduled_date: jobDate ? new Date(jobDate).toISOString() : null,
      p_profile: profileId,
      p_notes: jobNotes.trim() || null,
    }, 'Job created from quote')
    if (newJobId) navigate(`/jobs/${newJobId}`)
  }

  if (loading) return <div className="p-6 text-[13px] text-neutral-400">Loading…</div>
  if (!quote) return <div className="p-6 text-[13px] text-neutral-400">Quote not found</div>

  const newerVersion = versions.find(v => v.version > quote.version)

  return (
    <div className="p-6 max-w-5xl">
      <Link to="/quotes" className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-800 mb-3">
        <ArrowLeft size={14} /> Quotes
      </Link>

      {/* Header */}
      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5 mb-5 animate-rise">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-neutral-900 font-mono">{quote.quote_number} <span className="text-neutral-400 font-normal">v{quote.version}</span></h1>
              <QuoteStatusBadge status={quote.status} />
              <DepositBadge status={quote.deposit_status} />
            </div>
            <div className="text-[13px] text-neutral-700">{quote.client?.name}{quote.title ? ` · ${quote.title}` : ''}</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-neutral-400 mt-1">
              <span>{TERMS_LABEL[quote.payment_terms]}{requiresDeposit ? ` · ${quote.deposit_pct}% deposit` : ''}</span>
              <span>{quote.currency} · tax {Number(quote.tax_rate)}%</span>
              <span>Sent: {formatDate(quote.sent_at)}</span>
              <span>Signed: {formatDate(quote.signed_at)}</span>
            </div>
          </div>
          <div className="text-right text-[12px] text-neutral-500 shrink-0">
            <div className="font-mono text-[20px] font-semibold text-neutral-900">{formatMoney(totals.total, quote.currency)}</div>
            <div>incl. tax</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-neutral-100">
          {quote.status === 'draft' && (
            <>
              <div className="relative group">
                <button onClick={() => rpc('mark_quote_sent', { p_quote_id: quote.id, p_profile: profileId }, 'Quote marked as sent')} disabled={busy || lines.length === 0} className={btnPrimary}>
                  <Send size={14} /> Mark Sent
                </button>
                {lines.length === 0 && <div className={tooltipClass}>Add at least one line first</div>}
              </div>
              <button onClick={() => setShowSign(v => !v)} disabled={busy || lines.length === 0} className={btnSecondary}><PenLine size={14} /> Mark Signed</button>
              <button onClick={() => rpc('mark_quote_declined', { p_quote_id: quote.id, p_profile: profileId }, 'Quote declined')} disabled={busy} className={`${btnSecondary} text-danger-700 border-danger-200 hover:bg-danger-50 ml-auto`}><Ban size={14} /> Decline</button>
            </>
          )}
          {quote.status === 'sent' && (
            <>
              <button onClick={() => setShowSign(v => !v)} disabled={busy} className={btnPrimary}><PenLine size={14} /> Mark Signed</button>
              <button onClick={handleRevise} disabled={busy} className={btnSecondary}><GitBranch size={14} /> Revise</button>
              <button onClick={() => rpc('mark_quote_declined', { p_quote_id: quote.id, p_profile: profileId }, 'Quote declined')} disabled={busy} className={`${btnSecondary} text-danger-700 border-danger-200 hover:bg-danger-50 ml-auto`}><Ban size={14} /> Decline</button>
            </>
          )}
          {quote.status === 'signed' && (
            <>
              <div className="relative group">
                <button onClick={openJobForm} disabled={busy || hardwareLines.length === 0 && sites.length === 0} className={btnPrimary}><Briefcase size={14} /> Create Job from Quote</button>
              </div>
              <button onClick={handleRevise} disabled={busy} className={btnSecondary}><GitBranch size={14} /> Revise</button>
              {quote.signed_evidence && (
                <a href={quote.signed_evidence} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] text-brand-500 hover:underline">
                  Signed evidence <ExternalLink size={12} />
                </a>
              )}
            </>
          )}
          {quote.status === 'declined' && (
            <button onClick={handleRevise} disabled={busy} className={btnSecondary}><GitBranch size={14} /> Revise</button>
          )}
          {quote.status === 'superseded' && newerVersion && (
            <Link to={`/quotes/${newerVersion.id}`} className="text-[13px] text-brand-500 hover:underline">
              Superseded — open v{newerVersion.version} →
            </Link>
          )}
        </div>

        {showSign && (quote.status === 'draft' || quote.status === 'sent') && (
          <div className="flex items-end gap-2 mt-3 p-3 bg-neutral-50 rounded-lg animate-rise">
            <div className="flex-1">
              <label className="block text-[11px] text-neutral-500 mb-1">Signed evidence <span className="text-neutral-400">(link to the signed PDF or email — optional)</span></label>
              <input value={signEvidence} onChange={e => setSignEvidence(e.target.value)} placeholder="https://…" className={inputClass} />
            </div>
            <button
              onClick={async () => { await rpc('mark_quote_signed', { p_quote_id: quote.id, p_evidence: signEvidence, p_profile: profileId }, 'Quote marked as signed'); setShowSign(false); setSignEvidence('') }}
              disabled={busy}
              className="h-10 px-4 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40"
            >
              Confirm signed
            </button>
            <button onClick={() => setShowSign(false)} className="h-10 px-3 rounded-lg border border-neutral-200 text-[13px] text-neutral-600 hover:bg-neutral-50">Cancel</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Lines */}
        <div className="col-span-2 space-y-5">
          <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-neutral-800 mb-3">Lines</h2>
            {lines.length === 0 ? (
              <p className="text-[12px] text-neutral-400 mb-3">No lines yet</p>
            ) : (
              <table className="w-full text-sm mb-3" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '96px' }} /><col /><col style={{ width: '56px' }} /><col style={{ width: '110px' }} /><col style={{ width: '120px' }} />{isDraft && <col style={{ width: '36px' }} />}
                </colgroup>
                <thead>
                  <tr className="bg-neutral-50 text-[11px] uppercase tracking-[0.06em] text-neutral-500">
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-right px-3 py-2 font-medium">Qty</th>
                    <th className="text-right px-3 py-2 font-medium">Unit</th>
                    <th className="text-right px-3 py-2 font-medium">Total</th>
                    {isDraft && <th />}
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => {
                    const cov = coverageByLine.get(l.id)
                    return (
                      <tr key={l.id} className="border-t border-neutral-100">
                        <td className="px-3 py-2"><LineTypeBadge type={l.line_type} /></td>
                        <td className="px-3 py-2 text-[12px] text-neutral-800">
                          <div className="truncate">{l.description}</div>
                          <div className="text-[11px] text-neutral-400 truncate">
                            {l.product?.sku && <span className="font-mono">{l.product.sku}</span>}
                            {l.location?.name && <span> · {l.location.name}</span>}
                            {l.line_type === 'subscription' && <span> · {l.term_months} mo, {l.billing_cycle}</span>}
                            {l.line_type === 'hardware' && quote.status === 'signed' && cov && (
                              <span className={cov.remaining === 0 ? ' text-success-700' : ''}> · {cov.in_jobs}/{cov.quantity} in jobs</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[12px] font-mono text-right text-neutral-700">{l.quantity}</td>
                        <td className="px-3 py-2 text-[12px] font-mono text-right text-neutral-700">{formatMoney(Number(l.unit_price), quote.currency)}</td>
                        <td className="px-3 py-2 text-[12px] font-mono text-right text-neutral-900">{formatMoney(l.quantity * Number(l.unit_price), quote.currency)}</td>
                        {isDraft && (
                          <td className="px-1 py-2 text-right">
                            <button onClick={() => handleDeleteLine(l.id)} disabled={busy} className="p-1.5 rounded-md text-neutral-400 hover:bg-danger-50 hover:text-danger-500"><Trash2 size={13} /></button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 text-[12px] space-y-1">
                <div className="flex justify-between text-neutral-600"><span>Subtotal</span><span className="font-mono">{formatMoney(totals.subtotal, quote.currency)}</span></div>
                <div className="flex justify-between text-neutral-600"><span>Tax {Number(quote.tax_rate)}%</span><span className="font-mono">{formatMoney(totals.tax, quote.currency)}</span></div>
                <div className="flex justify-between text-neutral-900 font-semibold border-t border-neutral-200 pt-1"><span>Total</span><span className="font-mono">{formatMoney(totals.total, quote.currency)}</span></div>
                {requiresDeposit && (
                  <div className="flex justify-between text-brand-700"><span>Deposit due ({quote.deposit_pct}%)</span><span className="font-mono">{formatMoney(totals.deposit, quote.currency)}</span></div>
                )}
              </div>
            </div>

            {/* Add line (draft only) */}
            {isDraft && (
              <div className="mt-4 p-3 bg-neutral-50 rounded-lg space-y-3">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <label className="block text-[11px] text-neutral-500 mb-1">Line type</label>
                    <SearchableSelect options={LINE_TYPE_OPTIONS} value={lineType} onChange={v => { setLineType(v as any); setLineProductId(''); setLineDescription(''); setLinePrice('') }} />
                  </div>
                  {lineType === 'hardware' && (
                    <div className="col-span-7">
                      <label className="block text-[11px] text-neutral-500 mb-1">Product</label>
                      <SearchableSelect
                        options={products.map(p => ({ value: p.id, label: p.name, sublabel: p.sku }))}
                        value={lineProductId}
                        onChange={prefillFromProduct}
                        placeholder="Select product…"
                      />
                    </div>
                  )}
                  <div className={lineType === 'hardware' ? 'col-span-7' : 'col-span-7'}>
                    <label className="block text-[11px] text-neutral-500 mb-1">Description</label>
                    <input value={lineDescription} onChange={e => setLineDescription(e.target.value)} placeholder={lineType === 'service' ? 'e.g. Installation — 3 screens' : 'Description'} className={inputClass} />
                  </div>
                  <div className="col-span-5">
                    <label className="block text-[11px] text-neutral-500 mb-1">Site <span className="text-neutral-400">(optional)</span></label>
                    <SearchableSelect options={sites.map(s => ({ value: s.id, label: s.name }))} value={lineSiteId} onChange={setLineSiteId} placeholder="Any site" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-neutral-500 mb-1">Qty</label>
                    <input inputMode="numeric" value={lineQty} onChange={e => setLineQty(e.target.value.replace(/\D/g, '').slice(0, 5))} className={`${inputClass} text-right font-mono`} />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[11px] text-neutral-500 mb-1">Unit price ({quote.currency})</label>
                    <input inputMode="decimal" value={linePrice} onChange={e => setLinePrice(e.target.value.replace(/[^\d.]/g, '').slice(0, 12))} className={`${inputClass} text-right font-mono`} />
                  </div>
                  {lineType === 'subscription' && (
                    <>
                      <div className="col-span-2">
                        <label className="block text-[11px] text-neutral-500 mb-1">Term (mo)</label>
                        <input inputMode="numeric" value={lineTerm} onChange={e => setLineTerm(e.target.value.replace(/\D/g, '').slice(0, 3))} className={`${inputClass} text-right font-mono`} />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-[11px] text-neutral-500 mb-1">Billing</label>
                        <SearchableSelect options={CYCLE_OPTIONS} value={lineCycle} onChange={setLineCycle} />
                      </div>
                    </>
                  )}
                  <div className={`${lineType === 'subscription' ? 'col-span-2' : 'col-span-2'} flex items-end`}>
                    <div className="relative group w-full">
                      <button onClick={handleAddLine} disabled={busy || addLineDisabledReason !== null} className={`${btnPrimary} h-10 w-full justify-center`}><Plus size={14} /> Add</button>
                      {addLineDisabledReason && <div className={`${tooltipClass} left-auto right-0`}>{addLineDisabledReason}</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Linked jobs */}
          <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-neutral-800 mb-3">Jobs using this quote</h2>
            {linkedJobs.length === 0 ? (
              <p className="text-[12px] text-neutral-400">None yet{quote.status === 'signed' ? ' — use "Create Job from Quote" above, or link this quote from an existing job.' : ''}</p>
            ) : (
              <div className="space-y-1.5">
                {linkedJobs.map(j => (
                  <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="font-mono text-neutral-800">{j.job_number}</span>
                      <JobStatusBadge status={j.status} />
                      <span className="text-neutral-500">{(j as any).location?.name}</span>
                    </div>
                    <span className="text-[12px] text-neutral-400 font-mono">{formatDate(j.scheduled_date)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Deposit */}
          <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-neutral-800 mb-3">Deposit</h2>
            <div className="mb-3"><DepositBadge status={quote.deposit_status} /></div>
            {!requiresDeposit ? (
              <p className="text-[12px] text-neutral-500">These terms don't require a deposit before work starts.</p>
            ) : (
              <>
                <div className="text-[12px] text-neutral-600 space-y-1 mb-3">
                  <div className="flex justify-between"><span>Due</span><span className="font-mono">{formatMoney(totals.deposit, quote.currency)}</span></div>
                  {quote.deposit_invoice_ref && <div className="flex justify-between"><span>Invoice</span><span className="font-mono">{quote.deposit_invoice_ref}</span></div>}
                  {quote.deposit_set_at && (
                    <div className="text-[11px] text-neutral-400 pt-1">
                      Set by {quote.deposit_setter?.full_name ?? '—'} · {formatDateTime(quote.deposit_set_at)}
                    </div>
                  )}
                </div>
                {quote.status !== 'declined' && quote.status !== 'superseded' && (
                  <div className="space-y-2">
                    {quote.deposit_status !== 'paid' && (
                      <input value={depositRef} onChange={e => setDepositRef(e.target.value)} placeholder={quote.deposit_invoice_ref ?? 'Invoice reference (e.g. INV-2026-0042)'} className={inputClass} />
                    )}
                    <div className="flex flex-wrap gap-2">
                      {quote.deposit_status === 'pending' && (
                        <div className="relative group">
                          <button onClick={() => rpc('set_quote_deposit_status', { p_quote_id: quote.id, p_status: 'invoiced', p_invoice_ref: depositRef, p_profile: profileId }, 'Deposit marked invoiced')} disabled={busy || !depositRef.trim()} className={btnSecondary}>Mark invoiced</button>
                          {!depositRef.trim() && <div className={tooltipClass}>Enter the invoice reference</div>}
                        </div>
                      )}
                      {quote.deposit_status !== 'paid' && (
                        <div className="relative group">
                          <button onClick={() => rpc('set_quote_deposit_status', { p_quote_id: quote.id, p_status: 'paid', p_invoice_ref: depositRef || quote.deposit_invoice_ref || '', p_profile: profileId }, 'Deposit marked paid')} disabled={busy || !(depositRef.trim() || quote.deposit_invoice_ref)} className={btnPrimary}>Mark paid</button>
                          {!(depositRef.trim() || quote.deposit_invoice_ref) && <div className={tooltipClass}>Enter the invoice reference</div>}
                        </div>
                      )}
                      {quote.deposit_status !== 'pending' && (
                        <button onClick={() => rpc('set_quote_deposit_status', { p_quote_id: quote.id, p_status: 'pending', p_invoice_ref: '', p_profile: profileId }, 'Deposit reverted to pending')} disabled={busy} className={`${btnSecondary} text-neutral-500`}>Revert</button>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-400">Recorded as {profile?.full_name ?? 'current profile'}.</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Versions */}
          <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-neutral-800 mb-3">Versions</h2>
            <div className="space-y-1">
              {versions.map(v => (
                <Link key={v.id} to={`/quotes/${v.id}`} className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12px] ${v.id === quote.id ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'}`}>
                  <span className="font-mono">v{v.version}</span>
                  <QuoteStatusBadge status={v.status} />
                  <span className="text-neutral-400 font-mono">{formatDate(v.created_at)}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Subscriptions */}
          {contracts.length > 0 && (
            <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-neutral-800 mb-3">Subscription contracts</h2>
              <div className="space-y-1.5">
                {contracts.map(c => (
                  <div key={c.id} className="p-2.5 rounded-lg bg-neutral-50 text-[12px]">
                    <div className="text-neutral-800">{c.quantity}× {c.description}</div>
                    <div className="text-neutral-400 text-[11px]">{c.term_months} mo · {c.billing_cycle} · {formatMoney(Number(c.unit_price), c.currency)} · {c.status.replace(/_/g, ' ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {quote.notes && (
            <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-neutral-800 mb-2">Notes</h2>
              <p className="text-[13px] text-neutral-600 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Create job modal */}
      {showJobForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 animate-fade-in">
          <div className="bg-neutral-0 rounded-2xl shadow-lg w-full max-w-xl border border-neutral-200 animate-modal">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-[15px] font-semibold text-neutral-900">Create Job from {quote.quote_number}</h2>
              <button onClick={() => setShowJobForm(false)} className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400"><X size={16} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Site <span className="text-danger-500">*</span></label>
                  <SearchableSelect options={sites.map(s => ({ value: s.id, label: s.name }))} value={jobLocationId} onChange={setJobLocationId} placeholder={sites.length ? 'Select site…' : 'Client has no sites'} disabled={sites.length === 0} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Job type</label>
                  <SearchableSelect options={JOB_TYPE_OPTIONS} value={jobType} onChange={v => setJobType(v as JobType)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Partner <span className="text-danger-500">*</span></label>
                  <SearchableSelect options={partners.map(p => ({ value: p.id, label: p.name }))} value={jobPartnerId} onChange={setJobPartnerId} placeholder="Select partner…" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Scheduled <span className="text-neutral-400 font-normal">(optional)</span></label>
                  <DateTimePicker value={jobDate} onChange={setJobDate} allowFuture placeholder="Leave blank for tentative" />
                </div>
              </div>

              {hardwareLines.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Hardware for this job</label>
                  <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                    {hardwareLines.map(l => {
                      const cov = coverageByLine.get(l.id)
                      const remaining = cov?.remaining ?? l.quantity
                      return (
                        <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                          <div className="flex-1 min-w-0">
                            <div className="text-neutral-800 truncate">{l.description}</div>
                            <div className="text-neutral-400 text-[11px]">{remaining} of {l.quantity} remaining{l.location?.name ? ` · quoted for ${l.location.name}` : ''}</div>
                          </div>
                          <input
                            inputMode="numeric"
                            value={jobLineQty[l.id] ?? ''}
                            onChange={e => setJobLineQty(prev => ({ ...prev, [l.id]: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                            className={`w-20 h-9 px-2 rounded-md border text-right font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500 ${Number(jobLineQty[l.id] ?? 0) > remaining ? 'border-danger-500' : 'border-neutral-200'}`}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Notes <span className="text-neutral-400 font-normal">(optional)</span></label>
                <textarea value={jobNotes} onChange={e => setJobNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200">
              <button onClick={() => setShowJobForm(false)} className="h-10 px-4 rounded-lg border border-neutral-200 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <div className="relative group">
                <button onClick={handleCreateJob} disabled={busy || jobDisabledReason !== null} className="h-10 px-4 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed">
                  {busy ? 'Creating…' : 'Create job'}
                </button>
                {jobDisabledReason && <div className={`${tooltipClass} left-auto right-0`}>{jobDisabledReason}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
