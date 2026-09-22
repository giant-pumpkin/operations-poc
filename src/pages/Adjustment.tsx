import { useState, useEffect } from 'react'
import { supabase, BOSS_PROFILE_ID } from '../lib/supabase'
import type { Product, Location, Company, InventoryItem, WarehouseStock, ItemStatus } from '../lib/types'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import MultiSelectInfoTable from '../components/MultiSelectInfoTable'
import MovementDateInput from '../components/MovementDateInput'
import { findChangedItems } from '../lib/staleCheck'

type Mode = 'tracked' | 'untracked'
type UntrackedAction = 'adjust' | 'reallocate'
type TrackedAction = 'write_off' | 'status_change' | 'reallocate'

const TRACKED_ACTIONS = [
  { value: 'write_off', label: 'Write Off — lost, stolen, or damaged beyond repair' },
  { value: 'status_change', label: 'Status Change — manually set item status' },
  { value: 'reallocate', label: 'Reallocate — assign to a different client' },
]

const UNTRACKED_ACTIONS = [
  { value: 'adjust', label: 'Quantity Adjustment — correct stock count' },
  { value: 'reallocate', label: 'Reallocate — move stock to a different client pool' },
]

const DESIGNATION_OPTIONS = [
  { value: 'deployment', label: 'Deployment' },
  { value: 'spare', label: 'Spare' },
  { value: 'maintenance', label: 'Maintenance' },
]

// Manual status changes are corrections. Installing, writing off and moving between
// locations all have their own flows, so they are not offered here.
const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'defect', label: 'Defect' },
  { value: 'in_repair', label: 'In Repair' },
]

const STATUS_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  available: ['in_transit', 'defect'],
  scheduled: ['available', 'in_transit', 'defect'],
  in_transit: ['available', 'defect'],
  installed: ['defect'],
  defect: ['in_repair', 'available'],
  in_repair: ['available', 'defect'],
  written_off: [],
}

const STATUS_REQUIRES_LOCATION: Partial<Record<ItemStatus, Location['type'][]>> = {
  available: ['warehouse'],
  in_repair: ['repair_center'],
  installed: ['client_site'],
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  available: 'Available', scheduled: 'Scheduled', in_transit: 'In Transit', installed: 'Installed',
  defect: 'Defect', in_repair: 'In Repair', written_off: 'Written Off',
}

function statusChangeBlocker(item: InventoryItem, target: ItemStatus): string | null {
  if (item.status === target) return `${item.serial_number} is already ${STATUS_LABEL[target]}`
  if (!STATUS_TRANSITIONS[item.status].includes(target)) {
    return `${item.serial_number}: ${STATUS_LABEL[item.status]} → ${STATUS_LABEL[target]} is not a valid transition`
  }
  const needed = STATUS_REQUIRES_LOCATION[target]
  const locType = (item.location as any)?.type as Location['type'] | undefined
  if (needed && (!locType || !needed.includes(locType))) {
    const where = needed.map(t => t.replace('_', ' ')).join(' or ')
    return `${item.serial_number} must be at a ${where} to be ${STATUS_LABEL[target]} (currently at ${(item.location as any)?.name ?? 'no location'})`
  }
  return null
}

export default function Adjustment() {
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>('tracked')

  // tracked
  const [allItems, setAllItems] = useState<InventoryItem[]>([])
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [action, setAction] = useState<TrackedAction | ''>('')
  const [newStatus, setNewStatus] = useState('')
  const [reason, setReason] = useState('')
  const [movementDateTracked, setMovementDateTracked] = useState('')
  const [submittingTracked, setSubmittingTracked] = useState(false)
  // tracked reallocate
  const [trackedTargetClientId, setTrackedTargetClientId] = useState('')
  const [trackedTargetDesignation, setTrackedTargetDesignation] = useState('deployment')

  // untracked
  const [qtyProducts, setQtyProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Location[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [productStockPools, setProductStockPools] = useState<WarehouseStock[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [selectedPoolId, setSelectedPoolId] = useState('')
  const [untrackedAction, setUntrackedAction] = useState<UntrackedAction>('adjust')
  const [stockRecord, setStockRecord] = useState<WarehouseStock | null>(null)
  const [newQty, setNewQty] = useState('')
  const [qtyReason, setQtyReason] = useState('')
  const [movementDateUntracked, setMovementDateUntracked] = useState('')
  const [submittingUntracked, setSubmittingUntracked] = useState(false)
  // reallocate
  const [targetClientId, setTargetClientId] = useState('')
  const [targetDesignation, setTargetDesignation] = useState('deployment')
  const [reallocateQty, setReallocateQty] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    setSelectedItemIds([])
    setAction('')
    setNewStatus('')
    setReason('')
    setMovementDateTracked('')
    setTrackedTargetClientId('')
    setTrackedTargetDesignation('deployment')
    setSelectedProductId('')
    setSelectedWarehouseId('')
    setSelectedPoolId('')
    setUntrackedAction('adjust')
    setProductStockPools([])
    setStockRecord(null)
    setNewQty('')
    setQtyReason('')
    setMovementDateUntracked('')
    setTargetClientId('')
    setTargetDesignation('deployment')
    setReallocateQty('')
  }, [mode])

  useEffect(() => {
    if (selectedProductId) {
      supabase
        .from('inv_warehouse_stock')
        .select('*, location:mock_cl_locations(id, name), allocated_client:mock_cl_companies!inv_warehouse_stock_allocated_client_id_fkey(id, name)')
        .eq('product_id', selectedProductId)
        .then(({ data }) => {
          setProductStockPools((data as WarehouseStock[]) ?? [])
          setSelectedPoolId('')
          setStockRecord(null)
          setNewQty('')
        })
    } else {
      setProductStockPools([])
      setSelectedPoolId('')
      setStockRecord(null)
      setNewQty('')
    }
  }, [selectedProductId])

  useEffect(() => {
    const pool = productStockPools.find(p => p.id === selectedPoolId) ?? null
    setStockRecord(pool)
    setNewQty(pool ? String(pool.quantity) : '0')
  }, [selectedPoolId, productStockPools])

  async function loadData() {
    const [itemsRes, prodsRes, locsRes, companiesRes] = await Promise.all([
      supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(id,name,sku), location:mock_cl_locations(id,name,type), allocated_client:mock_cl_companies!inv_inventory_item_allocated_client_id_fkey(id,name)')
        .neq('status', 'written_off')
        .order('serial_number'),
      supabase.from('inv_product_registry').select('*').eq('tracking_type', 'quantity_only').eq('active', true).order('name'),
      supabase.from('mock_cl_locations').select('*').eq('type', 'warehouse').order('name'),
      supabase.from('mock_cl_companies').select('*').eq('status', 'client').order('name'),
    ])
    if (itemsRes.data) setAllItems(itemsRes.data as unknown as InventoryItem[])
    if (prodsRes.data) setQtyProducts(prodsRes.data)
    if (locsRes.data) setWarehouses(locsRes.data as unknown as Location[])
    if (companiesRes.data) setCompanies(companiesRes.data)
  }

  const selectedItems = allItems.filter(i => selectedItemIds.includes(i.id))

  const trackedDisabledReason = (() => {
    if (selectedItems.length === 0) return 'Select at least one item'
    if (!action) return 'Select an action'
    if (action === 'status_change') {
      if (!newStatus) return 'Select a new status'
      for (const item of selectedItems) {
        const blocker = statusChangeBlocker(item, newStatus as ItemStatus)
        if (blocker) return blocker
      }
    }
    if (action === 'reallocate') {
      const destClientId = trackedTargetClientId || null
      const allSame = selectedItems.every(item =>
        ((item as any).allocated_client_id ?? null) === destClientId &&
        ((item as any).designation ?? 'deployment') === trackedTargetDesignation
      )
      if (allSame) return 'All selected items already belong to the target pool'
    }
    if (!reason.trim()) return 'Enter a reason'
    if (!movementDateTracked) return 'Enter a movement date'
    if (new Date(movementDateTracked) > new Date()) return 'Movement date cannot be in the future'
    return null
  })()

  async function handleTrackedSubmit() {
    if (trackedDisabledReason) {
      toast('error', trackedDisabledReason)
      return
    }
    if (action === 'reallocate') {
      return handleTrackedReallocate()
    }
    const movementTime = new Date(movementDateTracked)

    setSubmittingTracked(true)
    try {
      const changed = await findChangedItems(selectedItems)
      if (changed.length > 0) {
        toast('error', `${changed[0]}${changed.length > 1 ? ` (+${changed.length - 1} more)` : ''}. List refreshed — please review.`)
        setSelectedItemIds([])
        await loadData()
        return
      }

      const now = new Date().toISOString()
      const moveTime = movementTime.toISOString()

      for (const item of selectedItems) {
        if (action === 'write_off') {
          const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
            product_id: item.product_id,
            inventory_item_id: item.id,
            from_location: item.location_id,
            to_location: null,
            performed_by: BOSS_PROFILE_ID,
            movement_type: 'adjustment',
            quantity: 1,
            movement_time: moveTime,
            notes: `Write-off: ${reason.trim()}`,
          })
          if (moveErr) throw moveErr

          const { error: updateErr } = await supabase
            .from('inv_inventory_item')
            .update({ status: 'written_off', location_id: null, updated_at: now })
            .eq('id', item.id)
          if (updateErr) throw updateErr
        } else if (action === 'status_change') {
          const oldStatus = item.status
          const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
            product_id: item.product_id,
            inventory_item_id: item.id,
            from_location: null,
            to_location: null,
            performed_by: BOSS_PROFILE_ID,
            movement_type: 'adjustment',
            quantity: 1,
            movement_time: moveTime,
            notes: `Status change (${oldStatus} → ${newStatus}): ${reason.trim()}`,
          })
          if (moveErr) throw moveErr

          const { error: updateErr } = await supabase
            .from('inv_inventory_item')
            .update({ status: newStatus, updated_at: now })
            .eq('id', item.id)
          if (updateErr) throw updateErr
        }
      }

      const count = selectedItems.length
      if (action === 'write_off') {
        toast('success', `${count} item${count > 1 ? 's' : ''} written off`)
      } else {
        toast('success', `${count} item${count > 1 ? 's' : ''} status changed to ${newStatus}`)
      }

      setSelectedItemIds([])
      setAction('')
      setNewStatus('')
      setReason('')
      setMovementDateTracked('')
      loadData()
    } catch (err: any) {
      toast('error', err.message || 'Adjustment failed')
    } finally {
      setSubmittingTracked(false)
    }
  }

  async function handleTrackedReallocate() {
    if (selectedItems.length === 0 || !reason.trim() || !movementDateTracked) {
      toast('error', 'Please fill in all fields')
      return
    }
    const movementTime = new Date(movementDateTracked)
    if (movementTime > new Date()) {
      toast('error', 'Movement date cannot be in the future.')
      return
    }

    const destClientId = trackedTargetClientId || null
    const destDesignation = trackedTargetDesignation

    const unchanged = selectedItems.every(item => {
      const curClient = (item as any).allocated_client_id ?? null
      const curDesignation = (item as any).designation ?? 'deployment'
      return curClient === destClientId && curDesignation === destDesignation
    })
    if (unchanged) {
      toast('warning', 'All selected items already belong to the target pool')
      return
    }

    setSubmittingTracked(true)
    try {
      const changed = await findChangedItems(selectedItems)
      if (changed.length > 0) {
        toast('error', `${changed[0]}${changed.length > 1 ? ` (+${changed.length - 1} more)` : ''}. List refreshed — please review.`)
        setSelectedItemIds([])
        await loadData()
        return
      }

      const now = new Date().toISOString()
      const moveTime = movementTime.toISOString()
      let count = 0

      for (const item of selectedItems) {
        const curClient = (item as any).allocated_client_id ?? null
        const curDesignation = (item as any).designation ?? 'deployment'
        if (curClient === destClientId && curDesignation === destDesignation) continue

        const oldClientName = (item as any).allocated_client?.name ?? 'Unallocated'
        const newClientName = destClientId ? (companies.find(c => c.id === destClientId)?.name ?? 'Unknown') : 'Unallocated'
        const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
          product_id: item.product_id,
          inventory_item_id: item.id,
          from_location: null,
          to_location: null,
          performed_by: BOSS_PROFILE_ID,
          movement_type: 'adjustment',
          quantity: 1,
          movement_time: moveTime,
          notes: `Reallocated from ${oldClientName} · ${curDesignation} to ${newClientName} · ${destDesignation}: ${reason.trim()}`,
        })
        if (moveErr) throw moveErr

        const { error: updateErr } = await supabase
          .from('inv_inventory_item')
          .update({ allocated_client_id: destClientId, designation: destDesignation, updated_at: now })
          .eq('id', item.id)
        if (updateErr) throw updateErr
        count++
      }

      toast('success', `${count} item${count > 1 ? 's' : ''} reallocated`)
      setSelectedItemIds([])
      setAction('')
      setReason('')
      setMovementDateTracked('')
      setTrackedTargetClientId('')
      setTrackedTargetDesignation('deployment')
      loadData()
    } catch (err: any) {
      toast('error', err.message || 'Reallocation failed')
    } finally {
      setSubmittingTracked(false)
    }
  }

  async function handleUntrackedSubmit() {
    if (newQty.trim() === '') {
      toast('error', 'Enter the corrected quantity')
      return
    }
    const correctedQty = Number(newQty)
    if (!selectedProductId || !selectedPoolId || !qtyReason.trim() || isNaN(correctedQty) || correctedQty < 0 || !movementDateUntracked) {
      toast('error', 'Please fill in all fields with a valid quantity')
      return
    }

    const currentQty = stockRecord?.quantity ?? 0
    const diff = correctedQty - currentQty
    if (diff === 0) {
      toast('warning', 'No change in quantity')
      return
    }

    const movementTime = new Date(movementDateUntracked)
    if (movementTime > new Date()) {
      toast('error', 'Movement date cannot be in the future.')
      return
    }

    setSubmittingUntracked(true)
    try {
      if (!stockRecord) throw new Error('Select a stock pool')

      // The user is correcting against the number they saw; if it moved underneath them, stop and re-show.
      const { data: fresh, error: freshErr } = await supabase.from('inv_warehouse_stock').select('quantity').eq('id', stockRecord.id).single()
      if (freshErr || !fresh) throw new Error('Stock pool no longer exists')
      if (fresh.quantity !== currentQty) {
        toast('error', `Stock has changed (now ${fresh.quantity}). Please review and try again.`)
        setStockRecord({ ...stockRecord, quantity: fresh.quantity })
        setNewQty(String(fresh.quantity))
        setSubmittingUntracked(false)
        return
      }

      const { error } = await supabase.rpc('adjust_quantity_stock', {
        p_pool_id: stockRecord.id,
        p_new_qty: correctedQty,
        p_movement_time: movementTime.toISOString(),
        p_performed_by: BOSS_PROFILE_ID,
        p_notes: `Adjustment (${diff > 0 ? '+' : ''}${diff}): ${qtyReason.trim()}`,
      })
      if (error) throw error

      const product = qtyProducts.find(p => p.id === selectedProductId)
      toast('success', `${product?.name}: adjusted by ${diff > 0 ? '+' : ''}${diff}`)
      setSelectedProductId('')
      setSelectedWarehouseId('')
      setSelectedPoolId('')
      setProductStockPools([])
      setStockRecord(null)
      setMovementDateUntracked('')
      setNewQty('')
      setQtyReason('')
    } catch (err: any) {
      toast('error', err.message || 'Adjustment failed')
    } finally {
      setSubmittingUntracked(false)
    }
  }

  async function handleReallocateSubmit() {
    const qty = Number(reallocateQty)
    if (!stockRecord || !selectedPoolId || qty <= 0 || !qtyReason.trim() || !movementDateUntracked) {
      toast('error', 'Please fill in all fields')
      return
    }
    if (qty > stockRecord.quantity) {
      toast('error', `Cannot reallocate more than available (${stockRecord.quantity})`)
      return
    }
    const movementTime = new Date(movementDateUntracked)
    if (movementTime > new Date()) {
      toast('error', 'Movement date cannot be in the future.')
      return
    }

    const srcClientId = stockRecord.allocated_client_id ?? null
    const srcDesignation = stockRecord.designation ?? 'deployment'
    const destClientId = targetClientId || null
    const destDesignation = targetDesignation

    if (srcClientId === destClientId && srcDesignation === destDesignation) {
      toast('warning', 'Target pool is the same as source pool')
      return
    }

    setSubmittingUntracked(true)
    try {
      const srcClientName = (stockRecord.allocated_client as any)?.name ?? 'Unallocated'
      const destClientName = destClientId ? (companies.find(c => c.id === destClientId)?.name ?? 'Unknown') : 'Unallocated'

      const { error } = await supabase.rpc('reallocate_quantity_stock', {
        p_source_pool_id: stockRecord.id,
        p_dest_client_id: destClientId,
        p_dest_designation: destDesignation,
        p_qty: qty,
        p_movement_time: movementTime.toISOString(),
        p_performed_by: BOSS_PROFILE_ID,
        p_notes: `Reallocation (${qty}×) from ${srcClientName} · ${srcDesignation} to ${destClientName} · ${destDesignation}: ${qtyReason.trim()}`,
      })
      if (error) throw error

      const product = qtyProducts.find(p => p.id === selectedProductId)
      toast('success', `${product?.name}: reallocated ${qty} units`)
      setSelectedProductId('')
      setSelectedPoolId('')
      setUntrackedAction('adjust')
      setProductStockPools([])
      setStockRecord(null)
      setMovementDateUntracked('')
      setQtyReason('')
      setTargetClientId('')
      setTargetDesignation('deployment')
      setReallocateQty('')
    } catch (err: any) {
      toast('error', err.message || 'Reallocation failed')
    } finally {
      setSubmittingUntracked(false)
    }
  }

  const diff = newQty.trim() === '' ? 0 : (stockRecord ? Number(newQty) - stockRecord.quantity : Number(newQty) || 0)

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader title="Adjustment" />

      {/* Mode toggle */}
      <div className="flex gap-1 mb-5 bg-neutral-100 rounded-lg p-0.5 w-fit">
        {(['tracked', 'untracked'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-120 ${
              mode === m ? 'bg-neutral-0 text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {m === 'tracked' ? 'Serial Items' : 'Quantity Items'}
          </button>
        ))}
      </div>

      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-6 space-y-5">
        {mode === 'tracked' ? (
          <>
            {/* Select items (multi) */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Items {selectedItems.length > 0 && <span className="text-neutral-400 font-normal">({selectedItems.length} selected)</span>}
              </label>
              <SearchableSelect
                multi
                options={allItems.map(i => ({
                  value: i.id,
                  label: i.serial_number,
                  sublabel: `${(i.product as any)?.name} · ${(i.location as any)?.name ?? 'No location'}`,
                }))}
                value={selectedItemIds}
                onChange={setSelectedItemIds}
                placeholder="Search by serial number…"
              />
            </div>

            <MultiSelectInfoTable items={selectedItems} />

            {/* Action */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Action</label>
              <SearchableSelect
                options={TRACKED_ACTIONS}
                value={action}
                onChange={v => { setAction(v as TrackedAction); setNewStatus(''); setTrackedTargetClientId(''); setTrackedTargetDesignation('deployment'); }}
                placeholder="Select action…"
              />
            </div>

            {/* New status (status_change only) */}
            {action === 'status_change' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">New Status</label>
                <SearchableSelect
                  options={STATUS_OPTIONS}
                  value={newStatus}
                  onChange={setNewStatus}
                  placeholder="Select new status…"
                />
              </div>
            )}

            {/* Reallocate fields */}
            {action === 'reallocate' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Target Client <span className="text-neutral-400 font-normal">(blank = unallocated)</span>
                  </label>
                  <SearchableSelect
                    options={companies.map(c => ({ value: c.id, label: c.name }))}
                    value={trackedTargetClientId}
                    onChange={setTrackedTargetClientId}
                    placeholder="Unallocated"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Target Designation</label>
                  <SearchableSelect
                    options={DESIGNATION_OPTIONS}
                    value={trackedTargetDesignation}
                    onChange={setTrackedTargetDesignation}
                    placeholder="Select designation…"
                  />
                </div>
              </>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Reason (required)</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                placeholder={action === 'reallocate' ? 'e.g. Reassigning to KFC for upcoming deployment' : 'Explain why this adjustment is needed'}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
            </div>

            <MovementDateInput value={movementDateTracked} onChange={setMovementDateTracked} />

            {/* Submit */}
            <div className="relative w-fit group">
              <button
                onClick={handleTrackedSubmit}
                disabled={submittingTracked || trackedDisabledReason !== null}
                className="h-10 px-5 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-120"
              >
                {submittingTracked ? 'Processing…'
                  : action === 'write_off' ? `Write Off ${selectedItems.length} Item${selectedItems.length !== 1 ? 's' : ''}`
                  : action === 'reallocate' ? `Reallocate ${selectedItems.length} Item${selectedItems.length !== 1 ? 's' : ''}`
                  : `Apply Status Change (${selectedItems.length})`}
              </button>
              {trackedDisabledReason && !submittingTracked && (
                <div className="absolute bottom-full left-0 mb-2 px-3 py-1.5 rounded-lg bg-[#2b2b2e] text-neutral-0 text-[12px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-lg">
                  {trackedDisabledReason}
                  <div className="absolute top-full left-6 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-[#2b2b2e]" />
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Product */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Product</label>
              <SearchableSelect
                options={qtyProducts.map(p => ({ value: p.id, label: p.name, sublabel: p.sku }))}
                value={selectedProductId}
                onChange={v => { setSelectedProductId(v); setSelectedWarehouseId(''); }}
                placeholder="Select product…"
              />
            </div>

            {/* Stock Pool */}
            {selectedProductId && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Stock Pool</label>
                <SearchableSelect
                  options={productStockPools.map(p => {
                    const locName = (p.location as any)?.name ?? '—'
                    const clientName = (p.allocated_client as any)?.name
                    const desLabel = (p.designation ?? 'deployment').replace(/\b\w/g, (c: string) => c.toUpperCase())
                    const label = clientName
                      ? `${locName} · ${clientName} · ${desLabel}`
                      : `${locName} · Unallocated · ${desLabel}`
                    return { value: p.id, label, sublabel: `${p.quantity} in stock` }
                  })}
                  value={selectedPoolId}
                  onChange={setSelectedPoolId}
                  placeholder="Select stock pool…"
                />
              </div>
            )}

            {/* Action */}
            {selectedProductId && selectedPoolId && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Action</label>
                <SearchableSelect
                  options={UNTRACKED_ACTIONS}
                  value={untrackedAction}
                  onChange={v => {
                    setUntrackedAction(v as UntrackedAction)
                    setNewQty(stockRecord ? String(stockRecord.quantity) : '0')
                    setTargetClientId('')
                    setTargetDesignation('deployment')
                    setReallocateQty('')
                  }}
                  placeholder="Select action…"
                />
              </div>
            )}

            {/* Quantity adjustment */}
            {selectedProductId && selectedPoolId && untrackedAction === 'adjust' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <span className="block text-[11px] text-neutral-500 mb-1">Current Quantity</span>
                  <p className="text-xl font-mono font-semibold text-neutral-800">{stockRecord?.quantity ?? 0}</p>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <label className="block text-[11px] text-neutral-500 mb-1">New Quantity</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newQty}
                    onChange={e => setNewQty(e.target.value.replace(/\D/g, '').slice(0, 7))}
                    className="w-full h-8 px-2 rounded-md border border-neutral-200 bg-neutral-0 text-xl font-mono font-semibold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <span className="block text-[11px] text-neutral-500 mb-1">Difference</span>
                  <p className={`text-xl font-mono font-semibold ${diff === 0 ? 'text-neutral-400' : diff > 0 ? 'text-success-700' : 'text-danger-700'}`}>
                    {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${diff}`}
                  </p>
                </div>
              </div>
            )}

            {/* Reallocate */}
            {selectedProductId && selectedPoolId && untrackedAction === 'reallocate' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Target Client <span className="text-neutral-400 font-normal">(blank = unallocated)</span>
                  </label>
                  <SearchableSelect
                    options={companies.map(c => ({ value: c.id, label: c.name }))}
                    value={targetClientId}
                    onChange={setTargetClientId}
                    placeholder="Unallocated"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Target Designation</label>
                  <SearchableSelect
                    options={DESIGNATION_OPTIONS}
                    value={targetDesignation}
                    onChange={setTargetDesignation}
                    placeholder="Deployment"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Quantity to Reallocate <span className="text-neutral-400 font-normal">(max {stockRecord?.quantity ?? 0})</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={reallocateQty}
                    onChange={e => setReallocateQty(e.target.value.replace(/\D/g, '').slice(0, 7))}
                    className="w-32 h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Reason (required)</label>
              <textarea
                value={qtyReason}
                onChange={e => setQtyReason(e.target.value)}
                rows={2}
                placeholder={untrackedAction === 'reallocate'
                  ? 'e.g. Allocating stock for upcoming KFC deployment'
                  : 'e.g. Physical count shows 47, system shows 50 — 3 units missing'}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
            </div>

            <MovementDateInput value={movementDateUntracked} onChange={setMovementDateUntracked} />

            {/* Submit */}
            {untrackedAction === 'adjust' ? (
              <button
                onClick={handleUntrackedSubmit}
                disabled={submittingUntracked || !selectedProductId || !selectedPoolId || !qtyReason.trim() || !movementDateUntracked || diff === 0}
                className="h-10 px-5 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-120"
              >
                {submittingUntracked ? 'Processing…' : `Apply Adjustment (${diff > 0 ? '+' : ''}${diff})`}
              </button>
            ) : (
              <button
                onClick={handleReallocateSubmit}
                disabled={submittingUntracked || !selectedPoolId || !qtyReason.trim() || !movementDateUntracked || !(Number(reallocateQty) > 0)}
                className="h-10 px-5 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-120"
              >
                {submittingUntracked ? 'Processing…' : `Reallocate ${reallocateQty || 0} Units`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
