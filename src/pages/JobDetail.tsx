import { Fragment, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../lib/profile'
import type {
  Job, JobItem, JobAssignee, InventoryItem, Product, Location, Profile, JobStatus, Quote, Company,
} from '../lib/types'
import { JobStatusBadge, JobTypeBadge, DirectionBadge, QuoteStatusBadge, DepositBadge } from '../components/StatusBadge'
import { formatMoney } from '../lib/format'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import MovementDateInput from '../components/MovementDateInput'
import DateTimePicker from '../components/DateTimePicker'
import { ArrowLeft, ChevronDown, ChevronRight, Plus, X, Pencil, Check, Trash2, Link2, Unlink, Handshake, PackagePlus } from 'lucide-react'

type LinkedQuote = Quote & { lines: { id: string; quantity: number; unit_price: number; line_type: string }[]; linked_at: string }

interface SupplyRow {
  job_item_id: string
  product_id: string
  product_name: string
  tracking_type: 'serial_tracked' | 'quantity_only'
  planned_quantity: number
  fulfilled_quantity: number
  outstanding: number
  available_pool: number
  incoming: number
}

interface Receipt {
  id: string
  receipt_number: string
  po_reference: string | null
  expected_date: string | null
  status: 'ordered' | 'partially_received' | 'received' | 'cancelled'
  created_at: string
  supplier: { name: string } | null
  lines: { id: string; product_id: string; quantity_ordered: number; quantity_received: number; product: { name: string } | null }[]
}

const RECEIPT_STATUS_STYLE: Record<Receipt['status'], string> = {
  ordered: 'bg-info-50 text-info-700',
  partially_received: 'bg-warning-50 text-warning-700',
  received: 'bg-success-50 text-success-700',
  cancelled: 'bg-neutral-100 text-neutral-400',
}

function quoteTotal(q: { lines: { quantity: number; unit_price: number }[]; tax_rate: number }): number {
  const subtotal = q.lines.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0)
  return subtotal * (1 + Number(q.tax_rate) / 100)
}

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
  const { profileId: activeProfileId } = useProfile()

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

  // quotes
  const [linkedQuotes, setLinkedQuotes] = useState<LinkedQuote[]>([])
  const [linkableQuotes, setLinkableQuotes] = useState<LinkedQuote[]>([])
  const [linkQuoteId, setLinkQuoteId] = useState('')
  const [quoteBusy, setQuoteBusy] = useState(false)

  // stock supply + orders
  const [supply, setSupply] = useState<SupplyRow[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [suppliers, setSuppliers] = useState<Company[]>([])
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderSupplierId, setOrderSupplierId] = useState('')
  const [orderPoRef, setOrderPoRef] = useState('')
  const [orderEta, setOrderEta] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [orderQty, setOrderQty] = useState<Record<string, string>>({})
  const [orderBusy, setOrderBusy] = useState(false)

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
      const clientId = (jobRes.data as any).client_id as string
      const [linkedRes, allRes] = await Promise.all([
        supabase
          .from('job_quotes')
          .select('linked_at, quote:crm_quotes(*, lines:crm_quote_lines(id,quantity,unit_price,line_type))')
          .eq('job_id', id),
        supabase
          .from('crm_quotes')
          .select('*, lines:crm_quote_lines(id,quantity,unit_price,line_type)')
          .eq('client_id', clientId)
          .in('status', ['sent', 'signed'])
          .order('quote_number'),
      ])
      const linked = ((linkedRes.data ?? []) as any[])
        .filter(r => r.quote)
        .map(r => ({ ...r.quote, linked_at: r.linked_at })) as LinkedQuote[]
      setLinkedQuotes(linked)
      const linkedIds = new Set(linked.map(q => q.id))
      setLinkableQuotes(((allRes.data ?? []) as unknown as LinkedQuote[]).filter(q => !linkedIds.has(q.id)))

      const [supplyRes, receiptsRes, suppliersRes] = await Promise.all([
        supabase.from('job_item_supply').select('*').eq('job_id', id),
        supabase
          .from('inv_expected_receipts')
          .select('*, supplier:mock_cl_companies(name), lines:inv_expected_receipt_lines(id, product_id, quantity_ordered, quantity_received, product:inv_product_registry(name))')
          .eq('job_id', id)
          .order('created_at'),
        supabase.from('mock_cl_companies').select('*').eq('status', 'supplier').order('name'),
      ])
      setSupply((supplyRes.data as SupplyRow[]) ?? [])
      setReceipts((receiptsRes.data as unknown as Receipt[]) ?? [])
      setSuppliers((suppliersRes.data as Company[]) ?? [])
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
      query = query
        .in('status', ['available', 'scheduled'])
        .or(`allocated_client_id.eq.${job.client_id},allocated_client_id.is.null`)
    } else {
      query = query.in('status', ['installed', 'defect']).eq('location_id', job.location_id)
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
      // Only transition from the status this tab last saw, so a stale tab can't overwrite a newer one
      const { data: updated, error } = await supabase
        .from('job_jobs')
        .update({ status: newStatus, updated_at: now, ...extra })
        .eq('id', job.id)
        .eq('status', job.status)
        .select('id')
      if (error) throw error
      if (!updated || updated.length === 0) {
        toast('error', 'This job was changed elsewhere — reloaded with the latest status')
        fetchJob()
        return
      }
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

  const itemsLocked = !!job && ['closed', 'cancelled'].includes(job.status)
  const itemsLockedReason = itemsLocked ? `Items can't be changed on a ${formatLabel(job!.status).toLowerCase()} job` : null

  async function handleAddItem() {
    if (itemsLocked) return
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
    if (itemsLocked) return
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
    if (itemsLocked || item.fulfilled_quantity > 0) return
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
      const direction = entryJobItem.direction
      const item = eligibleItems.find(i => i.id === entrySerialItemId)

      const { error } = await supabase.rpc('link_job_serial', {
        p_job_item_id: entryJobItem.id,
        p_inventory_item_id: entrySerialItemId,
        p_movement_time: movementTime.toISOString(),
        p_performed_by: activeProfileId,
        p_dest_warehouse_id: direction === 'inbound' ? entryWarehouseId : null,
        p_condition: direction === 'inbound' ? entryReason : null,
      })
      if (error) throw error

      const fromName = direction === 'outbound' ? (item?.location as any)?.name : job.location?.name
      const toName = direction === 'outbound' ? job.location?.name : warehouses.find(w => w.id === entryWarehouseId)?.name
      toast('success', `Serial ${item?.serial_number ?? ''} linked to ${entryProduct?.name}. Inventory updated: ${fromName ?? '—'} → ${toName ?? '—'}`)

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
      const { error } = await supabase.rpc('fulfill_job_quantity', {
        p_job_item_id: entryJobItem.id,
        p_warehouse_id: entryWarehouseId,
        p_qty: qty,
        p_movement_time: movementTime.toISOString(),
        p_performed_by: activeProfileId,
      })
      if (error) throw error

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

  async function handleLinkQuote() {
    if (!job || !linkQuoteId) return
    setQuoteBusy(true)
    try {
      const { error } = await supabase.rpc('link_quote_to_job', { p_job_id: job.id, p_quote_id: linkQuoteId, p_profile: activeProfileId })
      if (error) throw error
      toast('success', 'Quote linked')
      setLinkQuoteId('')
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to link quote')
    } finally {
      setQuoteBusy(false)
    }
  }

  async function handleUnlinkQuote(quoteId: string) {
    if (!job) return
    setQuoteBusy(true)
    try {
      const { error } = await supabase.rpc('unlink_quote_from_job', { p_job_id: job.id, p_quote_id: quoteId })
      if (error) throw error
      toast('success', 'Quote unlinked')
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to unlink quote')
    } finally {
      setQuoteBusy(false)
    }
  }

  function openOrderForm() {
    const initial: Record<string, string> = {}
    for (const s of supply) initial[s.product_id] = String(Math.max(0, s.outstanding - s.available_pool - s.incoming))
    setOrderQty(initial)
    setOrderSupplierId(suppliers.length === 1 ? suppliers[0].id : '')
    setOrderPoRef('')
    setOrderEta('')
    setOrderNotes('')
    setShowOrderForm(true)
  }

  const orderDisabledReason = (() => {
    if (!orderSupplierId) return 'Select a supplier'
    if (!orderPoRef.trim()) return 'Enter the ApprovalMax PO reference'
    if (!supply.some(s => Number(orderQty[s.product_id] ?? '0') > 0)) return 'Enter a quantity for at least one product'
    return null
  })()

  async function handleCreateOrder() {
    if (!job || orderDisabledReason) return
    setOrderBusy(true)
    try {
      const lines = supply
        .map(s => ({ product_id: s.product_id, qty: Number(orderQty[s.product_id] ?? '0') }))
        .filter(l => l.qty > 0)
      const { error } = await supabase.rpc('create_expected_receipt', {
        p_job_id: job.id,
        p_supplier_id: orderSupplierId,
        p_po_reference: orderPoRef.trim(),
        p_expected_date: orderEta ? orderEta.slice(0, 10) : null,
        p_lines: lines,
        p_profile: activeProfileId,
        p_notes: orderNotes.trim() || null,
      })
      if (error) throw error
      toast('success', 'Stock order recorded')
      setShowOrderForm(false)
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to record order')
    } finally {
      setOrderBusy(false)
    }
  }

  async function handleCancelOrder(receiptId: string) {
    setOrderBusy(true)
    try {
      const { error } = await supabase.rpc('cancel_expected_receipt', { p_receipt_id: receiptId, p_profile: activeProfileId })
      if (error) throw error
      toast('success', 'Order cancelled')
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to cancel order')
    } finally {
      setOrderBusy(false)
    }
  }

  async function handleConfirmPartner(confirmed: boolean) {
    if (!job) return
    setStatusUpdating(true)
    try {
      const { error } = await supabase.rpc('confirm_job_partner', { p_job_id: job.id, p_profile: activeProfileId, p_confirmed: confirmed })
      if (error) throw error
      toast('success', confirmed ? 'Partner confirmed' : 'Partner confirmation cleared')
      fetchJob()
    } catch (err: any) {
      toast('error', err.message || 'Failed to update partner confirmation')
    } finally {
      setStatusUpdating(false)
    }
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

  const unfulfilledCount = jobItems.filter(i => i.status !== 'fulfilled').length
  const completeBlocker = unfulfilledCount > 0
    ? `${unfulfilledCount} item${unfulfilledCount === 1 ? '' : 's'} not yet fulfilled — use Mark Incomplete instead`
    : null
  const fulfilledAnything = jobItems.some(i => i.fulfilled_quantity > 0)
  const cancelBlocker = fulfilledAnything
    ? 'Inventory has already moved on this job — complete or mark it incomplete, then close'
    : null

  const tooltipClass = 'absolute bottom-full left-0 mb-2 px-3 py-1.5 rounded-lg bg-[#2b2b2e] text-neutral-0 text-[12px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-lg'
  const tooltipArrowClass = 'absolute top-full left-6 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-[#2b2b2e]'

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
                <DateTimePicker
                  value={scheduleDate}
                  onChange={setScheduleDate}
                  allowFuture
                  size="sm"
                  placeholder="Pick a date and time…"
                  className="w-64"
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
              <div className="relative group">
                <button onClick={() => updateJobStatus('completed', { completed_date: new Date().toISOString() })} disabled={statusUpdating || completeBlocker !== null} className="h-9 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed">
                  Complete
                </button>
                {completeBlocker && (
                  <div className={tooltipClass}>{completeBlocker}<div className={tooltipArrowClass} /></div>
                )}
              </div>
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
          {!['completed', 'closed', 'cancelled'].includes(job.status) && (
            job.partner_confirmed_at ? (
              <button onClick={() => handleConfirmPartner(false)} disabled={statusUpdating} className="h-9 px-3 rounded-lg border border-success-500/40 bg-success-50 text-[13px] font-medium text-success-700 hover:bg-success-50/70 disabled:opacity-40 inline-flex items-center gap-1.5" title="Click to clear">
                <Handshake size={14} /> Partner confirmed · {formatDate(job.partner_confirmed_at)}
              </button>
            ) : (
              <button onClick={() => handleConfirmPartner(true)} disabled={statusUpdating} className="h-9 px-3 rounded-lg border border-neutral-200 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 inline-flex items-center gap-1.5">
                <Handshake size={14} /> Confirm partner
              </button>
            )
          )}
          {!['completed', 'closed', 'cancelled'].includes(job.status) && (
            <div className="relative group ml-auto">
              <button onClick={() => updateJobStatus('cancelled')} disabled={statusUpdating || cancelBlocker !== null} className="h-9 px-3 rounded-lg border border-danger-200 text-[13px] font-medium text-danger-600 hover:bg-danger-50 disabled:opacity-40 disabled:cursor-not-allowed">
                Cancel Job
              </button>
              {cancelBlocker && (
                <div className={`${tooltipClass} left-auto right-0`}>{cancelBlocker}<div className={`${tooltipArrowClass} left-auto right-6`} /></div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quotes */}
      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5 mb-5">
        <h2 className="text-[14px] font-semibold text-neutral-800 mb-3">Quotes</h2>
        {linkedQuotes.length === 0 ? (
          <p className="text-[12px] text-neutral-400 mb-3">No quotes linked — a job usually has at least one signed quote behind it.</p>
        ) : (
          <div className="space-y-1.5 mb-3">
            {linkedQuotes.map(q => {
              const lineIds = new Set(q.lines.map(l => l.id))
              const derived = jobItems.some(i => i.quote_line_id && lineIds.has(i.quote_line_id))
              return (
                <div key={q.id} className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50">
                  <Link to={`/quotes/${q.id}`} className="flex items-center gap-2 text-[13px] min-w-0">
                    <span className="font-mono text-neutral-800">{q.quote_number} <span className="text-neutral-400">v{q.version}</span></span>
                    <QuoteStatusBadge status={q.status} />
                    <DepositBadge status={q.deposit_status} />
                    <span className="text-neutral-500 truncate">{q.title}</span>
                  </Link>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[12px] text-neutral-700">{formatMoney(quoteTotal(q), q.currency)}</span>
                    {!itemsLocked && (
                      <div className="relative group">
                        <button
                          onClick={() => handleUnlinkQuote(q.id)}
                          disabled={quoteBusy || derived}
                          className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent"
                          aria-label="Unlink quote"
                        >
                          <Unlink size={13} />
                        </button>
                        {derived && (
                          <div className={`${tooltipClass} left-auto right-0`}>Job items were created from this quote<div className={`${tooltipArrowClass} left-auto right-4`} /></div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {!itemsLocked && (
          <div className="flex items-center gap-2">
            <SearchableSelect
              options={linkableQuotes.map(q => ({
                value: q.id,
                label: `${q.quote_number} v${q.version}${q.title ? ` · ${q.title}` : ''}`,
                sublabel: `${q.status} · ${formatMoney(quoteTotal(q), q.currency)}`,
              }))}
              value={linkQuoteId}
              onChange={setLinkQuoteId}
              placeholder={linkableQuotes.length ? 'Link an existing quote for this client…' : 'No other sent/signed quotes for this client'}
              disabled={linkableQuotes.length === 0}
              className="flex-1"
            />
            <button
              onClick={handleLinkQuote}
              disabled={quoteBusy || !linkQuoteId}
              className="h-10 px-4 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Link2 size={14} /> Link
            </button>
          </div>
        )}
      </div>

      {/* Job Items */}
      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-neutral-800">Job Items</h2>
          <div className="relative group">
            <button
              onClick={() => setShowAddItem(v => !v)}
              disabled={itemsLocked}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-neutral-200 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <Plus size={13} /> Add Item
            </button>
            {itemsLockedReason && (
              <div className={`${tooltipClass} left-auto right-0`}>{itemsLockedReason}<div className={`${tooltipArrowClass} left-auto right-6`} /></div>
            )}
          </div>
        </div>

        {showAddItem && (
          <div className="flex items-end gap-2 mb-4 p-3 bg-neutral-50 rounded-lg animate-rise">
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
                            disabled={itemsLocked}
                            className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                          >
                            <Pencil size={13} />
                          </button>
                          <div className="relative group">
                            <button
                              onClick={() => handleDeleteItem(item)}
                              disabled={itemsLocked || locked || deletingItemId === item.id}
                              className="p-1.5 rounded-md text-neutral-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                            >
                              <Trash2 size={13} />
                            </button>
                            {(itemsLockedReason || locked) && (
                              <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg bg-[#2b2b2e] text-neutral-0 text-[12px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-lg">
                                {itemsLockedReason ?? `Can't remove — ${item.fulfilled_quantity} already fulfilled`}
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
                        <td colSpan={6} className="px-3 py-2 animate-fade-in">
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

      {/* Stock supply + orders */}
      {supply.length > 0 && (
        <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-semibold text-neutral-800">Stock for this job</h2>
            <div className="relative group">
              <button
                onClick={openOrderForm}
                disabled={itemsLocked}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-neutral-200 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PackagePlus size={13} /> Order stock
              </button>
              {itemsLockedReason && <div className={`${tooltipClass} left-auto right-0`}>{itemsLockedReason}</div>}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-[11px] uppercase tracking-[0.06em] text-neutral-500">
                <th className="text-left px-3 py-2 font-medium">Product</th>
                <th className="text-right px-3 py-2 font-medium">Still needed</th>
                <th className="text-right px-3 py-2 font-medium">In client pool</th>
                <th className="text-right px-3 py-2 font-medium">On order</th>
                <th className="text-right px-3 py-2 font-medium">Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {supply.map(s => {
                const shortfall = Math.max(0, s.outstanding - s.available_pool - s.incoming)
                const coveredByIncoming = shortfall === 0 && s.outstanding > s.available_pool
                return (
                  <tr key={s.job_item_id} className="border-t border-neutral-100">
                    <td className="px-3 py-2 text-[12px] text-neutral-800">{s.product_name}</td>
                    <td className="px-3 py-2 text-[12px] font-mono text-right text-neutral-700">{s.outstanding}</td>
                    <td className="px-3 py-2 text-[12px] font-mono text-right text-neutral-700">{s.available_pool}</td>
                    <td className="px-3 py-2 text-[12px] font-mono text-right text-neutral-700">{s.incoming > 0 ? s.incoming : <span className="text-neutral-300">0</span>}</td>
                    <td className={`px-3 py-2 text-[12px] font-mono text-right font-semibold ${shortfall > 0 ? 'text-danger-700' : coveredByIncoming ? 'text-warning-700' : 'text-success-700'}`}>
                      {shortfall > 0 ? `−${shortfall}` : coveredByIncoming ? 'covered when order lands' : 'covered'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {receipts.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-[11px] uppercase tracking-[0.06em] text-neutral-500">Orders</div>
              {receipts.map(r => {
                const anyReceived = r.lines.some(l => l.quantity_received > 0)
                return (
                  <div key={r.id} className="p-3 rounded-lg bg-neutral-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[13px] min-w-0">
                        <span className="font-mono text-neutral-800">{r.receipt_number}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${RECEIPT_STATUS_STYLE[r.status]}`}>{formatLabel(r.status)}</span>
                        <span className="text-neutral-500 truncate">{r.supplier?.name ?? 'No supplier'}{r.po_reference ? ` · PO ${r.po_reference}` : ''}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[12px] text-neutral-500">
                        <span>ETA {formatDate(r.expected_date)}</span>
                        {r.status !== 'cancelled' && r.status !== 'received' && !itemsLocked && (
                          <div className="relative group">
                            <button onClick={() => handleCancelOrder(r.id)} disabled={orderBusy || anyReceived} className="p-1.5 rounded-md text-neutral-400 hover:bg-danger-50 hover:text-danger-500 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Cancel order">
                              <X size={13} />
                            </button>
                            {anyReceived && <div className={`${tooltipClass} left-auto right-0`}>Stock already received against this order</div>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-neutral-600">
                      {r.lines.map(l => (
                        <span key={l.id}><span className="font-mono">{l.quantity_received}/{l.quantity_ordered}</span> {l.product?.name}</span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showOrderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 animate-fade-in">
          <div className="bg-neutral-0 rounded-2xl shadow-lg w-full max-w-lg border border-neutral-200 animate-modal">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-[15px] font-semibold text-neutral-900">Order stock for {job.job_number}</h2>
              <button onClick={() => setShowOrderForm(false)} className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400"><X size={16} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[12px] text-neutral-500">Raise the PO in ApprovalMax as usual, then record it here so the stock counts as incoming for this job. Received units will land in {job.client?.name}'s pool.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Supplier <span className="text-danger-500">*</span></label>
                  <SearchableSelect options={suppliers.map(s => ({ value: s.id, label: s.name }))} value={orderSupplierId} onChange={setOrderSupplierId} placeholder="Select supplier…" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">PO reference <span className="text-danger-500">*</span></label>
                  <input value={orderPoRef} onChange={e => setOrderPoRef(e.target.value)} placeholder="e.g. PO-2026-0117" className="w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <DateTimePicker value={orderEta} onChange={setOrderEta} label="Expected delivery" allowFuture placeholder="Optional" />
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Quantities <span className="text-neutral-400 font-normal">(prefilled with the shortfall)</span></label>
                <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                  {supply.map(s => (
                    <div key={s.product_id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                      <div className="flex-1 min-w-0">
                        <div className="text-neutral-800 truncate">{s.product_name}</div>
                        <div className="text-neutral-400 text-[11px]">needs {s.outstanding} · pool {s.available_pool} · on order {s.incoming}</div>
                      </div>
                      <input
                        inputMode="numeric"
                        value={orderQty[s.product_id] ?? ''}
                        onChange={e => setOrderQty(prev => ({ ...prev, [s.product_id]: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                        className="w-20 h-9 px-2 rounded-md border border-neutral-200 text-right font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Notes <span className="text-neutral-400 font-normal">(optional)</span></label>
                <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200">
              <button onClick={() => setShowOrderForm(false)} className="h-10 px-4 rounded-lg border border-neutral-200 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <div className="relative group">
                <button onClick={handleCreateOrder} disabled={orderBusy || orderDisabledReason !== null} className="h-10 px-4 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed">
                  {orderBusy ? 'Saving…' : 'Record order'}
                </button>
                {orderDisabledReason && <div className={`${tooltipClass} left-auto right-0`}>{orderDisabledReason}</div>}
              </div>
            </div>
          </div>
        </div>
      )}

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
