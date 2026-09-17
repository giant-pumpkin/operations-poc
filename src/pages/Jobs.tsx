import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Job, JobType, JobStatus, Company, Location } from '../lib/types'
import { JobStatusBadge, JobTypeBadge } from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import { Plus, X, Search } from 'lucide-react'

const JOB_TYPES: JobType[] = [
  'installation', 'delivery', 'collect', 'un_installation', 'rework',
  'survey', 'ma_audit', 'ma_preventive', 'ma_reactive', 'account_setup', 'pre_sale',
]

const JOB_STATUSES: JobStatus[] = [
  'tentative', 'scheduled', 'in_progress', 'completed', 'closed', 'incomplete', 'cancelled',
]

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`
}

export default function Jobs() {
  const { toast } = useToast()
  const navigate = useNavigate()

  const [jobs, setJobs] = useState<Job[]>([])
  const [assigneeCounts, setAssigneeCounts] = useState<Record<string, number>>({})
  const [companies, setCompanies] = useState<Company[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<JobType | ''>('')
  const [formClientId, setFormClientId] = useState('')
  const [formLocationType, setFormLocationType] = useState('')
  const [formLocationId, setFormLocationId] = useState('')
  const [formPartnerId, setFormPartnerId] = useState('')
  const [formScheduledDate, setFormScheduledDate] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchJobs()
    supabase.from('mock_cl_companies').select('*').order('name').then(({ data }) => {
      if (data) setCompanies(data as unknown as Company[])
    })
    supabase.from('mock_cl_locations').select('*').order('name').then(({ data }) => {
      if (data) setLocations(data as unknown as Location[])
    })
  }, [])

  async function fetchJobs() {
    setLoading(true)
    const { data } = await supabase
      .from('job_jobs')
      .select('*, client:mock_cl_companies!job_jobs_client_id_fkey(id,name), location:mock_cl_locations(id,name), partner:mock_cl_companies!job_jobs_partner_id_fkey(id,name)')
      .order('created_at', { ascending: false })
    if (data) setJobs(data as unknown as Job[])

    const { data: assignees } = await supabase.from('job_assignees').select('job_id')
    if (assignees) {
      const counts: Record<string, number> = {}
      for (const a of assignees) counts[a.job_id] = (counts[a.job_id] ?? 0) + 1
      setAssigneeCounts(counts)
    }
    setLoading(false)
  }

  const filtered = jobs.filter(j => {
    if (statusFilter && j.status !== statusFilter) return false
    if (typeFilter && j.job_type !== typeFilter) return false
    if (clientFilter && j.client_id !== clientFilter) return false
    if (partnerFilter && j.partner_id !== partnerFilter) return false
    if (search && !j.job_number.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const clientLocations = locations.filter(l => l.cl_company_id === formClientId)
  const locationTypeOptions = Array.from(new Set(clientLocations.map(l => l.type)))
    .map(t => ({ value: t, label: formatLabel(t) }))
  const locationOptions = formLocationType
    ? clientLocations.filter(l => l.type === formLocationType)
    : clientLocations

  function resetForm() {
    setFormType('')
    setFormClientId('')
    setFormLocationType('')
    setFormLocationId('')
    setFormPartnerId('')
    setFormScheduledDate('')
    setFormNotes('')
  }

  const createDisabledReason = (() => {
    if (!formType) return 'Select a job type'
    if (!formClientId) return 'Select a client'
    if (!formLocationType) return 'Select a location type'
    if (!formLocationId) return 'Select a location'
    if (!formPartnerId) return 'Select a partner'
    return null
  })()

  async function handleCreate() {
    if (createDisabledReason) return
    setCreating(true)
    try {
      const { data: jobNumber, error: numErr } = await supabase.rpc('generate_job_number')
      if (numErr) throw numErr

      const now = new Date().toISOString()
      const { data: inserted, error } = await supabase
        .from('job_jobs')
        .insert({
          job_number: jobNumber,
          job_type: formType,
          status: formScheduledDate ? 'scheduled' : 'tentative',
          client_id: formClientId,
          location_id: formLocationId,
          partner_id: formPartnerId || null,
          scheduled_date: formScheduledDate ? new Date(formScheduledDate).toISOString() : null,
          notes: formNotes.trim() || null,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single()
      if (error) throw error

      toast('success', `${jobNumber} created`)
      setShowForm(false)
      resetForm()
      navigate(`/jobs/${inserted.id}`)
    } catch (err: any) {
      toast('error', err.message || 'Failed to create job')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6">
      <PageHeader title="Jobs">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 h-10 bg-neutral-900 text-neutral-0 rounded-lg text-[13px] font-medium hover:bg-neutral-800 transition-colors duration-120"
        >
          <Plus size={15} />
          Create Job
        </button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search job number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-10 pl-8 pr-3 w-56 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <SearchableSelect
          options={JOB_STATUSES.map(s => ({ value: s, label: formatLabel(s) }))}
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="All Statuses"
          className="w-44"
        />
        <SearchableSelect
          options={JOB_TYPES.map(t => ({ value: t, label: formatLabel(t) }))}
          value={typeFilter}
          onChange={setTypeFilter}
          placeholder="All Types"
          className="w-44"
        />
        <SearchableSelect
          options={companies.map(c => ({ value: c.id, label: c.name }))}
          value={clientFilter}
          onChange={setClientFilter}
          placeholder="All Clients"
          className="w-44"
        />
        <SearchableSelect
          options={companies.map(c => ({ value: c.id, label: c.name }))}
          value={partnerFilter}
          onChange={setPartnerFilter}
          placeholder="All Partners"
          className="w-44"
        />
        <span className="text-[12px] text-neutral-500 ml-auto">{filtered.length} jobs</span>
      </div>

      {/* Table */}
      <div className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-0">
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-100">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Job Number</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Type</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Status</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Client</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Location</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Partner</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Scheduled Date</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Assignees</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[13px] text-neutral-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[13px] text-neutral-400">No jobs found</td></tr>
            ) : (
              filtered.map(job => (
                <tr
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="border-t border-neutral-200 hover:bg-neutral-25 cursor-pointer transition-colors duration-120"
                >
                  <td className="px-4 py-2.5 text-[12px] font-mono text-neutral-800">{job.job_number}</td>
                  <td className="px-4 py-2.5"><JobTypeBadge type={job.job_type} /></td>
                  <td className="px-4 py-2.5"><JobStatusBadge status={job.status} /></td>
                  <td className="px-4 py-2.5 text-[12px] text-neutral-700">{job.client?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-[12px] text-neutral-700">{job.location?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-[12px] text-neutral-700">{job.partner?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-[12px] text-neutral-500">{formatDate(job.scheduled_date)}</td>
                  <td className="px-4 py-2.5 text-[12px] text-neutral-500">{assigneeCounts[job.id] ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Job Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40">
          <div
            className="bg-neutral-0 rounded-2xl shadow-lg w-full max-w-lg border border-neutral-200"
            style={{ animation: 'modalIn 180ms cubic-bezier(.2,0,0,1)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <h2 className="text-base font-semibold text-neutral-900">Create Job</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Job Type <span className="text-red-500">*</span></label>
                <SearchableSelect
                  options={JOB_TYPES.map(t => ({ value: t, label: formatLabel(t) }))}
                  value={formType}
                  onChange={v => setFormType(v as JobType)}
                  placeholder="Select job type…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Client <span className="text-red-500">*</span></label>
                <SearchableSelect
                  options={companies.map(c => ({ value: c.id, label: c.name }))}
                  value={formClientId}
                  onChange={v => { setFormClientId(v); setFormLocationType(''); setFormLocationId('') }}
                  placeholder="Select client…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Location Type <span className="text-red-500">*</span></label>
                <SearchableSelect
                  options={locationTypeOptions}
                  value={formLocationType}
                  onChange={v => { setFormLocationType(v); setFormLocationId('') }}
                  placeholder={formClientId ? 'Select location type…' : 'Select a client first'}
                  disabled={!formClientId}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Location <span className="text-red-500">*</span></label>
                <SearchableSelect
                  options={locationOptions.map(l => ({ value: l.id, label: l.name }))}
                  value={formLocationId}
                  onChange={setFormLocationId}
                  placeholder={formLocationType ? 'Select location…' : 'Select a location type first'}
                  disabled={!formLocationType}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Partner <span className="text-red-500">*</span></label>
                <SearchableSelect
                  options={companies.map(c => ({ value: c.id, label: c.name }))}
                  value={formPartnerId}
                  onChange={setFormPartnerId}
                  placeholder="Select partner…"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Scheduled Date <span className="text-neutral-400 font-normal">(optional — leave blank for tentative)</span>
                </label>
                <input
                  type="datetime-local"
                  value={formScheduledDate}
                  onChange={e => setFormScheduledDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Notes <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-200">
              <button
                onClick={() => setShowForm(false)}
                className="h-10 px-4 rounded-lg border border-neutral-200 bg-neutral-0 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <div className="relative group">
                <button
                  onClick={handleCreate}
                  disabled={creating || createDisabledReason !== null}
                  className="h-10 px-4 bg-neutral-900 text-neutral-0 rounded-lg text-[13px] font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                {createDisabledReason && !creating && (
                  <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg bg-[#2b2b2e] text-neutral-0 text-[12px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-lg">
                    {createDisabledReason}
                    <div className="absolute top-full right-4 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-[#2b2b2e]" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.97) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
