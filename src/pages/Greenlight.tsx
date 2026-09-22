import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { JobReadiness, Readiness, Company, Location } from '../lib/types'
import { JobTypeBadge } from '../components/StatusBadge'
import { ReadinessBadge, GateList, blockingReasons, READINESS_LABEL } from '../components/Readiness'
import PageHeader from '../components/PageHeader'
import SearchableSelect from '../components/SearchableSelect'
import { formatDate } from '../lib/format'
import { ArrowRight } from 'lucide-react'

const COLUMNS: { key: Readiness; hint: string }[] = [
  { key: 'blocked', hint: 'Something is missing — the red gate says what' },
  { key: 'ready', hint: 'Every gate is clear; pick a date' },
  { key: 'scheduled', hint: 'Date set, waiting for the day' },
  { key: 'in_progress', hint: 'Installers on site or finishing up' },
]

export default function Greenlight() {
  const [rows, setRows] = useState<JobReadiness[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [clientFilter, setClientFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('job_readiness').select('*').neq('readiness', 'done').order('scheduled_date', { ascending: true, nullsFirst: false }),
      supabase.from('mock_cl_companies').select('*').order('name'),
      supabase.from('mock_cl_locations').select('*'),
    ]).then(([r, c, l]) => {
      setRows((r.data as JobReadiness[]) ?? [])
      setCompanies((c.data as Company[]) ?? [])
      setLocations((l.data as unknown as Location[]) ?? [])
      setLoading(false)
    })
  }, [])

  const companyName = useMemo(() => new Map(companies.map(c => [c.id, c.name])), [companies])
  const locationName = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations])
  const clients = companies.filter(c => c.status === 'client')

  const visible = clientFilter ? rows.filter(r => r.client_id === clientFilter) : rows
  const byColumn = (key: Readiness) => visible.filter(r => r.readiness === key)

  return (
    <div className="p-6">
      <PageHeader title="Greenlight">
        <SearchableSelect
          options={clients.map(c => ({ value: c.id, label: c.name }))}
          value={clientFilter}
          onChange={setClientFilter}
          placeholder="All clients"
          className="w-56"
        />
      </PageHeader>
      <p className="text-[13px] text-neutral-500 -mt-2 mb-5">
        Every open job, by what stands between it and an installer on site. Red gates block scheduling; amber gates are things to chase.
      </p>

      {loading ? (
        <div className="text-[13px] text-neutral-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-4 gap-4 items-start">
          {COLUMNS.map(col => {
            const jobs = byColumn(col.key)
            return (
              <section key={col.key} className="min-w-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <ReadinessBadge readiness={col.key} />
                    <span className="text-[12px] font-mono text-neutral-500">{jobs.length}</span>
                  </div>
                </div>
                <div className="text-[11px] text-neutral-400 px-1 mb-2">{col.hint}</div>
                <div className="space-y-2">
                  {jobs.length === 0 && (
                    <div className="border border-dashed border-neutral-200 rounded-xl p-4 text-center text-[12px] text-neutral-400">
                      Nothing {READINESS_LABEL[col.key].toLowerCase()}
                    </div>
                  )}
                  {jobs.map(r => {
                    const reasons = blockingReasons(r)
                    return (
                      <Link
                        key={r.job_id}
                        to={`/jobs/${r.job_id}`}
                        className="block bg-neutral-0 border border-neutral-200 rounded-xl p-3 hover:border-neutral-300 hover:shadow-sm transition-all duration-120 animate-rise"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-[13px] font-semibold text-neutral-900">{r.job_number}</span>
                          <JobTypeBadge type={r.job_type} />
                        </div>
                        <div className="text-[12px] text-neutral-700 truncate">{companyName.get(r.client_id) ?? '—'}</div>
                        <div className="text-[11px] text-neutral-500 truncate mb-2">{locationName.get(r.location_id) ?? '—'}</div>
                        {col.key === 'blocked' ? (
                          <ul className="space-y-1">
                            {reasons.map((reason, i) => (
                              <li key={i} className="text-[11px] text-danger-700 leading-snug">{reason}</li>
                            ))}
                          </ul>
                        ) : (
                          <GateList readiness={r} compact />
                        )}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-500">
                          <span>{r.scheduled_date ? `Scheduled ${formatDate(r.scheduled_date)}` : 'No date'}</span>
                          <span className="inline-flex items-center gap-1 text-brand-500">Open <ArrowRight size={11} /></span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
