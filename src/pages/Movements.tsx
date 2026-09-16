import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product, Location, MovementType, InventoryItem } from '../lib/types'
import { MovementBadge } from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import SearchableSelect from '../components/SearchableSelect'

interface MovementRow {
  id: string
  product_id: string
  inventory_item_id: string | null
  from_location: string | null
  to_location: string | null
  performed_by: string
  movement_type: MovementType
  quantity: number
  movement_time: string
  created_at: string
  notes: string | null
  product: { name: string; sku: string } | null
  inventory_item: { serial_number: string } | null
  from_loc: { name: string } | null
  to_loc: { name: string } | null
  performer: { full_name: string } | null
}

const MOVEMENT_TYPES: MovementType[] = ['stock_in', 'stock_out', 'transfer', 'return', 'adjustment']

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function Movements() {
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  const [filterType, setFilterType] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterItems, setFilterItems] = useState<string[]>([])
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('inv_product_registry').select('*').order('name'),
      supabase.from('mock_cl_locations').select('*').order('name'),
      supabase.from('inv_inventory_item').select('id, serial_number, product:inv_product_registry(name)').order('serial_number'),
    ]).then(([prodRes, locRes, itemRes]) => {
      if (prodRes.data) setProducts(prodRes.data)
      if (locRes.data) setLocations(locRes.data)
      if (itemRes.data) setInventoryItems(itemRes.data as unknown as InventoryItem[])
    })
  }, [])

  useEffect(() => {
    fetchMovements()
  }, [filterType, filterProduct, filterLocation, filterItems, filterDateFrom, filterDateTo])

  async function fetchMovements() {
    setLoading(true)
    let query = supabase
      .from('inv_stock_movement')
      .select(
        '*, product:inv_product_registry(name,sku), inventory_item:inv_inventory_item(serial_number), from_loc:mock_cl_locations!inv_stock_movement_from_location_fkey(name), to_loc:mock_cl_locations!inv_stock_movement_to_location_fkey(name), performer:mock_plat_profiles(full_name)'
      )
      .order('movement_time', { ascending: false })

    if (filterType) query = query.eq('movement_type', filterType)
    if (filterProduct) query = query.eq('product_id', filterProduct)
    if (filterLocation) {
      query = query.or(`from_location.eq.${filterLocation},to_location.eq.${filterLocation}`)
    }
    if (filterItems.length > 0) {
      query = query.in('inventory_item_id', filterItems)
    }
    if (filterDateFrom) query = query.gte('movement_time', filterDateFrom + 'T00:00:00')
    if (filterDateTo) query = query.lte('movement_time', filterDateTo + 'T23:59:59')

    const { data } = await query
    setMovements((data as MovementRow[] | null) ?? [])
    setLoading(false)
  }

  const hasFilters = filterType || filterProduct || filterLocation || filterItems.length > 0 || filterDateFrom || filterDateTo

  return (
    <div className="p-6">
      <PageHeader title="Stock Movements" />

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500 mb-1">Type</label>
          <SearchableSelect
            options={MOVEMENT_TYPES.map(t => ({ value: t, label: t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))}
            value={filterType}
            onChange={setFilterType}
            placeholder="All Types"
            className="min-w-36"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500 mb-1">Product</label>
          <SearchableSelect
            options={products.map(p => ({ value: p.id, label: p.name, sublabel: p.sku }))}
            value={filterProduct}
            onChange={setFilterProduct}
            placeholder="All Products"
            className="min-w-44"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500 mb-1">Location</label>
          <SearchableSelect
            options={locations.map(l => ({ value: l.id, label: l.name }))}
            value={filterLocation}
            onChange={setFilterLocation}
            placeholder="All Locations"
            className="min-w-44"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500 mb-1">Item</label>
          <SearchableSelect
            multi
            options={inventoryItems.map(i => ({
              value: i.id,
              label: i.serial_number,
              sublabel: (i.product as any)?.name,
            }))}
            value={filterItems}
            onChange={setFilterItems}
            placeholder="All Items"
            className="min-w-48"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500 mb-1">From</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            className="h-10 rounded-lg border border-neutral-200 bg-neutral-0 px-3 text-[13px] text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500 mb-1">To</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            className="h-10 rounded-lg border border-neutral-200 bg-neutral-0 px-3 text-[13px] text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => { setFilterType(''); setFilterProduct(''); setFilterLocation(''); setFilterItems([]); setFilterDateFrom(''); setFilterDateTo('') }}
            className="h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-[13px] text-neutral-600 hover:bg-neutral-100 transition-colors duration-120"
          >
            Clear
          </button>
        )}
      </div>

      <div className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-100">
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Movement Date</th>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Logged At</th>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Type</th>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Product</th>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Serial #</th>
                <th className="text-right px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Qty</th>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">From</th>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">To</th>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">By</th>
                <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-[13px] text-neutral-400">Loading…</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-[13px] text-neutral-400">No movements found</td></tr>
              ) : (
                movements.map(m => (
                  <tr key={m.id} className="border-t border-neutral-200 hover:bg-neutral-25 transition-colors duration-120">
                    <td className="px-3 py-2 text-[12px] text-neutral-700 font-mono whitespace-nowrap">{formatDateTime(m.movement_time)}</td>
                    <td className="px-3 py-2 text-[12px] text-neutral-400 font-mono whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                    <td className="px-3 py-2"><MovementBadge type={m.movement_type} /></td>
                    <td className="px-3 py-2 text-[12px] text-neutral-700">{m.product?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-[12px] text-neutral-600 font-mono">{m.inventory_item?.serial_number ?? '—'}</td>
                    <td className="px-3 py-2 text-[12px] text-neutral-700 text-right font-mono">{m.quantity}</td>
                    {!m.from_loc && !m.to_loc ? (
                      <td colSpan={2} className="px-3 py-2 text-[12px] text-neutral-400 italic">No location change</td>
                    ) : m.movement_type === 'stock_in' && !m.from_loc && m.to_loc ? (
                      <td colSpan={2} className="px-3 py-2 text-[12px] text-neutral-600">Stock in to {m.to_loc.name}</td>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-[12px] text-neutral-600">{m.from_loc?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-neutral-600">{m.to_loc?.name ?? '—'}</td>
                      </>
                    )}
                    <td className="px-3 py-2 text-[12px] text-neutral-600">{m.performer?.full_name ?? '—'}</td>
                    <td className="px-3 py-2 text-[12px] text-neutral-500 max-w-48 truncate">{m.notes ?? ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-neutral-400">
        {movements.length} movement{movements.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
