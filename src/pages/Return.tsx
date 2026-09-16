import { useState, useEffect } from 'react'
import { supabase, BOSS_PROFILE_ID } from '../lib/supabase'
import type { InventoryItem, Location } from '../lib/types'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import MovementDateInput from '../components/MovementDateInput'
import { X } from 'lucide-react'

const RETURN_REASONS = [
  { value: 'defect', label: 'Defect — needs repair' },
  { value: 'de_installation', label: 'De-installation — client no longer needs it' },
  { value: 'swap', label: 'Swap — being replaced' },
  { value: 'end_of_contract', label: 'End of contract' },
]

export default function Return() {
  const { toast } = useToast()
  const [installedItems, setInstalledItems] = useState<InventoryItem[]>([])
  const [warehouses, setWarehouses] = useState<Location[]>([])
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [addItemId, setAddItemId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [movementDate, setMovementDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [itemsRes, locsRes] = await Promise.all([
      supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(id,name,sku), location:mock_cl_locations(id,name,type)')
        .eq('status', 'installed')
        .order('serial_number'),
      supabase.from('mock_cl_locations').select('*').eq('type', 'warehouse').order('name'),
    ])
    if (itemsRes.data) setInstalledItems(itemsRes.data as unknown as InventoryItem[])
    if (locsRes.data) setWarehouses(locsRes.data as unknown as Location[])
  }

  const selectedItems = installedItems.filter(i => selectedItemIds.includes(i.id))
  const availableToAdd = installedItems.filter(i => !selectedItemIds.includes(i.id))

  function addItem() {
    if (!addItemId) return
    setSelectedItemIds(prev => [...prev, addItemId])
    setAddItemId('')
  }

  function removeItem(id: string) {
    setSelectedItemIds(prev => prev.filter(x => x !== id))
  }

  async function handleSubmit() {
    if (selectedItems.length === 0 || !destinationId || !reason || !movementDate) {
      toast('error', 'Please fill in all required fields')
      return
    }
    const movementTime = new Date(movementDate)
    if (movementTime > new Date()) {
      toast('error', 'Movement date cannot be in the future.')
      return
    }

    setSubmitting(true)
    try {
      const now = new Date().toISOString()
      const newStatus = reason === 'defect' ? 'defect' : 'available'

      for (const item of selectedItems) {
        const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
          product_id: item.product_id,
          inventory_item_id: item.id,
          from_location: item.location_id,
          to_location: destinationId,
          performed_by: BOSS_PROFILE_ID,
          movement_type: 'return',
          quantity: 1,
          movement_time: movementTime.toISOString(),
          notes: notes.trim() || `Return reason: ${reason.replace(/_/g, ' ')}`,
        })
        if (moveErr) throw moveErr

        const { error: updateErr } = await supabase
          .from('inv_inventory_item')
          .update({ location_id: destinationId, status: newStatus, updated_at: now })
          .eq('id', item.id)
        if (updateErr) throw updateErr
      }

      const dest = warehouses.find(w => w.id === destinationId)
      toast('success', `Returned ${selectedItems.length} item(s) to ${dest?.name}`)
      setSelectedItemIds([])
      setDestinationId('')
      setReason('')
      setNotes('')
      setMovementDate('')
      loadData()
    } catch (err: any) {
      toast('error', err.message || 'Return failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader title="Return" />

      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-6 space-y-5">
        {/* Select items */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Select Installed Items
          </label>
          <div className="flex items-center gap-2">
            <SearchableSelect
              options={availableToAdd.map(i => ({
                value: i.id,
                label: i.serial_number,
                sublabel: `${(i.product as any)?.name} · ${(i.location as any)?.name ?? 'Unknown'}`,
              }))}
              value={addItemId}
              onChange={setAddItemId}
              placeholder="Search by serial number…"
              className="flex-1"
            />
            <button
              onClick={addItem}
              disabled={!addItemId}
              className="h-10 px-4 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 transition-colors duration-120"
            >
              Add
            </button>
          </div>
        </div>

        {/* Selected items */}
        {selectedItems.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-[11px] uppercase tracking-[0.06em] text-neutral-500">
                <th className="text-left px-3 py-2 font-medium">Serial</th>
                <th className="text-left px-3 py-2 font-medium">Product</th>
                <th className="text-left px-3 py-2 font-medium">Current Location</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {selectedItems.map(item => (
                <tr key={item.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2 font-mono text-[12px]">{item.serial_number}</td>
                  <td className="px-3 py-2 text-[12px]">{(item.product as any)?.name}</td>
                  <td className="px-3 py-2 text-[12px]">{(item.location as any)?.name ?? '—'}</td>
                  <td className="px-1 py-2">
                    <button onClick={() => removeItem(item.id)} className="p-1 text-neutral-400 hover:text-danger-500">
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Return destination */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Return To</label>
          <SearchableSelect
            options={warehouses.map(w => ({ value: w.id, label: w.name }))}
            value={destinationId}
            onChange={setDestinationId}
            placeholder="Select warehouse…"
          />
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Return Reason</label>
          <SearchableSelect
            options={RETURN_REASONS}
            value={reason}
            onChange={setReason}
            placeholder="Select reason…"
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

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || selectedItems.length === 0 || !destinationId || !reason || !movementDate}
          className="h-10 px-5 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-120"
        >
          {submitting ? 'Processing…' : `Return ${selectedItems.length || ''} Item${selectedItems.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
