import { useState, useEffect } from 'react'
import { supabase, BOSS_PROFILE_ID } from '../lib/supabase'
import type { Product, Location, InventoryItem, WarehouseStock, ItemStatus } from '../lib/types'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import { StatusBadge } from '../components/StatusBadge'

type Mode = 'tracked' | 'untracked'

const TRACKED_ACTIONS = [
  { value: 'write_off', label: 'Write Off — lost, stolen, or damaged beyond repair' },
  { value: 'status_change', label: 'Status Change — manually set item status' },
]

const ALL_STATUSES: { value: ItemStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'installed', label: 'Installed' },
  { value: 'defect', label: 'Defect' },
  { value: 'in_repair', label: 'In Repair' },
  { value: 'written_off', label: 'Written Off' },
]

export default function Adjustment() {
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>('tracked')

  // tracked
  const [allItems, setAllItems] = useState<InventoryItem[]>([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [action, setAction] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const [reason, setReason] = useState('')
  const [submittingTracked, setSubmittingTracked] = useState(false)

  // untracked
  const [qtyProducts, setQtyProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Location[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [stockRecord, setStockRecord] = useState<WarehouseStock | null>(null)
  const [newQty, setNewQty] = useState('')
  const [qtyReason, setQtyReason] = useState('')
  const [submittingUntracked, setSubmittingUntracked] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    setSelectedItemId('')
    setAction('')
    setNewStatus('')
    setReason('')
    setSelectedProductId('')
    setSelectedWarehouseId('')
    setStockRecord(null)
    setNewQty('')
    setQtyReason('')
  }, [mode])

  useEffect(() => {
    if (selectedProductId && selectedWarehouseId) {
      supabase
        .from('inv_warehouse_stock')
        .select('*')
        .eq('product_id', selectedProductId)
        .eq('location_id', selectedWarehouseId)
        .maybeSingle()
        .then(({ data }) => {
          setStockRecord(data as WarehouseStock | null)
          setNewQty(data ? String(data.quantity) : '0')
        })
    } else {
      setStockRecord(null)
      setNewQty('')
    }
  }, [selectedProductId, selectedWarehouseId])

  async function loadData() {
    const [itemsRes, prodsRes, locsRes] = await Promise.all([
      supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(id,name,sku), location:mock_cl_locations(id,name)')
        .order('serial_number'),
      supabase.from('inv_product_registry').select('*').eq('tracking_type', 'quantity_only').eq('active', true).order('name'),
      supabase.from('mock_cl_locations').select('*').eq('type', 'warehouse').order('name'),
    ])
    if (itemsRes.data) setAllItems(itemsRes.data as unknown as InventoryItem[])
    if (prodsRes.data) setQtyProducts(prodsRes.data)
    if (locsRes.data) setWarehouses(locsRes.data as unknown as Location[])
  }

  const selectedItem = allItems.find(i => i.id === selectedItemId) ?? null

  async function handleTrackedSubmit() {
    if (!selectedItem || !action || !reason.trim()) {
      toast('error', 'Please fill in all fields')
      return
    }
    if (action === 'status_change' && !newStatus) {
      toast('error', 'Please select a new status')
      return
    }

    setSubmittingTracked(true)
    try {
      const now = new Date().toISOString()

      if (action === 'write_off') {
        const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
          product_id: selectedItem.product_id,
          inventory_item_id: selectedItem.id,
          from_location: selectedItem.location_id,
          to_location: null,
          performed_by: BOSS_PROFILE_ID,
          movement_type: 'adjustment',
          quantity: 1,
          movement_time: now,
          notes: `Write-off: ${reason.trim()}`,
        })
        if (moveErr) throw moveErr

        const { error: updateErr } = await supabase
          .from('inv_inventory_item')
          .update({ status: 'written_off', location_id: null, updated_at: now })
          .eq('id', selectedItem.id)
        if (updateErr) throw updateErr

        toast('success', `${selectedItem.serial_number} written off`)
      } else {
        const oldStatus = selectedItem.status
        const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
          product_id: selectedItem.product_id,
          inventory_item_id: selectedItem.id,
          from_location: selectedItem.location_id,
          to_location: selectedItem.location_id,
          performed_by: BOSS_PROFILE_ID,
          movement_type: 'adjustment',
          quantity: 1,
          movement_time: now,
          notes: `Status change (${oldStatus} → ${newStatus}): ${reason.trim()}`,
        })
        if (moveErr) throw moveErr

        const { error: updateErr } = await supabase
          .from('inv_inventory_item')
          .update({ status: newStatus, updated_at: now })
          .eq('id', selectedItem.id)
        if (updateErr) throw updateErr

        toast('success', `${selectedItem.serial_number} status changed to ${newStatus}`)
      }

      setSelectedItemId('')
      setAction('')
      setNewStatus('')
      setReason('')
      loadData()
    } catch (err: any) {
      toast('error', err.message || 'Adjustment failed')
    } finally {
      setSubmittingTracked(false)
    }
  }

  async function handleUntrackedSubmit() {
    const correctedQty = Number(newQty)
    if (!selectedProductId || !selectedWarehouseId || !qtyReason.trim() || isNaN(correctedQty) || correctedQty < 0) {
      toast('error', 'Please fill in all fields with a valid quantity')
      return
    }

    const currentQty = stockRecord?.quantity ?? 0
    const diff = correctedQty - currentQty
    if (diff === 0) {
      toast('warning', 'No change in quantity')
      return
    }

    setSubmittingUntracked(true)
    try {
      const now = new Date().toISOString()

      const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
        product_id: selectedProductId,
        inventory_item_id: null,
        from_location: diff < 0 ? selectedWarehouseId : null,
        to_location: diff > 0 ? selectedWarehouseId : null,
        performed_by: BOSS_PROFILE_ID,
        movement_type: 'adjustment',
        quantity: Math.abs(diff),
        movement_time: now,
        notes: `Adjustment (${diff > 0 ? '+' : ''}${diff}): ${qtyReason.trim()}`,
      })
      if (moveErr) throw moveErr

      if (stockRecord) {
        const { error } = await supabase
          .from('inv_warehouse_stock')
          .update({ quantity: correctedQty, updated_at: now })
          .eq('id', stockRecord.id)
        if (error) throw error
      } else if (correctedQty > 0) {
        const { error } = await supabase
          .from('inv_warehouse_stock')
          .insert({ product_id: selectedProductId, location_id: selectedWarehouseId, quantity: correctedQty })
        if (error) throw error
      }

      const product = qtyProducts.find(p => p.id === selectedProductId)
      toast('success', `${product?.name}: adjusted by ${diff > 0 ? '+' : ''}${diff}`)
      setSelectedProductId('')
      setSelectedWarehouseId('')
      setStockRecord(null)
      setNewQty('')
      setQtyReason('')
    } catch (err: any) {
      toast('error', err.message || 'Adjustment failed')
    } finally {
      setSubmittingUntracked(false)
    }
  }

  const diff = stockRecord ? Number(newQty) - stockRecord.quantity : Number(newQty) || 0

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
            {/* Select item */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Item</label>
              <SearchableSelect
                options={allItems.map(i => ({
                  value: i.id,
                  label: i.serial_number,
                  sublabel: `${(i.product as any)?.name} · ${(i.location as any)?.name ?? 'No location'}`,
                }))}
                value={selectedItemId}
                onChange={setSelectedItemId}
                placeholder="Search by serial number…"
              />
            </div>

            {/* Item summary */}
            {selectedItem && (
              <div className="flex items-center gap-4 p-3 bg-neutral-50 rounded-lg text-[12px]">
                <div>
                  <span className="text-neutral-500">Product</span>
                  <p className="text-neutral-800 font-medium">{(selectedItem.product as any)?.name}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Location</span>
                  <p className="text-neutral-800">{(selectedItem.location as any)?.name ?? 'None'}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Status</span>
                  <div className="mt-0.5"><StatusBadge status={selectedItem.status} /></div>
                </div>
              </div>
            )}

            {/* Action */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Action</label>
              <SearchableSelect
                options={TRACKED_ACTIONS}
                value={action}
                onChange={v => { setAction(v); setNewStatus(''); }}
                placeholder="Select action…"
              />
            </div>

            {/* New status (status_change only) */}
            {action === 'status_change' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">New Status</label>
                <SearchableSelect
                  options={ALL_STATUSES.filter(s => s.value !== selectedItem?.status)}
                  value={newStatus}
                  onChange={setNewStatus}
                  placeholder="Select new status…"
                />
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Reason (required)</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                placeholder="Explain why this adjustment is needed"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleTrackedSubmit}
              disabled={submittingTracked || !selectedItemId || !action || !reason.trim() || (action === 'status_change' && !newStatus)}
              className="h-10 px-5 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-120"
            >
              {submittingTracked ? 'Processing…' : action === 'write_off' ? 'Write Off Item' : 'Apply Status Change'}
            </button>
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

            {/* Warehouse */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Warehouse</label>
              <SearchableSelect
                options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                value={selectedWarehouseId}
                onChange={setSelectedWarehouseId}
                placeholder="Select warehouse…"
              />
            </div>

            {/* Quantity adjustment */}
            {selectedProductId && selectedWarehouseId && (
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
                    onChange={e => setNewQty(e.target.value.replace(/\D/g, ''))}
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

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Reason (required)</label>
              <textarea
                value={qtyReason}
                onChange={e => setQtyReason(e.target.value)}
                rows={2}
                placeholder="e.g. Physical count shows 47, system shows 50 — 3 units missing"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleUntrackedSubmit}
              disabled={submittingUntracked || !selectedProductId || !selectedWarehouseId || !qtyReason.trim() || diff === 0}
              className="h-10 px-5 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-120"
            >
              {submittingUntracked ? 'Processing…' : `Apply Adjustment (${diff > 0 ? '+' : ''}${diff})`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
