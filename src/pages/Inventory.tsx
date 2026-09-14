import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { InventoryItem, Product, Location, StockMovement } from '../lib/types'
import { StatusBadge, MovementBadge } from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import { Search, X, ArrowRight } from 'lucide-react'

type ItemStatus = InventoryItem['status']

const ALL_STATUSES: ItemStatus[] = ['available', 'reserved', 'installed', 'in_transit', 'defect']

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [itemsRes, productsRes, locationsRes] = await Promise.all([
      supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(id,name,sku,category), location:mock_cl_locations(id,name,type)')
        .order('created_at', { ascending: false }),
      supabase.from('inv_product_registry').select('*').eq('tracking_type', 'serial_tracked').order('name'),
      supabase.from('mock_cl_locations').select('*').order('name'),
    ])
    if (itemsRes.data) setItems(itemsRes.data as unknown as InventoryItem[])
    if (productsRes.data) setProducts(productsRes.data)
    if (locationsRes.data) setLocations(locationsRes.data as unknown as Location[])
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
    fetchMovements(item.id)
  }

  const filtered = items.filter(item => {
    const prod = item.product as unknown as Product | null
    const loc = item.location as unknown as Location | null
    if (search && !item.serial_number.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter && item.status !== statusFilter) return false
    if (productFilter && prod?.id !== productFilter) return false
    if (locationFilter && loc?.id !== locationFilter) return false
    return true
  })

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
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputClass}>
          <option value="">All Statuses</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </option>
          ))}
        </select>
        <select value={productFilter} onChange={e => setProductFilter(e.target.value)} className={inputClass}>
          <option value="">All Products</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className={inputClass}>
          <option value="">All Locations</option>
          {locations.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <span className="text-[12px] text-neutral-500 ml-auto">{filtered.length} items</span>
      </div>

      <div className="flex gap-4">
        {/* Table */}
        <div className={`bg-neutral-0 border border-neutral-200 rounded-xl overflow-hidden ${selectedItem ? 'flex-1' : 'w-full'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Serial Number</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Product</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">SKU</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Location</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Status</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-neutral-500">Loading…</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-neutral-500">No items found</td>
                  </tr>
                ) : (
                  filtered.map(item => {
                    const prod = item.product as unknown as Product | null
                    const loc = item.location as unknown as Location | null
                    const isSelected = selectedItem?.id === item.id
                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        className={`border-t border-neutral-200 cursor-pointer transition-colors duration-120 ${
                          isSelected ? 'bg-success-50 border-l-2 border-l-success-500' : 'hover:bg-neutral-25'
                        }`}
                      >
                        <td className="px-3 py-2 text-[12px] font-mono text-neutral-800">{item.serial_number}</td>
                        <td className="px-3 py-2 text-[12px] text-neutral-700">{prod?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-[12px] font-mono text-neutral-500">{prod?.sku ?? '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-neutral-700">{loc?.name ?? 'In Transit'}</td>
                        <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
                        <td className="px-3 py-2 text-[12px] text-neutral-500">{new Date(item.created_at).toLocaleDateString()}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        {selectedItem && (
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
              </div>

              {/* Movement History */}
              <div>
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
                              {new Date(m.movement_time).toLocaleDateString()}
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
        )}
      </div>
    </div>
  )
}
