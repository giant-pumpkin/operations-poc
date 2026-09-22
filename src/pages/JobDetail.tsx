import { Fragment, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase, BOSS_PROFILE_ID } from '../lib/supabase'
import type {
  Job, JobItem, JobAssignee, InventoryItem, Product, Location, Profile,
  ItemStatus, MovementType, JobStatus,
} from '../lib/types'
import { JobStatusBadge, JobTypeBadge, DirectionBadge, StatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import MovementDateInput from '../components/MovementDateInput'
import { activateWarrantyIfNeeded } from '../lib/warranty'
import { ArrowLeft, ChevronDown, ChevronRight, Plus, X, Pencil, Check, Trash2 } from 'lucide-react'

const REASON_OPTIONS = [
  { value: 'defect', label: 'Defect — needs repair' },
  { value: 'de_installation', label: 'De-installation — client no longer needs it' },
  { value: 'swap', label: 'Swap — being replaced' },
  { value: 'end_of_contract', label: 'End of contract' },
]

const DIRECTION_OPTIONS = [
  { value: 'outbound', label: 'Outbound — to site' },
  { value: 'inbound', label: 'Inbound — from site' },
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

export default function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [job, setJob] = useState<Job | null>(null)
  const [jobItems, setJobItems] = useState<JobItem[]>([])
  const [assignees, setAssignees] = useState<JobAssignee[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)

  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set())

  // status transitions
  const [scheduling, setScheduling] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [statusUpdating, setStatusUpdating] = useState(false)

  // add job item
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItemProductId, setNewItemProductId] = useState('')
  const [newItemDirection, setNewItemDirection] = useState<'outbound' | 'inbound'>('outbound')
  const [newItemQty, setNewItemQty] = useState('1')
  const [addingItem, setAddingItem] = useState(false)

  // edit job item
  const [editingItemId, setEditingItemId] = useState('')
  const [editProductId, setEditProductId] = useState('')
  const [editDirection, setEditDirection] = useState<'outbound' | 'inbound'>('outbound')
  const [editQty, setEditQty] = useState('')
  const [savingItem, setSavingItem] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState('')

  // serial / quantity entry
  const [entryJobItemId, setEntryJobItemId] = useState('')
  const [entrySerialItemId, setEntrySerialItemId] = useState('')
  const [entryQty, setEntryQty] = useState('')
  const [entryWarehouseId, setEntryWarehouseId] = useState('')
  const [entryReason, setEntryReason] = useState('')
  const [entryMovementDate, setEntryMovementDate] = useState('')
  const [entrySubmitting, setEntrySubmitting] = useState(false)
  const [eligibleItems, setEligibleItems] = useState<InventoryItem[]>([])

  // assignees
  const [addAssigneeProfileId, setAddAssigneeProfileId] = useState('')
  const [addAssigneeRole, setAddAssigneeRole] = useState<'lead' | 'member'>('member')
  const [addingAssignee, setAddingAssignee] = useState(false)

  // notes
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    fetchJob()
  }, [id])

  async function fetchJob() {
    setLoading(true)
    const [jobRes, itemsRes, assigneesRes, profilesRes, productsRes, warehousesRes] = await Promise.all([
      supabase
        .from('job_jobs')
        .select('*, client:mock_cl_companies!job_jobs_client_id_fkey(id,name), location:mock_cl_locations(id,name,type), partner:mock_cl_companies!job_jobs_partner_id_fkey(id,name)')
        .eq('id', id)
        .single(),
      supabase
        .from('job_items')
        .select('*, product:inv_product_registry(id,name,sku,tracking_type), serials:job_item_serials(id,job_item_id,inventory_item_id,entered_at,inventory_item:inv_inventory_item(id,serial_number))')
        .eq('job_id', id)
        .order('created_at'),
      supabase.from('job_assignees').select('*, profile:mock_plat_profiles(id,full_name,email)').eq('job_id', id),
      supabase.from('mock_plat_profiles').select('*').order('full_name'),
      supabase.from('inv_product_registry').select('*').eq('active', true).order('name'),
      supabase.from('mock_cl_locations').select('*').eq('type', 'warehouse').order('name'),
    ])
    if (jobRes.data) {
      setJob(jobRes.data as unknown as Job)
      setNotesValue((jobRes.data as any).notes ?? '')
    }
    if (itemsRes.data) setJobItems(itemsRes.data as unknown as JobItem[])
    if (assigneesRes.data) setAssignees(assigneesRes.data as unknown as JobAssignee[])
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[])
    if (productsRes.data) setProducts(productsRes.data as Product[])
    if (warehousesRes.data) setWarehouses(warehousesRes.data as unknown as Location[])
    setLoading(false)
  }

  const entryJobItem = jobItems.find(i => i.id === entryJobItemId) ?? null
  const entryProduct = entryJobItem?.product as unknown as Product | undefined
  const isSerialTracked = entryProduct?.tracking_type === 'serial_tracked'

  useEffect(() => {
    setEntrySerialItemId('')
    setEntryQty('')
    setEntryWarehouseId('')
    setEntryReason('')
  }, [entryJobItemId])

  useEffect(() => {
    if (!entryJobItem || !isSerialTracked || !job) {
      setEligibleItems([])
      return
    }
    const direction = entryJobItem.direction
    let query = supabase
      .from('inv_inventory_item')
      .select('*, product:inv_product_registry(id,name,sku), location:mock_cl_locations(id,name,type)')
      .eq('product_id', entryJobItem.product_id)

    if (direction === 'outbound') {
      query = query.in('status', ['available', 'scheduled'])
    } else {
      query = query.eq('status', 'installed').eq('location_id', job.location_id)
    }

    query.then(({ data }) => {
      let items = (data as unknown as InventoryItem[]) ?? []
      if (direction === 'outbound') {
        items = items.filter(i => (i.location as any)?.type === 'warehouse')
      }
      setEligibleItems(items)
    })
  }, [entryJobItemId, job?.location_id])

  function toggleExpand(itemId: string) {
    setExpandedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  async function updateJobStatus(newStatus: JobStatus, extra: Partial<Job> = {}) {
    if (!job) return
    setStatusUpdating(true)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('job_jobs')
        .update({ status: newStatus, updated_at: now, ...extra })
        .eq('id', job.id)
      if (error) throw error
      toast('success', `Job ${formatLabel(newStatus)}`)
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to update status')
    } finally {
      setStatusUpdating(false)
    }
  }

  function handleSchedule() {
    if (!scheduleDate) {
      toast('error', 'Please select a date')
      return
    }
    updateJobStatus('scheduled', { scheduled_date: new Date(scheduleDate).toISOString() })
    setScheduling(false)
    setScheduleDate('')
  }

  async function handleAddItem() {
    if (!newItemProductId || !newItemQty || Number(newItemQty) <= 0) {
      toast('error', 'Please fill in all fields')
      return
    }
    setAddingItem(true)
    try {
      const { error } = await supabase.from('job_items').insert({
        job_id: id,
        product_id: newItemProductId,
        direction: newItemDirection,
        planned_quantity: Number(newItemQty),
      })
      if (error) throw error
      toast('success', 'Item added')
      setShowAddItem(false)
      setNewItemProductId('')
      setNewItemDirection('outbound')
      setNewItemQty('1')
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to add item')
    } finally {
      setAddingItem(false)
    }
  }

  function startEditItem(item: JobItem) {
    setEditingItemId(item.id)
    setEditProductId(item.product_id)
    setEditDirection(item.direction)
    setEditQty(String(item.planned_quantity))
  }

  function cancelEditItem() {
    setEditingItemId('')
  }

  async function handleSaveItem(item: JobItem) {
    const qty = Number(editQty)
    if (!qty || qty <= 0) {
      toast('error', 'Enter a valid quantity')
      return
    }
    if (qty < item.fulfilled_quantity) {
      toast('error', `Planned quantity cannot be less than fulfilled (${item.fulfilled_quantity})`)
      return
    }
    setSavingItem(true)
    try {
      const newStatus = item.fulfilled_quantity >= qty ? 'fulfilled' : item.fulfilled_quantity > 0 ? 'partial' : 'planned'
      const updates: Record<string, unknown> = { planned_quantity: qty, status: newStatus }
      if (item.fulfilled_quantity === 0) {
        updates.product_id = editProductId
        updates.direction = editDirection
      }
      const { error } = await supabase.from('job_items').update(updates).eq('id', item.id)
      if (error) throw error
      toast('success', 'Item updated')
      setEditingItemId('')
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to update item')
    } finally {
      setSavingItem(false)
    }
  }

  async function handleDeleteItem(item: JobItem) {
    if (item.fulfilled_quantity > 0) return
    setDeletingItemId(item.id)
    try {
      const { error } = await supabase.from('job_items').delete().eq('id', item.id)
      if (error) throw error
      toast('success', 'Item removed')
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to remove item')
    } finally {
      setDeletingItemId('')
    }
  }

  const entryDisabledReason = (() => {
    if (!job) return 'Loading…'
    if (!(job.status === 'in_progress' || job.status === 'incomplete')) return 'Job must be in progress'
    if (!entryJobItem) return 'Select a job item'
    if (isSerialTracked) {
      if (!entrySerialItemId) return 'Select a serial number'
      if (entryJobItem.direction === 'inbound' && !entryWarehouseId) return 'Select a destination warehouse'
      if (entryJobItem.direction === 'inbound' && !entryReason) return 'Select a condition'
    } else {
      if (!entryWarehouseId) return entryJobItem.direction === 'outbound' ? 'Select a source warehouse' : 'Select a destination warehouse'
      if (!entryQty || Number(entryQty) <= 0) return 'Enter a quantity'
      const remaining = entryJobItem.planned_quantity - entryJobItem.fulfilled_quantity
      if (Number(entryQty) > remaining) return `Quantity exceeds remaining (${remaining})`
    }
    if (!entryMovementDate) return 'Enter a movement date'
    return null
  })()

  async function handleSerialEntry() {
    if (!job || !entryJobItem || entryDisabledReason) return
    const movementTime = new Date(entryMovementDate)
    if (movementTime > new Date()) {
      toast('error', 'Movement date cannot be in the future')
      return
    }
    setEntrySubmitting(true)
    try {
      const now = new Date().toISOString()
      const direction = entryJobItem.direction

      // Re-validate the item against the DB — the dropdown may be stale
      const { data: item, error: itemFetchErr } = await supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(id,name,sku), location:mock_cl_locations(id,name,type)')
        .eq('id', entrySerialItemId)
        .single()
      if (itemFetchErr || !item) throw new Error('Item no longer exists')
      const itemLocType = (item.location as any)?.type
      if (direction === 'outbound') {
        if (!['available', 'scheduled'].includes(item.status) || itemLocType !== 'warehouse') {
          throw new Error(`${item.serial_number} is no longer available at a warehouse (now ${formatLabel(item.status)})`)
        }
      } else if (item.status !== 'installed' || item.location_id !== job.location_id) {
        throw new Error(`${item.serial_number} is no longer installed at this site`)
      }

      const { count: existingLinks } = await supabase
        .from('job_item_serials')
        .select('id', { count: 'exact', head: true })
        .eq('job_item_id', entryJobItem.id)
        .eq('inventory_item_id', item.id)
      if (existingLinks && existingLinks > 0) throw new Error(`${item.serial_number} is already linked to this job item`)

      const { data: freshJobItem, error: jiErr } = await supabase
        .from('job_items')
        .select('planned_quantity, fulfilled_quantity')
        .eq('id', entryJobItem.id)
        .single()
      if (jiErr || !freshJobItem) throw new Error('Job item no longer exists')
      if (freshJobItem.fulfilled_quantity >= freshJobItem.planned_quantity) {
        throw new Error('This job item is already fully fulfilled')
      }

      const movementType: MovementType = direction === 'outbound' ? 'transfer' : 'return'
      const fromLocation = direction === 'outbound' ? item.location_id : job.location_id
      const toLocation = direction === 'outbound' ? job.location_id : entryWarehouseId
      const newStatus: ItemStatus = direction === 'outbound'
        ? 'installed'
        : (entryReason === 'defect' ? 'defect' : 'available')

      const { error: serialErr } = await supabase.from('job_item_serials').insert({
        job_item_id: entryJobItem.id,
        inventory_item_id: item.id,
        entered_at: now,
      })
      if (serialErr) throw serialErr

      const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
        product_id: item.product_id,
        inventory_item_id: item.id,
        from_location: fromLocation,
        to_location: toLocation,
        performed_by: BOSS_PROFILE_ID,
        movement_type: movementType,
        quantity: 1,
        movement_time: movementTime.toISOString(),
        notes: `Job ${job.job_number}${direction === 'inbound' ? ` — ${entryReason.replace(/_/g, ' ')}` : ''}`,
      })
      if (moveErr) throw moveErr

      const { error: updateErr } = await supabase
        .from('inv_inventory_item')
        .update({ status: newStatus, location_id: toLocation, updated_at: now })
        .eq('id', item.id)
      if (updateErr) throw updateErr

      if (newStatus === 'installed') {
        await activateWarrantyIfNeeded(item.id)
      }

      const newFulfilled = freshJobItem.fulfilled_quantity + 1
      const newItemStatus = newFulfilled >= freshJobItem.planned_quantity ? 'fulfilled' : 'partial'
      const { error: itemErr } = await supabase
        .from('job_items')
        .update({ fulfilled_quantity: newFulfilled, status: newItemStatus })
        .eq('id', entryJobItem.id)
      if (itemErr) throw itemErr

      const fromName = direction === 'outbound' ? (item.location as any)?.name : job.location?.name
      const toName = direction === 'outbound' ? job.location?.name : warehouses.find(w => w.id === toLocation)?.name
      toast('success', `Serial ${item.serial_number} linked to ${entryProduct?.name}. Inventory updated: ${fromName ?? '—'} → ${toName ?? '—'}`)

      setEntryJobItemId('')
      setEntryMovementDate('')
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to link serial')
    } finally {
      setEntrySubmitting(false)
    }
  }

  async function handleQuantityEntry() {
    if (!job || !entryJobItem || entryDisabledReason) return
    const movementTime = new Date(entryMovementDate)
    if (movementTime > new Date()) {
      toast('error', 'Movement date cannot be in the future')
      return
    }
    const qty = Number(entryQty)
    setEntrySubmitting(true)
    try {
      const now = new Date().toISOString()
      const direction = entryJobItem.direction
      const fromLocation = direction === 'outbound' ? entryWarehouseId : job.location_id
      const toLocation = direction === 'outbound' ? job.location_id : entryWarehouseId
      const clientId = job.client_id

      const { data: freshJobItem, error: jiErr } = await supabase
        .from('job_items')
        .select('planned_quantity, fulfilled_quantity')
        .eq('id', entryJobItem.id)
        .single()
      if (jiErr || !freshJobItem) throw new Error('Job item no longer exists')
      const remaining = freshJobItem.planned_quantity - freshJobItem.fulfilled_quantity
      if (qty > remaining) throw new Error(`Only ${remaining} remaining on this job item`)

      // Resolve the pool: client-allocated first, then unallocated (outbound only)
      let stockQuery = supabase
        .from('inv_warehouse_stock')
        .select('id, quantity')
        .eq('product_id', entryJobItem.product_id)
        .eq('location_id', entryWarehouseId)
        .eq('designation', 'deployment')
      if (clientId) stockQuery = stockQuery.eq('allocated_client_id', clientId)
      else stockQuery = stockQuery.is('allocated_client_id', null)
      const { data: clientStock, error: stockErr } = await stockQuery.maybeSingle()
      if (stockErr) throw stockErr
      let stock = clientStock

      if (!stock && clientId && direction === 'outbound') {
        const { data: unalloc, error: unallocErr } = await supabase
          .from('inv_warehouse_stock')
          .select('id, quantity')
          .eq('product_id', entryJobItem.product_id)
          .eq('location_id', entryWarehouseId)
          .eq('designation', 'deployment')
          .is('allocated_client_id', null)
          .maybeSingle()
        if (unallocErr) throw unallocErr
        stock = unalloc
      }

      if (direction === 'outbound') {
        if (!stock) throw new Error('No stock pool found for this product at the selected warehouse')
        if (qty > stock.quantity) throw new Error(`Insufficient stock: only ${stock.quantity} available`)
      }

      const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
        product_id: entryJobItem.product_id,
        inventory_item_id: null,
        from_location: fromLocation,
        to_location: toLocation,
        performed_by: BOSS_PROFILE_ID,
        movement_type: direction === 'outbound' ? 'transfer' : 'return',
        quantity: qty,
        movement_time: movementTime.toISOString(),
        notes: `Job ${job.job_number}`,
      })
      if (moveErr) throw moveErr

      if (direction === 'outbound') {
        const { error: decErr } = await supabase
          .from('inv_warehouse_stock')
          .update({ quantity: stock!.quantity - qty, updated_at: now })
          .eq('id', stock!.id)
        if (decErr) throw decErr
      } else if (stock) {
        const { error: incErr } = await supabase
          .from('inv_warehouse_stock')
          .update({ quantity: stock.quantity + qty, updated_at: now })
          .eq('id', stock.id)
        if (incErr) throw incErr
      } else {
        const { error: insErr } = await supabase.from('inv_warehouse_stock').insert({
          product_id: entryJobItem.product_id,
          location_id: entryWarehouseId,
          allocated_client_id: clientId || null,
          designation: 'deployment',
          quantity: qty,
        })
        if (insErr) throw insErr
      }

      const newFulfilled = freshJobItem.fulfilled_quantity + qty
      const newItemStatus = newFulfilled >= freshJobItem.planned_quantity ? 'fulfilled' : 'partial'
      const { error: fulfillErr } = await supabase
        .from('job_items')
        .update({ fulfilled_quantity: newFulfilled, status: newItemStatus })
        .eq('id', entryJobItem.id)
      if (fulfillErr) throw fulfillErr

      toast('success', `Recorded ${qty}× ${entryProduct?.name} for ${job.job_number}`)
      setEntryJobItemId('')
      setEntryMovementDate('')
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to record quantity')
    } finally {
      setEntrySubmitting(false)
    }
  }

  function handleEntrySubmit() {
    if (isSerialTracked) handleSerialEntry()
    else handleQuantityEntry()
  }

  async function handleAddAssignee() {
    if (!addAssigneeProfileId) return
    setAddingAssignee(true)
    try {
      const { error } = await supabase.from('job_assignees').insert({
        job_id: id,
        profile_id: addAssigneeProfileId,
        role: addAssigneeRole,
      })
      if (error) throw error
      setAddAssigneeProfileId('')
      setAddAssigneeRole('member')
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to add assignee')
    } finally {
      setAddingAssignee(false)
    }
  }

  async function handleRemoveAssignee(assigneeId: string) {
    const { error } = await supabase.from('job_assignees').delete().eq('id', assigneeId)
    if (error) {
      toast('error', error.message)
      return
    }
    fetchJob()
  }

  async function saveNotes() {
    if (!job) return
    setSavingNotes(true)
    try {
      const { error } = await supabase
        .from('job_jobs')
        .update({ notes: notesValue.trim() || null, updated_at: new Date().toISOString() })
        .eq('id', job.id)
      if (error) throw error
      setEditingNotes(false)
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-[13px] text-neutral-400">Loading…</div>
  }

  if (!job) {
    return <div className="p-6 text-[13px] text-neutral-400">Job not found</div>
  }

  const assignedProfileIds = new Set(assignees.map(a => a.profile_id))
  const availableProfiles = profiles.filter(p => !assignedProfileIds.has(p.id))
  const fulfillableItems = jobItems.filter(i => i.status !== 'fulfilled')
  const canEnter = job.status === 'in_progress' || job.status === 'incomplete'

  return (
    <div className="p-6 max-w-4xl">
      <Link to="/jobs" className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-800 mb-3 transition-colors">
        <ArrowLeft size={14} /> Jobs
      </Link>

      {/* Header */}
      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-neutral-900 font-mono">{job.job_number}</h1>
              <JobTypeBadge type={job.job_type} />
              <JobStatusBadge status={job.status} />
            </div>
            <div className="flex items-center gap-4 text-[13px] text-neutral-600">
              <span>{job.client?.name ?? '—'}</span>
              <span>{job.location?.name ?? '—'}</span>
              {job.partner && <span>Partner: {job.partner.name}</span>}
            </div>
            <div className="flex items-center gap-4 text-[12px] text-neutral-400 mt-1">
              <span>Scheduled: {formatDate(job.scheduled_date)}</span>
              <span>Completed: {formatDate(job.completed_date)}</span>
              <span>Closed: {formatDate(job.closed_date)}</span>
            </div>
          </div>
        </div>

        {/* Status controls */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-neutral-100">
          {job.status === 'tentative' && (
            scheduling ? (
              <>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button onClick={handleSchedule} disabled={statusUpdating} className="h-9 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40">
                  Confirm
                </button>
                <button onClick={() => { setScheduling(false); setScheduleDate('') }} className="h-9 px-3 rounded-lg border border-neutral-200 text-[13px] text-neutral-600 hover:bg-neutral-50">
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setScheduling(true)} className="h-9 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800">
                Schedule
              </button>
            )
          )}
          {job.status === 'scheduled' && (
            <button onClick={() => updateJobStatus('in_progress')} disabled={statusUpdating} className="h-9 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40">
              Start
            </button>
          )}
          {job.status === 'in_progress' && (
            <>
              <button onClick={() => updateJobStatus('completed', { completed_date: new Date().toISOString() })} disabled={statusUpdating} className="h-9 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40">
                Complete
              </button>
              <button onClick={() => updateJobStatus('incomplete')} disabled={statusUpdating} className="h-9 px-3 rounded-lg border border-neutral-200 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">
                Mark Incomplete
              </button>
            </>
          )}
          {job.status === 'completed' && (
            <button onClick={() => updateJobStatus('closed', { closed_date: new Date().toISOString() })} disabled={statusUpdating} className="h-9 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40">
              Close
            </button>
          )}
          {job.status === 'incomplete' && (
            <>
              <button onClick={() => updateJobStatus('in_progress')} disabled={statusUpdating} className="h-9 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40">
                Resume
              </button>
              <button onClick={() => updateJobStatus('closed', { closed_date: new Date().toISOString() })} disabled={statusUpdating} className="h-9 px-3 rounded-lg border border-neutral-200 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">
                Close as Incomplete
              </button>
            </>
          )}
          {!['closed', 'cancelled'].includes(job.status) && (
            <button onClick={() => updateJobStatus('cancelled')} disabled={statusUpdating} className="h-9 px-3 rounded-lg border border-danger-200 text-[13px] font-medium text-danger-600 hover:bg-danger-50 disabled:opacity-40 ml-auto">
              Cancel Job
            </button>
          )}
        </div>
      </div>

      {/* Job Items */}
      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-neutral-800">Job Items</h2>
          <button
            onClick={() => setShowAddItem(v => !v)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-neutral-200 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <Plus size={13} /> Add Item
          </button>
        </div>

        {showAddItem && (
          <div className="flex items-end gap-2 mb-4 p-3 bg-neutral-50 rounded-lg">
            <div className="flex-1">
              <label className="block text-[11px] text-neutral-500 mb-1">Product</label>
              <SearchableSelect
                options={products.map(p => ({ value: p.id, label: p.name, sublabel: p.sku }))}
                value={newItemProductId}
                onChange={setNewItemProductId}
                placeholder="Select product…"
              />
            </div>
            <div className="w-44">
              <label className="block text-[11px] text-neutral-500 mb-1">Direction</label>
              <SearchableSelect
                options={DIRECTION_OPTIONS}
                value={newItemDirection}
                onChange={v => setNewItemDirection(v as 'outbound' | 'inbound')}
                placeholder="Select…"
              />
            </div>
            <div className="w-24">
              <label className="block text-[11px] text-neutral-500 mb-1">Qty</label>
              <input
                type="text"
                inputMode="numeric"
                value={newItemQty}
                onChange={e => setNewItemQty(e.target.value.replace(/\D/g, ''))}
                className="w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={handleAddItem}
              disabled={addingItem}
              className="h-10 px-4 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}

        {jobItems.length === 0 ? (
          <p className="text-[12px] text-neutral-400">No items on this job</p>
        ) : (
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '28px' }} />
              <col style={{ width: '32%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '80px' }} />
            </colgroup>
            <thead>
              <tr className="bg-neutral-50 text-[11px] uppercase tracking-[0.06em] text-neutral-500">
                <th className="w-8" />
                <th className="text-left px-3 py-2 font-medium">Product</th>
                <th className="text-left px-3 py-2 font-medium">Direction</th>
                <th className="text-right px-3 py-2 font-medium">Planned</th>
                <th className="text-right px-3 py-2 font-medium">Fulfilled</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {jobItems.map(item => {
                const product = item.product as unknown as Product | undefined
                const expanded = expandedItemIds.has(item.id)
                const serials = item.serials ?? []
                const isEditing = editingItemId === item.id
                const locked = item.fulfilled_quantity > 0

                if (isEditing) {
                  return (
                    <tr key={item.id} className="border-t border-neutral-100 bg-neutral-25">
                      <td />
                      <td className="px-3 py-2">
                        <SearchableSelect
                          options={products.map(p => ({ value: p.id, label: p.name, sublabel: p.sku }))}
                          value={editProductId}
                          onChange={setEditProductId}
                          disabled={locked}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <SearchableSelect
                          options={DIRECTION_OPTIONS}
                          value={editDirection}
                          onChange={v => setEditDirection(v as 'outbound' | 'inbound')}
                          disabled={locked}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editQty}
                          onChange={e => setEditQty(e.target.value.replace(/\D/g, ''))}
                          className="w-20 h-10 px-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-[12px] font-mono text-neutral-700 text-right">{item.fulfilled_quantity}</td>
                      <td className="px-3 py-2 text-[11px] text-neutral-400">{formatLabel(item.status)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleSaveItem(item)}
                            disabled={savingItem}
                            className="p-1.5 rounded-md text-brand-500 hover:bg-brand-50 disabled:opacity-40"
                          >
                            <Check size={14} />
                          </button>
                          <button onClick={cancelEditItem} className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-100">
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <Fragment key={item.id}>
                    <tr className="border-t border-neutral-100 hover:bg-neutral-25">
                      <td className="px-2 py-2 text-neutral-400 cursor-pointer" onClick={() => toggleExpand(item.id)}>
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-neutral-800 cursor-pointer" onClick={() => toggleExpand(item.id)}>{product?.name ?? '—'}</td>
                      <td className="px-3 py-2 cursor-pointer" onClick={() => toggleExpand(item.id)}><DirectionBadge direction={item.direction} /></td>
                      <td className="px-3 py-2 text-[12px] font-mono text-neutral-700 text-right cursor-pointer" onClick={() => toggleExpand(item.id)}>{item.planned_quantity}</td>
                      <td className="px-3 py-2 text-[12px] font-mono text-neutral-700 text-right cursor-pointer" onClick={() => toggleExpand(item.id)}>{item.fulfilled_quantity}</td>
                      <td className="px-3 py-2 text-[11px] cursor-pointer" onClick={() => toggleExpand(item.id)}>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 font-medium">
                          {formatLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditItem(item)}
                            className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                          >
                            <Pencil size={13} />
                          </button>
                          <div className="relative group">
                            <button
                              onClick={() => handleDeleteItem(item)}
                              disabled={locked || deletingItemId === item.id}
                              className="p-1.5 rounded-md text-neutral-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                            >
                              <Trash2 size={13} />
                            </button>
                            {locked && (
                              <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg bg-[#2b2b2e] text-neutral-0 text-[12px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-lg">
                                Can't remove — {item.fulfilled_quantity} already fulfilled
                                <div className="absolute top-full right-4 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-[#2b2b2e]" />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-t border-neutral-100 bg-neutral-25">
                        <td />
                        <td colSpan={6} className="px-3 py-2">
                          {serials.length === 0 ? (
                            <p className="text-[12px] text-neutral-400">No serials linked yet</p>
                          ) : (
                            <div className="space-y-1">
                              {serials.map(s => (
                                <div key={s.id} className="flex items-center gap-3 text-[12px]">
                                  <span className="font-mono text-neutral-700">{(s.inventory_item as any)?.serial_number}</span>
                                  <span className="text-neutral-400">{formatDate(s.entered_at)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Serial / Quantity Entry */}
      {canEnter && (
        <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5 mb-5 space-y-4">
          <h2 className="text-[14px] font-semibold text-neutral-800">Enter Fulfillment</h2>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Job Item</label>
            <SearchableSelect
              options={fulfillableItems.map(i => ({
                value: i.id,
                label: `${(i.product as any)?.name ?? '—'} · ${formatLabel(i.direction)}`,
                sublabel: `${i.fulfilled_quantity}/${i.planned_quantity}`,
              }))}
              value={entryJobItemId}
              onChange={setEntryJobItemId}
              placeholder="Select a job item…"
            />
          </div>

          {entryJobItem && isSerialTracked && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Serial Number</label>
              <SearchableSelect
                options={eligibleItems.map(i => ({
                  value: i.id,
                  label: i.serial_number,
                  sublabel: (i.location as any)?.name,
                }))}
                value={entrySerialItemId}
                onChange={setEntrySerialItemId}
                placeholder={eligibleItems.length === 0 ? 'No eligible items' : 'Select serial…'}
                disabled={eligibleItems.length === 0}
              />
            </div>
          )}

          {entryJobItem && !isSerialTracked && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  {entryJobItem.direction === 'outbound' ? 'Source Warehouse' : 'Destination Warehouse'}
                </label>
                <SearchableSelect
                  options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                  value={entryWarehouseId}
                  onChange={setEntryWarehouseId}
                  placeholder="Select warehouse…"
                />
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Qty <span className="text-neutral-400 font-normal">(max {entryJobItem.planned_quantity - entryJobItem.fulfilled_quantity})</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={entryQty}
                  onChange={e => setEntryQty(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}

          {entryJobItem && isSerialTracked && entryJobItem.direction === 'inbound' && (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Destination Warehouse</label>
                <SearchableSelect
                  options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                  value={entryWarehouseId}
                  onChange={setEntryWarehouseId}
                  placeholder="Select warehouse…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Condition</label>
                <SearchableSelect
                  options={REASON_OPTIONS}
                  value={entryReason}
                  onChange={setEntryReason}
                  placeholder="Select condition…"
                />
              </div>
            </>
          )}

          {entryJobItem && (
            <MovementDateInput value={entryMovementDate} onChange={setEntryMovementDate} />
          )}

          <div className="relative w-fit group">
            <button
              onClick={handleEntrySubmit}
              disabled={entrySubmitting || entryDisabledReason !== null}
              className="h-10 px-5 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-120"
            >
              {entrySubmitting ? 'Submitting…' : isSerialTracked ? 'Link Serial' : 'Record Quantity'}
            </button>
            {entryDisabledReason && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-[#2b2b2e] text-neutral-0 text-[12px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-lg">
                {entryDisabledReason}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-[#2b2b2e]" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assignees */}
      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5 mb-5">
        <h2 className="text-[14px] font-semibold text-neutral-800 mb-3">Assignees</h2>
        {assignees.length === 0 ? (
          <p className="text-[12px] text-neutral-400 mb-3">No one assigned yet</p>
        ) : (
          <div className="space-y-2 mb-3">
            {assignees.map(a => (
              <div key={a.id} className="flex items-center justify-between p-2.5 bg-neutral-50 rounded-lg">
                <div className="flex items-center gap-2 text-[13px] text-neutral-800">
                  <span>{(a.profile as any)?.full_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${a.role === 'lead' ? 'bg-info-50 text-info-700' : 'bg-neutral-100 text-neutral-600'}`}>
                    {formatLabel(a.role)}
                  </span>
                </div>
                <button onClick={() => handleRemoveAssignee(a.id)} className="p-1 text-neutral-400 hover:text-danger-500">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <SearchableSelect
            options={availableProfiles.map(p => ({ value: p.id, label: p.full_name }))}
            value={addAssigneeProfileId}
            onChange={setAddAssigneeProfileId}
            placeholder="Select person…"
            className="flex-1"
          />
          <SearchableSelect
            options={[{ value: 'lead', label: 'Lead' }, { value: 'member', label: 'Member' }]}
            value={addAssigneeRole}
            onChange={v => setAddAssigneeRole(v as 'lead' | 'member')}
            placeholder="Role"
            className="w-32"
          />
          <button
            onClick={handleAddAssignee}
            disabled={addingAssignee || !addAssigneeProfileId}
            className="h-10 px-4 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[14px] font-semibold text-neutral-800">Notes</h2>
          {!editingNotes && (
            <button onClick={() => setEditingNotes(true)} className="text-neutral-400 hover:text-neutral-600">
              <Pencil size={13} />
            </button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
            />
            <div className="flex gap-2">
              <button onClick={saveNotes} disabled={savingNotes} className="h-8 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[12px] font-medium hover:bg-neutral-800 disabled:opacity-40 flex items-center gap-1">
                <Check size={13} /> Save
              </button>
              <button onClick={() => { setEditingNotes(false); setNotesValue(job.notes ?? '') }} className="h-8 px-3 rounded-lg border border-neutral-200 text-[12px] text-neutral-600 hover:bg-neutral-50">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-neutral-600 whitespace-pre-wrap">{job.notes || <span className="text-neutral-400 italic">No notes</span>}</p>
        )}
      </div>
    </div>
  )
}
