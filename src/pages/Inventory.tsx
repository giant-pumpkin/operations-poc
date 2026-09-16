import { useEffect, useState } from 'react'
import { supabase, BOSS_PROFILE_ID } from '../lib/supabase'
import type { InventoryItem, Product, Location, Company, StockMovement, Designation } from '../lib/types'
import { StatusBadge, MovementBadge, DesignationBadge } from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { Search, X, ArrowRight, RefreshCw, Pencil, Check } from 'lucide-react'
import SearchableSelect from '../components/SearchableSelect'

type ItemStatus = InventoryItem['status']

const ALL_STATUSES: ItemStatus[] = ['available', 'scheduled', 'in_transit', 'installed', 'defect', 'in_repair']
const ALL_DESIGNATIONS: Designation[] = ['deployment', 'spare', 'maintenance']

function formatDate(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`
}

function warrantyLabel(item: InventoryItem): { text: string; style: string } {
  if (item.warranty_duration_years == null) return { text: 'No warranty', style: 'text-neutral-400' }
  if (!item.warranty_start_date) return { text: 'Not activated', style: 'text-neutral-500' }
  const end = new Date(item.warranty_end_date!)
  if (end > new Date()) return { text: `Active (expires ${end.toLocaleDateString()})`, style: 'text-success-700' }
  return { text: 'Expired', style: 'text-danger-700' }
}

export default function Inventory() {
  const { toast } = useToast()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [designationFilter, setDesignationFilter] = useState('')

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [showReallocate, setShowReallocate] = useState(false)
  const [reallocateTarget, setReallocateTarget] = useState('')
  const [reallocating, setReallocating] = useState(false)
  const [showBulkDesignation, setShowBulkDesignation] = useState(false)
  const [bulkDesignationTarget, setBulkDesignationTarget] = useState('')
  const [bulkDesignating, setBulkDesignating] = useState(false)

  // Inline editing
  const [editingClient, setEditingClient] = useState(false)
  const [editClientValue, setEditClientValue] = useState('')
  const [editingWarranty, setEditingWarranty] = useState(false)
  const [editWarrantyValue, setEditWarrantyValue] = useState('')
  const [editingDesignation, setEditingDesignation] = useState(false)
  const [editDesignationValue, setEditDesignationValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [itemsRes, productsRes, locationsRes, companiesRes] = await Promise.all([
      supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(id,name,sku,category), location:mock_cl_locations(id,name,type), allocated_client:mock_cl_companies!inv_inventory_item_allocated_client_id_fkey(id,name)')
        .order('created_at', { ascending: false }),
      supabase.from('inv_product_registry').select('*').eq('tracking_type', 'serial_tracked').order('name'),
      supabase.from('mock_cl_locations').select('*').order('name'),
      supabase.from('mock_cl_companies').select('*').order('name'),
    ])
    if (itemsRes.data) setItems(itemsRes.data as unknown as InventoryItem[])
    if (productsRes.data) setProducts(productsRes.data)
    if (locationsRes.data) setLocations(locationsRes.data as unknown as Location[])
    if (companiesRes.data) setCompanies(companiesRes.data as unknown as Company[])
    setLoading(false)
  }

  async function fetchMovements(itemId: string) {
    setMovementsLoading(true)
    const { data } = await supabase
      .from('inv_stock_movement')
      .select(
        '*, product:inv_product_registry(name,sku), from_loc:mock_cl_locations!inv_stock_movement_from_location_fkey(name), to_loc:mock_cl_locations!inv_stock_movement_to_location_fkey(name), performer:mock_plat_profiles(full_name)'
      )
      .eq('inventory_item_id', itemId)
      .order('movement_time', { ascending: false })
    if (data) setMovements(data as unknown as StockMovement[])
    setMovementsLoading(false)
  }

  function handleSelectItem(item: InventoryItem) {
    setSelectedItem(item)
    setEditingClient(false)
    setEditingWarranty(false)
    setEditingDesignation(false)
    fetchMovements(item.id)
  }

  const filtered = items.filter(item => {
    const prod = item.product as unknown as Product | null
    const loc = item.location as unknown as Location | null
    if (search && !item.serial_number.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter && item.status !== statusFilter) return false
    if (productFilter && prod?.id !== productFilter) return false
    if (locationFilter && loc?.id !== locationFilter) return false
    if (designationFilter && item.designation !== designationFilter) return false
    return true
  })

  function toggleCheck(id: string) {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (checkedIds.size === filtered.length) setCheckedIds(new Set())
    else setCheckedIds(new Set(filtered.map(i => i.id)))
  }

  async function handleReallocate() {
    if (checkedIds.size === 0) return
    setReallocating(true)
    try {
      const now = new Date().toISOString()
      const targetId = reallocateTarget || null
      const targetName = targetId ? companies.find(c => c.id === targetId)?.name : 'Unallocated'

      for (const id of checkedIds) {
        const item = items.find(i => i.id === id)
        if (!item) continue
        const oldClient = (item.allocated_client as unknown as Company | null)?.name ?? 'Unallocated'

        const { error: updateErr } = await supabase
          .from('inv_inventory_item')
          .update({ allocated_client_id: targetId, updated_at: now })
          .eq('id', id)
        if (updateErr) throw updateErr

        const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
          product_id: item.product_id,
          inventory_item_id: id,
          from_location: item.location_id,
          to_location: item.location_id,
          performed_by: BOSS_PROFILE_ID,
          movement_type: 'adjustment',
          quantity: 1,
          movement_time: now,
          notes: `Reallocated from ${oldClient} to ${targetName}`,
        })
        if (moveErr) throw moveErr
      }

      toast('success', `Reallocated ${checkedIds.size} item(s) to ${targetName}`)
      setCheckedIds(new Set())
      setShowReallocate(false)
      setReallocateTarget('')
      fetchData()
    } catch (err: any) {
      toast('error', err.message || 'Reallocation failed')
    } finally {
      setReallocating(false)
    }
  }

  async function handleBulkDesignation() {
    if (checkedIds.size === 0 || !bulkDesignationTarget) return
    setBulkDesignating(true)
    try {
      const now = new Date().toISOString()
      for (const id of checkedIds) {
        const item = items.find(i => i.id === id)
        if (!item || item.designation === bulkDesignationTarget) continue

        const { error: updateErr } = await supabase
          .from('inv_inventory_item')
          .update({ designation: bulkDesignationTarget, updated_at: now })
          .eq('id', id)
        if (updateErr) throw updateErr

        const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
          product_id: item.product_id,
          inventory_item_id: id,
          from_location: item.location_id,
          to_location: item.location_id,
          performed_by: BOSS_PROFILE_ID,
          movement_type: 'adjustment',
          quantity: 1,
          movement_time: now,
          notes: `Designation changed from ${item.designation} to ${bulkDesignationTarget}`,
        })
        if (moveErr) throw moveErr
      }

      const label = bulkDesignationTarget.replace(/\b\w/g, c => c.toUpperCase())
      toast('success', `Changed designation of ${checkedIds.size} item(s) to ${label}`)
      setCheckedIds(new Set())
      setShowBulkDesignation(false)
      setBulkDesignationTarget('')
      fetchData()
    } catch (err: any) {
      toast('error', err.message || 'Designation change failed')
    } finally {
      setBulkDesignating(false)
    }
  }

  function startEditClient() {
    if (!selectedItem) return
    const client = selectedItem.allocated_client as unknown as Company | null
    setEditClientValue(client?.id ?? '')
    setEditingClient(true)
  }

  async function saveClient() {
    if (!selectedItem) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const newClientId = editClientValue || null
      const oldClient = (selectedItem.allocated_client as unknown as Company | null)?.name ?? 'Unallocated'
      const newClientName = newClientId ? companies.find(c => c.id === newClientId)?.name : 'Unallocated'

      const { error: updateErr } = await supabase
        .from('inv_inventory_item')
        .update({ allocated_client_id: newClientId, updated_at: now })
        .eq('id', selectedItem.id)
      if (updateErr) throw updateErr

      const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
        product_id: selectedItem.product_id,
        inventory_item_id: selectedItem.id,
        from_location: selectedItem.location_id,
        to_location: selectedItem.location_id,
        performed_by: BOSS_PROFILE_ID,
        movement_type: 'adjustment',
        quantity: 1,
        movement_time: now,
        notes: `Reallocated from ${oldClient} to ${newClientName}`,
      })
      if (moveErr) throw moveErr

      toast('success', `Client updated to ${newClientName}`)
      setEditingClient(false)
      await fetchData()
      // Re-select to refresh detail
      const { data: refreshed } = await supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(id,name,sku,category), location:mock_cl_locations(id,name,type), allocated_client:mock_cl_companies!inv_inventory_item_allocated_client_id_fkey(id,name)')
        .eq('id', selectedItem.id)
        .single()
      if (refreshed) {
        setSelectedItem(refreshed as unknown as InventoryItem)
        fetchMovements(refreshed.id)
      }
    } catch (err: any) {
      toast('error', err.message || 'Failed to update client')
    } finally {
      setSaving(false)
    }
  }

  function startEditWarranty() {
    if (!selectedItem) return
    setEditWarrantyValue(selectedItem.warranty_duration_years != null ? String(selectedItem.warranty_duration_years) : '')
    setEditingWarranty(true)
  }

  async function saveWarranty() {
    if (!selectedItem) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const newDuration = editWarrantyValue ? Number(editWarrantyValue) : null

      const { error } = await supabase
        .from('inv_inventory_item')
        .update({ warranty_duration_years: newDuration, updated_at: now })
        .eq('id', selectedItem.id)
      if (error) throw error

      toast('success', newDuration ? `Warranty set to ${newDuration} years` : 'Warranty removed')
      setEditingWarranty(false)
      const { data: refreshed } = await supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(id,name,sku,category), location:mock_cl_locations(id,name,type), allocated_client:mock_cl_companies!inv_inventory_item_allocated_client_id_fkey(id,name)')
        .eq('id', selectedItem.id)
        .single()
      if (refreshed) setSelectedItem(refreshed as unknown as InventoryItem)
    } catch (err: any) {
      toast('error', err.message || 'Failed to update warranty')
    } finally {
      setSaving(false)
    }
  }

  function startEditDesignation() {
    if (!selectedItem) return
    setEditDesignationValue(selectedItem.designation)
    setEditingDesignation(true)
  }

  async function saveDesignation() {
    if (!selectedItem || !editDesignationValue) return
    if (editDesignationValue === selectedItem.designation) {
      setEditingDesignation(false)
      return
    }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const { error: updateErr } = await supabase
        .from('inv_inventory_item')
        .update({ designation: editDesignationValue, updated_at: now })
        .eq('id', selectedItem.id)
      if (updateErr) throw updateErr

      const { error: moveErr } = await supabase.from('inv_stock_movement').insert({
        product_id: selectedItem.product_id,
        inventory_item_id: selectedItem.id,
        from_location: selectedItem.location_id,
        to_location: selectedItem.location_id,
        performed_by: BOSS_PROFILE_ID,
        movement_type: 'adjustment',
        quantity: 1,
        movement_time: now,
        notes: `Designation changed from ${selectedItem.designation} to ${editDesignationValue}`,
      })
      if (moveErr) throw moveErr

      const label = editDesignationValue.replace(/\b\w/g, c => c.toUpperCase())
      toast('success', `Designation changed to ${label}`)
      setEditingDesignation(false)
      await fetchData()
      const { data: refreshed } = await supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(id,name,sku,category), location:mock_cl_locations(id,name,type), allocated_client:mock_cl_companies!inv_inventory_item_allocated_client_id_fkey(id,name)')
        .eq('id', selectedItem.id)
        .single()
      if (refreshed) {
        setSelectedItem(refreshed as unknown as InventoryItem)
        fetchMovements(refreshed.id)
      }
    } catch (err: any) {
      toast('error', err.message || 'Failed to update designation')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'h-10 rounded-lg border border-neutral-200 bg-neutral-0 px-3 text-[13px] text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500'

  return (
    <div className="p-6">
      <PageHeader title="Inventory Items" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search serial number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${inputClass} pl-8 w-64`}
          />
        </div>
        <SearchableSelect
          options={ALL_STATUSES.map(s => ({
            value: s,
            label: s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="All Statuses"
        />
        <SearchableSelect
          options={products.map(p => ({ value: p.id, label: p.name, sublabel: p.sku }))}
          value={productFilter}
          onChange={setProductFilter}
          placeholder="All Products"
        />
        <SearchableSelect
          options={locations.map(l => ({ value: l.id, label: l.name }))}
          value={locationFilter}
          onChange={setLocationFilter}
          placeholder="All Locations"
        />
        <SearchableSelect
          options={ALL_DESIGNATIONS.map(d => ({
            value: d,
            label: d.replace(/\b\w/g, c => c.toUpperCase()),
          }))}
          value={designationFilter}
          onChange={setDesignationFilter}
          placeholder="All Designations"
        />
        <span className="text-[12px] text-neutral-500 ml-auto">{filtered.length} items</span>
      </div>

      {/* Reallocate action bar */}
      {checkedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-info-50 border border-info-200 rounded-lg">
          <span className="text-[13px] text-neutral-700 font-medium">{checkedIds.size} selected</span>
          {!showReallocate && !showBulkDesignation ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowReallocate(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[12px] font-medium hover:bg-neutral-800 transition-colors duration-120"
              >
                <RefreshCw size={13} /> Reallocate
              </button>
              <button
                onClick={() => setShowBulkDesignation(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors duration-120"
              >
                Change Designation
              </button>
            </div>
          ) : showReallocate ? (
            <>
              <SearchableSelect
                options={[
                  { value: '__unallocated__', label: 'Unallocated' },
                  ...companies.map(c => ({ value: c.id, label: c.name })),
                ]}
                value={reallocateTarget}
                onChange={v => setReallocateTarget(v === '__unallocated__' ? '' : v)}
                placeholder="Select client…"
                className="w-48"
              />
              <button
                onClick={handleReallocate}
                disabled={reallocating}
                className="h-8 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[12px] font-medium hover:bg-neutral-800 disabled:opacity-40 transition-colors duration-120"
              >
                {reallocating ? 'Saving…' : 'Confirm'}
              </button>
              <button
                onClick={() => { setShowReallocate(false); setReallocateTarget('') }}
                className="h-8 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <SearchableSelect
                options={ALL_DESIGNATIONS.map(d => ({
                  value: d,
                  label: d.replace(/\b\w/g, c => c.toUpperCase()),
                }))}
                value={bulkDesignationTarget}
                onChange={setBulkDesignationTarget}
                placeholder="Select designation…"
                className="w-48"
              />
              <button
                onClick={handleBulkDesignation}
                disabled={bulkDesignating || !bulkDesignationTarget}
                className="h-8 px-3 rounded-lg bg-neutral-900 text-neutral-0 text-[12px] font-medium hover:bg-neutral-800 disabled:opacity-40 transition-colors duration-120"
              >
                {bulkDesignating ? 'Saving…' : 'Confirm'}
              </button>
              <button
                onClick={() => { setShowBulkDesignation(false); setBulkDesignationTarget('') }}
                className="h-8 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          <button
            onClick={() => { setCheckedIds(new Set()); setShowReallocate(false); setShowBulkDesignation(false) }}
            className="ml-auto text-neutral-400 hover:text-neutral-600"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex gap-4">
        {/* Table */}
        <div className={`bg-neutral-0 border border-neutral-200 rounded-xl overflow-hidden ${selectedItem ? 'flex-1' : 'w-full'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && checkedIds.size === filtered.length}
                      onChange={toggleAll}
                      className="rounded accent-brand-500"
                    />
                  </th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Serial Number</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Product</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">SKU</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Client</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Location</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Status</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Designation</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-[12px] text-neutral-500">Loading…</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-[12px] text-neutral-500">No items found</td>
                  </tr>
                ) : (
                  filtered.map(item => {
                    const prod = item.product as unknown as Product | null
                    const loc = item.location as unknown as Location | null
                    const client = item.allocated_client as unknown as Company | null
                    const isSelected = selectedItem?.id === item.id
                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        className={`border-t border-neutral-200 cursor-pointer transition-colors duration-120 ${
                          isSelected ? 'bg-success-50 border-l-2 border-l-success-500' : 'hover:bg-neutral-25'
                        }`}
                      >
                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checkedIds.has(item.id)}
                            onChange={() => toggleCheck(item.id)}
                            className="rounded accent-brand-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-[12px] font-mono text-neutral-800">{item.serial_number}</td>
                        <td className="px-3 py-2 text-[12px] text-neutral-700">{prod?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-[12px] font-mono text-neutral-500">{prod?.sku ?? '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-neutral-700">
                          {client?.name ?? <span className="text-neutral-400 italic">Unallocated</span>}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-neutral-700">{loc?.name ?? 'In Transit'}</td>
                        <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
                        <td className="px-3 py-2"><DesignationBadge designation={item.designation} /></td>
                        <td className="px-3 py-2 text-[12px] text-neutral-500">{formatDate(new Date(item.created_at))}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        {selectedItem && (() => {
          const client = selectedItem.allocated_client as unknown as Company | null
          const warranty = warrantyLabel(selectedItem)
          return (
            <div className="w-96 shrink-0 bg-neutral-0 border border-neutral-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-100">
                <h3 className="text-[13px] font-semibold text-neutral-800">Item Detail</h3>
                <button onClick={() => setSelectedItem(null)} className="text-neutral-400 hover:text-neutral-600">
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-220px)]">
                {/* Item info */}
                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] uppercase tracking-[0.06em] text-neutral-500">Serial Number</span>
                    <p className="text-[13px] font-mono text-neutral-800">{selectedItem.serial_number}</p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-[0.06em] text-neutral-500">Product</span>
                    <p className="text-[13px] text-neutral-800">
                      {(selectedItem.product as unknown as Product | null)?.name ?? '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-[0.06em] text-neutral-500">SKU</span>
                    <p className="text-[13px] font-mono text-neutral-500">
                      {(selectedItem.product as unknown as Product | null)?.sku ?? '—'}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] uppercase tracking-[0.06em] text-neutral-500">Allocated Client</span>
                      {!editingClient && (
                        <button onClick={startEditClient} className="text-neutral-400 hover:text-neutral-600">
                          <Pencil size={11} />
                        </button>
                      )}
                    </div>
                    {editingClient ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <SearchableSelect
                          options={[
                            { value: '__unallocated__', label: 'Unallocated' },
                            ...companies.map(c => ({ value: c.id, label: c.name })),
                          ]}
                          value={editClientValue || '__unallocated__'}
                          onChange={v => setEditClientValue(v === '__unallocated__' ? '' : v)}
                          placeholder="Select client…"
                          className="flex-1"
                        />
                        <button
                          onClick={saveClient}
                          disabled={saving}
                          className="p-1.5 rounded-md bg-neutral-900 text-neutral-0 hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingClient(false)}
                          className="p-1.5 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-[13px] text-neutral-800">
                        {client?.name ?? <span className="text-neutral-400 italic">Unallocated</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <span className="text-[11px] uppercase tracking-[0.06em] text-neutral-500">Location</span>
                      <p className="text-[13px] text-neutral-800">
                        {(selectedItem.location as unknown as Location | null)?.name ?? 'In Transit'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-[0.06em] text-neutral-500">Status</span>
                      <div className="mt-0.5"><StatusBadge status={selectedItem.status} /></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] uppercase tracking-[0.06em] text-neutral-500">Designation</span>
                      {!editingDesignation && (
                        <button onClick={startEditDesignation} className="text-neutral-400 hover:text-neutral-600">
                          <Pencil size={11} />
                        </button>
                      )}
                    </div>
                    {editingDesignation ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <SearchableSelect
                          options={ALL_DESIGNATIONS.map(d => ({
                            value: d,
                            label: d.replace(/\b\w/g, c => c.toUpperCase()),
                          }))}
                          value={editDesignationValue}
                          onChange={setEditDesignationValue}
                          placeholder="Select…"
                          className="flex-1"
                        />
                        <button
                          onClick={saveDesignation}
                          disabled={saving}
                          className="p-1.5 rounded-md bg-neutral-900 text-neutral-0 hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingDesignation(false)}
                          className="p-1.5 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-0.5"><DesignationBadge designation={selectedItem.designation} /></div>
                    )}
                  </div>
                </div>

                {/* Warranty */}
                <div className="border-t border-neutral-100 pt-3 space-y-2">
                  <h4 className="text-[11px] uppercase tracking-[0.06em] text-neutral-500">Warranty</h4>
                  <div className="flex gap-4">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-neutral-400">Duration</span>
                        {!editingWarranty && (
                          <button onClick={startEditWarranty} className="text-neutral-400 hover:text-neutral-600">
                            <Pencil size={10} />
                          </button>
                        )}
                      </div>
                      {editingWarranty ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <SearchableSelect
                            options={[
                              { value: '', label: 'None' },
                              { value: '3', label: '3 years' },
                              { value: '5', label: '5 years' },
                            ]}
                            value={editWarrantyValue}
                            onChange={setEditWarrantyValue}
                            placeholder="None"
                            className="w-28"
                          />
                          <button
                            onClick={saveWarranty}
                            disabled={saving}
                            className="p-1.5 rounded-md bg-neutral-900 text-neutral-0 hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditingWarranty(false)}
                            className="p-1.5 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 transition-colors"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <p className="text-[13px] text-neutral-700">
                          {selectedItem.warranty_duration_years != null
                            ? `${selectedItem.warranty_duration_years} years`
                            : '—'}
                        </p>
                      )}
                    </div>
                    <div>
                      <span className="text-[11px] text-neutral-400">Status</span>
                      <p className={`text-[13px] font-medium ${warranty.style}`}>{warranty.text}</p>
                    </div>
                  </div>
                </div>

                {/* Movement History */}
                <div className="border-t border-neutral-100 pt-3">
                  <h4 className="text-[11px] uppercase tracking-[0.06em] text-neutral-500 mb-2">Movement History</h4>
                  {movementsLoading ? (
                    <p className="text-[12px] text-neutral-500">Loading…</p>
                  ) : movements.length === 0 ? (
                    <p className="text-[12px] text-neutral-500">No movements recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {movements.map(m => {
                        const from = m.from_loc as unknown as { name: string } | null
                        const to = m.to_loc as unknown as { name: string } | null
                        const performer = m.performer as unknown as { full_name: string } | null
                        return (
                          <div key={m.id} className="border border-neutral-200 rounded-lg p-2.5 text-[12px]">
                            <div className="flex items-center justify-between mb-1">
                              <MovementBadge type={m.movement_type} />
                              <span className="text-neutral-500">
                                {formatDate(new Date(m.movement_time))}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-neutral-600">
                              <span>{from?.name ?? '—'}</span>
                              <ArrowRight size={12} className="text-neutral-400" />
                              <span>{to?.name ?? '—'}</span>
                            </div>
                            {performer && (
                              <div className="text-neutral-500 mt-0.5">by {performer.full_name}</div>
                            )}
                            {m.notes && (
                              <div className="text-neutral-500 mt-0.5 italic">{m.notes}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
