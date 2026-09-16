import { useState, useEffect } from 'react'
import { supabase, BOSS_PROFILE_ID } from '../lib/supabase'
import type { InventoryItem, Product, Location, WarehouseStock, ItemStatus, MovementType } from '../lib/types'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import { StatusBadge } from '../components/StatusBadge'
import { activateWarrantyIfNeeded } from '../lib/warranty'
import MovementDateInput from '../components/MovementDateInput'
import { X } from 'lucide-react'

type Mode = 'tracked' | 'untracked'

const REASON_OPTIONS = [
  { value: 'defect', label: 'Defect — needs repair' },
  { value: 'de_installation', label: 'De-installation — client no longer needs it' },
  { value: 'swap', label: 'Swap — being replaced' },
  { value: 'end_of_contract', label: 'End of contract' },
]

const LOCATION_TYPE_LABEL: Record<Location['type'], string> = {
  client_site: 'Client Site',
  warehouse: 'Warehouse',
  repair_center: 'Repair Center',
}

function sourceType(item: InventoryItem): Location['type'] | undefined {
  return (item.location as any)?.type
}

function movementTypeFor(item: InventoryItem): MovementType {
  return sourceType(item) === 'client_site' ? 'return' : 'transfer'
}

function newStatusFor(item: InventoryItem, destType: Location['type'] | undefined, reason: string): ItemStatus {
  const src = sourceType(item)
  if (src === 'client_site') {
    return reason === 'defect' ? 'defect' : 'available'
  }
  if (destType === 'repair_center') return 'in_repair'
  if (src === 'repair_center' && destType === 'warehouse') return 'available'
  return item.status
}

export default function Transfer() {
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>('tracked')

  // tracked state
  const [allItems, setAllItems] = useState<InventoryItem[]>([])
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [reason, setReason] = useState('')

  // untracked state
  const [qtyProducts, setQtyProducts] = useState<Product[]>([])
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStock[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [sourceWarehouseId, setSourceWarehouseId] = useState('')
  const [transferQty, setTransferQty] = useState('')

  // shared
  const [destinations, setDestinations] = useState<Location[]>([])
  const [destinationTypeFilter, setDestinationTypeFilter] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [notes, setNotes] = useState('')
  const [movementDate, setMovementDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    setSelectedItemIds([])
    setReason('')
    setSelectedProductId('')
    setSourceWarehouseId('')
    setTransferQty('')
    setDestinationTypeFilter('')
    setDestinationId('')
    setNotes('')
    setMovementDate('')
    setShowConfirm(false)
  }, [mode])

  useEffect(() => {
    if (selectedProductId) {
      supabase
        .from('inv_warehouse_stock')
        .select('*, location:mock_cl_locations(id, name)')
        .eq('product_id', selectedProductId)
        .gt('quantity', 0)
        .then(({ data }) => setWarehouseStock((data as any) ?? []))
    } else {
      setWarehouseStock([])
      setSourceWarehouseId('')
    }
  }, [selectedProductId])

  async function loadData() {
    const [itemsRes, prodsRes, locsRes] = await Promise.all([
      supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(id,name,sku), location:mock_cl_locations(id,name,type)')
        .neq('status', 'written_off')
        .order('serial_number'),
      supabase.from('inv_product_registry').select('*').eq('tracking_type', 'quantity_only').eq('active', true).order('name'),
      supabase.from('mock_cl_locations').select('*').order('name'),
    ])
    if (itemsRes.data) setAllItems(itemsRes.data as unknown as InventoryItem[])
    if (prodsRes.data) setQtyProducts(prodsRes.data)
    if (locsRes.data) setDestinations(locsRes.data as unknown as Location[])
  }

  const selectedItems = allItems.filter(i => selectedItemIds.includes(i.id))
  const selectableItems = allItems.filter(i => i.location_id != null)

  const hasClientSiteSource = selectedItems.some(i => sourceType(i) === 'client_site')

  useEffect(() => {
    if (!hasClientSiteSource) setReason('')
  }, [hasClientSiteSource])

  function removeItem(id: string) {
    setSelectedItemIds(prev => prev.filter(x => x !== id))
  }

  const sourceStock = warehouseStock.find(s => (s.location as any)?.id === sourceWarehouseId)
  const maxQty = sourceStock?.quantity ?? 0

  const sameLocationError = (() => {
    if (!destinationId) return false
    if (mode === 'tracked') {
      return selectedItems.length > 0 && selectedItems.some(i => i.location_id === destinationId)
    }
    return sourceWarehouseId === destinationId
  })()

  const disabledReason = (() => {
    if (mode === 'tracked') {
      if (selectedItems.length === 0) return 'Select at least one item'
      if (!destinationId) return 'Select a destination'
      if (sameLocationError) return 'Cannot transfer to the same location'
      if (hasClientSiteSource && !reason) return 'Select a reason'
      if (!movementDate) return 'Enter a movement date'
      return null
    }
    if (!selectedProductId) return 'Select a product'
    if (!sourceWarehouseId) return 'Select a source warehouse'
    if (!destinationId) return 'Select a destination'
    if (sameLocationError) return 'Cannot transfer to the same location'
    if (!(Number(transferQty) > 0)) return 'Enter a quantity'
    if (Number(transferQty) > maxQty) return 'Quantity exceeds maximum'
    if (!movementDate) return 'Enter a movement date'
    return null
  })()

  async function handleSubmit() {
    const movementTime = new Date(movementDate).toISOString()
    setSubmitting(true)
    try {
      if (mode === 'tracked') {
        const now = new Date().toISOString()
        const dest = destinations.find(d => d.id === destinationId)!

        for (const item of selectedItems) {
          const movementType = movementTypeFor(item)
          const newStatus = newStatusFor(item, dest.type, reason)
          const defaultNote = movementType === 'return' ? `Return reason: ${reason.replace(/_/g, ' ')}` : null

          const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
            product_id: item.product_id,
            inventory_item_id: item.id,
            from_location: item.location_id,
            to_location: destinationId,
            performed_by: BOSS_PROFILE_ID,
            movement_type: movementType,
            quantity: 1,
            movement_time: movementTime,
            notes: notes.trim() || defaultNote,
          })
          if (moveErr) throw moveErr

          const { error: updateErr } = await supabase
            .from('inv_inventory_item')
            .update({ location_id: destinationId, status: newStatus, updated_at: now })
            .eq('id', item.id)
          if (updateErr) throw updateErr

          if (newStatus === 'installed') {
            await activateWarrantyIfNeeded(item.id)
          }
        }

        toast('success', `Moved ${selectedItems.length} item(s) to ${dest.name}`)
      } else {
        const qty = Number(transferQty)
        const now = new Date().toISOString()

        const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
          product_id: selectedProductId,
          inventory_item_id: null,
          from_location: sourceWarehouseId,
          to_location: destinationId,
          performed_by: BOSS_PROFILE_ID,
          movement_type: 'transfer',
          quantity: qty,
          movement_time: movementTime,
          notes: notes.trim() || null,
        })
        if (moveErr) throw moveErr

        const { error: decErr } = await supabase
          .from('inv_warehouse_stock')
          .update({ quantity: sourceStock!.quantity - qty, updated_at: now })
          .eq('id', sourceStock!.id)
        if (decErr) throw decErr

        const { data: existing } = await supabase
          .from('inv_warehouse_stock')
          .select('id, quantity')
          .eq('product_id', selectedProductId)
          .eq('location_id', destinationId)
          .maybeSingle()

        if (existing) {
          const { error } = await supabase
            .from('inv_warehouse_stock')
            .update({ quantity: existing.quantity + qty, updated_at: now })
            .eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('inv_warehouse_stock')
            .insert({ product_id: selectedProductId, location_id: destinationId, quantity: qty })
          if (error) throw error
        }

        const product = qtyProducts.find(p => p.id === selectedProductId)
        toast('success', `Transferred ${qty}× ${product?.name ?? 'items'}`)
      }

      setSelectedItemIds([])
      setReason('')
      setSelectedProductId('')
      setSourceWarehouseId('')
      setTransferQty('')
      setDestinationTypeFilter('')
      setDestinationId('')
      setNotes('')
      setMovementDate('')
      setShowConfirm(false)
      loadData()
    } catch (err: any) {
      toast('error', err.message || 'Transfer failed')
    } finally {
      setSubmitting(false)
    }
  }

  const destTypeOptions = (['client_site', 'warehouse', 'repair_center'] as Location['type'][])
    .filter(t => mode === 'tracked' || t !== 'client_site')
    .map(t => ({ value: t, label: LOCATION_TYPE_LABEL[t] }))

  const destOptions = destinations
    .filter(d => mode === 'tracked' || d.type !== 'client_site')
    .filter(d => !destinationTypeFilter || d.type === destinationTypeFilter)
    .map(d => ({
      value: d.id,
      label: d.name,
      sublabel: selectedItems.some(i => i.location_id === d.id) || sourceWarehouseId === d.id
        ? `${LOCATION_TYPE_LABEL[d.type]} · current location`
        : LOCATION_TYPE_LABEL[d.type],
    }))

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader title="Transfer" />

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
            {/* Select items */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Select Items</label>
              <SearchableSelect
                multi
                options={selectableItems.map(i => ({
                  value: i.id,
                  label: i.serial_number,
                  sublabel: `${(i.product as any)?.name} · ${(i.location as any)?.name ?? 'Unknown'}`,
                }))}
                value={selectedItemIds}
                onChange={setSelectedItemIds}
                placeholder="Search by serial number…"
              />
            </div>

            {/* Selected items table */}
            {selectedItems.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-[11px] uppercase tracking-[0.06em] text-neutral-500">
                    <th className="text-left px-3 py-2 font-medium">Serial</th>
                    <th className="text-left px-3 py-2 font-medium">Product</th>
                    <th className="text-left px-3 py-2 font-medium">Current Location</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map(item => {
                    const loc = item.location as any
                    return (
                      <tr key={item.id} className="border-t border-neutral-100">
                        <td className="px-3 py-2 font-mono text-[12px]">{item.serial_number}</td>
                        <td className="px-3 py-2 text-[12px]">{(item.product as any)?.name}</td>
                        <td className="px-3 py-2 text-[12px]">
                          {loc?.name ?? '—'}
                          {loc?.type && (
                            <span className="text-neutral-400 ml-1">({LOCATION_TYPE_LABEL[loc.type as Location['type']]})</span>
                          )}
                        </td>
                        <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
                        <td className="px-1 py-2">
                          <button onClick={() => removeItem(item.id)} className="p-1 text-neutral-400 hover:text-danger-500">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Reason — only when any selected item is currently at a client site */}
            {hasClientSiteSource && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Reason <span className="text-danger-500">*</span>
                </label>
                <SearchableSelect
                  options={REASON_OPTIONS}
                  value={reason}
                  onChange={setReason}
                  placeholder="Select reason…"
                />
              </div>
            )}
          </>
        ) : (
          <>
            {/* Product */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Product</label>
              <SearchableSelect
                options={qtyProducts.map(p => ({ value: p.id, label: p.name, sublabel: p.sku }))}
                value={selectedProductId}
                onChange={v => { setSelectedProductId(v); setSourceWarehouseId(''); setTransferQty(''); }}
                placeholder="Select product…"
              />
            </div>

            {/* Source warehouse */}
            {selectedProductId && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Source Warehouse</label>
                <SearchableSelect
                  options={warehouseStock.map(s => ({
                    value: (s.location as any)?.id,
                    label: (s.location as any)?.name,
                    sublabel: `${s.quantity} in stock`,
                  }))}
                  value={sourceWarehouseId}
                  onChange={v => { setSourceWarehouseId(v); setTransferQty(''); }}
                  placeholder="Select source…"
                />
              </div>
            )}

            {/* Quantity */}
            {sourceWarehouseId && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Quantity <span className="text-neutral-400 font-normal">(max {maxQty})</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={transferQty}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '')
                    setTransferQty(v)
                  }}
                  className="w-32 h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}
          </>
        )}

        {/* Destination type filter */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Destination Type</label>
          <SearchableSelect
            options={destTypeOptions}
            value={destinationTypeFilter}
            onChange={v => { setDestinationTypeFilter(v); setDestinationId('') }}
            placeholder="All Types"
          />
        </div>

        {/* Destination */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Destination</label>
          <SearchableSelect
            options={destOptions}
            value={destinationId}
            onChange={setDestinationId}
            placeholder="Select destination…"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Additional notes"
            className="w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Movement date */}
        <MovementDateInput value={movementDate} onChange={setMovementDate} />

        {/* Confirm / Submit */}
        {!showConfirm ? (
          <div className="relative w-fit group">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={disabledReason !== null}
              className="h-10 px-5 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-120"
            >
              Review Transfer
            </button>
            {disabledReason && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-[#2b2b2e] text-neutral-0 text-[12px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-lg">
                {disabledReason}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-[#2b2b2e]" />
              </div>
            )}
          </div>
        ) : (
          <div className="border border-warning-200 bg-warning-50 rounded-lg p-4 space-y-3">
            <p className="text-[13px] text-neutral-800 font-medium">
              {mode === 'tracked'
                ? `Move ${selectedItems.length} item(s) to ${destinations.find(d => d.id === destinationId)?.name}?`
                : `Transfer ${transferQty}× ${qtyProducts.find(p => p.id === selectedProductId)?.name} to ${destinations.find(d => d.id === destinationId)?.name}?`
              }
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="h-9 px-4 rounded-lg bg-neutral-900 text-neutral-0 text-[13px] font-medium hover:bg-neutral-800 disabled:opacity-40 transition-colors duration-120"
              >
                {submitting ? 'Processing…' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="h-9 px-4 rounded-lg border border-neutral-200 bg-neutral-0 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
