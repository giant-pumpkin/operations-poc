import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Product, InventoryItem, WarehouseStock, StockMovement } from '../lib/types'
import { TrackingBadge, StatusBadge, MovementBadge } from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { Plus, X, Search, Pencil } from 'lucide-react'
import SearchableSelect from '../components/SearchableSelect'
import { formatDateTime } from '../lib/format'

const STOCK_STATUS_ORDER = ['available', 'in_transit', 'installed', 'defect', 'in_repair', 'scheduled']

function summarizeCounts(counts: Record<string, number>): string {
  const parts = STOCK_STATUS_ORDER
    .filter(s => counts[s])
    .map(s => `${counts[s]} ${s.replace(/_/g, ' ')}`)
  return parts.length ? parts.join(', ') : '0'
}

const CATEGORIES = [
  'Adapters', 'Cable', 'Ceiling Mount', 'Data storage', 'Demo', 'Display',
  'Frames', 'LED module', 'Mounts', 'Office supplies', 'PC',
  'Play box', 'Printer', 'Routers', 'Scent Diffuser', 'Scent Diffuser Tank',
  'Services', 'SIM card', 'Smart camera', 'Software', 'Streaming Device',
  'Switch', 'TV stand - Vesa', 'USB Cameras', 'USB Tracker',
  'Video processor', 'Warranty',
]

interface ProductWithCounts extends Product {
  inventory_counts?: Record<string, number>
  total_qty?: number
}

const EMPTY_FORM: Partial<Product> = {
  sku: '',
  name: '',
  manufacturer: '',
  model: '',
  tracking_type: 'serial_tracked',
  category: '',
  player: false,
  active: true,
}

const CATEGORY_OPTIONS = CATEGORIES.map(c => ({ value: c, label: c }))
const TRACKING_OPTIONS = [
  { value: 'serial_tracked', label: 'Serial Tracked' },
  { value: 'quantity_only', label: 'Quantity Only' },
]
const ACTIVE_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

export default function Products() {
  const { toast } = useToast()
  const [products, setProducts] = useState<ProductWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [trackingFilter, setTrackingFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<Partial<Product>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Detail panel state
  const [detailItems, setDetailItems] = useState<InventoryItem[]>([])
  const [detailStock, setDetailStock] = useState<WarehouseStock[]>([])
  const [detailMovements, setDetailMovements] = useState<StockMovement[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const { data: prods, error } = await supabase
      .from('inv_product_registry')
      .select('*')
      .order('name')

    if (error) {
      toast('error', 'Failed to load products')
      setLoading(false)
      return
    }

    // Fetch inventory counts for serial-tracked
    const { data: items } = await supabase
      .from('inv_inventory_item')
      .select('product_id, status')
      .neq('status', 'written_off')

    // Fetch warehouse stock for quantity-only
    const { data: stocks } = await supabase
      .from('inv_warehouse_stock')
      .select('product_id, quantity')

    const itemCounts: Record<string, Record<string, number>> = {}
    items?.forEach(item => {
      if (!itemCounts[item.product_id]) itemCounts[item.product_id] = {}
      itemCounts[item.product_id][item.status] = (itemCounts[item.product_id][item.status] || 0) + 1
    })

    const stockTotals: Record<string, number> = {}
    stocks?.forEach(s => {
      stockTotals[s.product_id] = (stockTotals[s.product_id] || 0) + s.quantity
    })

    const enriched: ProductWithCounts[] = (prods || []).map(p => ({
      ...p,
      inventory_counts: itemCounts[p.id],
      total_qty: stockTotals[p.id],
    }))

    setProducts(enriched)
    setLoading(false)
  }, [toast])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const loadDetail = useCallback(async (product: Product) => {
    setSelectedProduct(product)
    setDetailLoading(true)
    setDetailItems([])
    setDetailStock([])
    setDetailMovements([])

    if (product.tracking_type === 'serial_tracked') {
      const { data } = await supabase
        .from('inv_inventory_item')
        .select('*, product:inv_product_registry(name, sku), location:mock_cl_locations(name)')
        .eq('product_id', product.id)
        .order('serial_number')
      setDetailItems((data as any) || [])
    } else {
      const { data } = await supabase
        .from('inv_warehouse_stock')
        .select('*, product:inv_product_registry(name, sku), location:mock_cl_locations(name), allocated_client:mock_cl_companies!inv_warehouse_stock_allocated_client_id_fkey(id, name)')
        .eq('product_id', product.id)
      setDetailStock((data as any) || [])
    }

    const { data: movements } = await supabase
      .from('inv_stock_movement')
      .select('*, product:inv_product_registry(name, sku), from_loc:mock_cl_locations!inv_stock_movement_from_location_fkey(name), to_loc:mock_cl_locations!inv_stock_movement_to_location_fkey(name), performer:mock_plat_profiles(full_name)')
      .eq('product_id', product.id)
      .order('movement_time', { ascending: false })
    setDetailMovements((movements as any) || [])
    setDetailLoading(false)
  }, [])

  const openAdd = () => {
    setEditingProduct(null)
    setFormData({ ...EMPTY_FORM })
    setShowForm(true)
  }

  const openEdit = (p: Product) => {
    setEditingProduct(p)
    setFormData({
      sku: p.sku,
      name: p.name,
      manufacturer: p.manufacturer || '',
      model: p.model || '',
      tracking_type: p.tracking_type,
      category: p.category || '',
      player: p.player,
      active: p.active,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.sku || !formData.name || !formData.tracking_type) {
      toast('error', 'SKU, name, and tracking type are required')
      return
    }
    setSaving(true)

    const payload = {
      sku: formData.sku,
      name: formData.name,
      manufacturer: formData.manufacturer || null,
      model: formData.model || null,
      tracking_type: formData.tracking_type,
      category: formData.category || null,
      player: formData.player ?? false,
      active: formData.active ?? true,
    }

    if (editingProduct) {
      const { error } = await supabase
        .from('inv_product_registry')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingProduct.id)
      if (error) {
        toast('error', `Update failed: ${error.message}`)
      } else {
        toast('success', `${payload.name} updated`)
        setShowForm(false)
        fetchProducts()
      }
    } else {
      const { error } = await supabase
        .from('inv_product_registry')
        .insert(payload)
      if (error) {
        toast('error', `Create failed: ${error.message}`)
      } else {
        toast('success', `${payload.name} created`)
        setShowForm(false)
        fetchProducts()
      }
    }
    setSaving(false)
  }

  const filtered = products.filter(p => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !p.name.toLowerCase().includes(q) &&
        !p.sku.toLowerCase().includes(q) &&
        !(p.manufacturer || '').toLowerCase().includes(q)
      )
        return false
    }
    if (categoryFilter && p.category !== categoryFilter) return false
    if (trackingFilter && p.tracking_type !== trackingFilter) return false
    if (activeFilter === 'active' && !p.active) return false
    if (activeFilter === 'inactive' && p.active) return false
    return true
  })

  return (
    <div className="p-6">
      <PageHeader title="Product Registry">
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 h-10 bg-neutral-900 text-neutral-0 rounded-lg text-[13px] font-medium hover:bg-neutral-800 transition-colors duration-120"
        >
          <Plus size={15} />
          Add Product
        </button>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search name, SKU, manufacturer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-8 pr-3 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <SearchableSelect
          options={CATEGORY_OPTIONS}
          value={categoryFilter}
          onChange={setCategoryFilter}
          placeholder="All Categories"
          className="w-48"
        />
        <SearchableSelect
          options={TRACKING_OPTIONS}
          value={trackingFilter}
          onChange={setTrackingFilter}
          placeholder="All Tracking"
          className="w-40"
        />
        <SearchableSelect
          options={ACTIVE_OPTIONS}
          value={activeFilter}
          onChange={setActiveFilter}
          placeholder="All Status"
          className="w-36"
        />
      </div>

      {/* Table */}
      <div className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-0">
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-100">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">SKU</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Name</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Category</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Tracking</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Stock</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Active</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-neutral-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-neutral-400">No products found</td></tr>
            ) : (
              filtered.map(p => (
                <tr
                  key={p.id}
                  onClick={() => loadDetail(p)}
                  className={`border-t border-neutral-200 hover:bg-neutral-25 cursor-pointer transition-colors duration-120 ${selectedProduct?.id === p.id ? 'bg-success-50' : ''}`}
                >
                  <td className="px-4 py-2.5 text-[12px] font-mono text-neutral-700">{p.sku}</td>
                  <td className="px-4 py-2.5 text-[12px] text-neutral-900 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-[12px] text-neutral-600">{p.category || '—'}</td>
                  <td className="px-4 py-2.5"><TrackingBadge type={p.tracking_type} /></td>
                  <td className="px-4 py-2.5 text-[12px] font-mono text-neutral-700">
                    {p.tracking_type === 'serial_tracked'
                      ? (p.inventory_counts ? summarizeCounts(p.inventory_counts) : '0')
                      : (p.total_qty ?? 0)
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`w-2 h-2 rounded-full inline-block ${p.active ? 'bg-success-500' : 'bg-neutral-300'}`} />
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(p) }}
                      className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Panel */}
      {selectedProduct && (
        <div key={selectedProduct.id} className="mt-6 border border-neutral-200 rounded-xl bg-neutral-0 overflow-hidden animate-rise">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-neutral-25">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">{selectedProduct.name}</h2>
              <div className="flex items-center gap-3 mt-1 text-[12px] text-neutral-500">
                <span className="font-mono">{selectedProduct.sku}</span>
                {selectedProduct.manufacturer && <span>{selectedProduct.manufacturer}</span>}
                {selectedProduct.model && <span>{selectedProduct.model}</span>}
                <TrackingBadge type={selectedProduct.tracking_type} />
              </div>
            </div>
            <button onClick={() => setSelectedProduct(null)} className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400">
              <X size={16} />
            </button>
          </div>

          {detailLoading ? (
            <div className="px-5 py-8 text-center text-[13px] text-neutral-400">Loading details...</div>
          ) : (
            <div className="p-5 space-y-6">
              {/* Serial-tracked items */}
              {selectedProduct.tracking_type === 'serial_tracked' && (
                <div>
                  <h3 className="text-[13px] font-semibold text-neutral-700 mb-2">
                    Inventory Items ({detailItems.length})
                  </h3>
                  {detailItems.length === 0 ? (
                    <p className="text-[12px] text-neutral-400">No items in inventory</p>
                  ) : (
                    <div className="border border-neutral-200 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-neutral-100">
                            <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Serial Number</th>
                            <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Location</th>
                            <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailItems.map(item => (
                            <tr key={item.id} className="border-t border-neutral-200">
                              <td className="px-3 py-2 text-[12px] font-mono text-neutral-800">{item.serial_number}</td>
                              <td className="px-3 py-2 text-[12px] text-neutral-600">{(item as any).location?.name || 'In Transit'}</td>
                              <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Quantity-only stock */}
              {selectedProduct.tracking_type === 'quantity_only' && (
                <div>
                  <h3 className="text-[13px] font-semibold text-neutral-700 mb-2">Warehouse Stock</h3>
                  {detailStock.length === 0 ? (
                    <p className="text-[12px] text-neutral-400">No stock records</p>
                  ) : (
                    <div className="border border-neutral-200 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-neutral-100">
                            <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Pool</th>
                            <th className="text-right px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailStock.map(s => {
                            const locName = (s as any).location?.name ?? '—'
                            const clientName = (s as any).allocated_client?.name
                            const desLabel = (s.designation ?? 'deployment').replace(/\b\w/g, (c: string) => c.toUpperCase())
                            const poolLabel = clientName
                              ? `${locName} · ${clientName} · ${desLabel}`
                              : `${locName} · Unallocated · ${desLabel}`
                            return (
                              <tr key={s.id} className="border-t border-neutral-200">
                                <td className="px-3 py-2 text-[12px] text-neutral-800">{poolLabel}</td>
                                <td className="px-3 py-2 text-[12px] font-mono text-neutral-700 text-right">{s.quantity}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Movement History */}
              <div>
                <h3 className="text-[13px] font-semibold text-neutral-700 mb-2">Movement History</h3>
                {detailMovements.length === 0 ? (
                  <p className="text-[12px] text-neutral-400">No movements recorded</p>
                ) : (
                  <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-neutral-100">
                          <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Time</th>
                          <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Type</th>
                          <th className="text-right px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Qty</th>
                          <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">From</th>
                          <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">To</th>
                          <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">By</th>
                          <th className="text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailMovements.map(m => (
                          <tr key={m.id} className="border-t border-neutral-200">
                            <td className="px-3 py-2 text-[12px] font-mono text-neutral-600 whitespace-nowrap">
                              {formatDateTime(m.movement_time)}
                            </td>
                            <td className="px-3 py-2"><MovementBadge type={m.movement_type} /></td>
                            <td className="px-3 py-2 text-[12px] font-mono text-neutral-700 text-right">{m.quantity}</td>
                            <td className="px-3 py-2 text-[12px] text-neutral-600">{(m as any).from_loc?.name || '—'}</td>
                            <td className="px-3 py-2 text-[12px] text-neutral-600">{(m as any).to_loc?.name || '—'}</td>
                            <td className="px-3 py-2 text-[12px] text-neutral-600">{(m as any).performer?.full_name || '—'}</td>
                            <td className="px-3 py-2 text-[12px] text-neutral-500 max-w-[200px] truncate">{m.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 animate-fade-in">
          <div
            className="bg-neutral-0 rounded-2xl shadow-lg w-full max-w-lg border border-neutral-200 animate-modal"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <h2 className="text-base font-semibold text-neutral-900">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-neutral-700 mb-1">SKU *</label>
                  <input
                    type="text"
                    value={formData.sku || ''}
                    onChange={e => setFormData(f => ({ ...f, sku: e.target.value }))}
                    className="w-full h-10 px-3 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-neutral-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                    className="w-full h-10 px-3 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-neutral-700 mb-1">Manufacturer</label>
                  <input
                    type="text"
                    value={formData.manufacturer || ''}
                    onChange={e => setFormData(f => ({ ...f, manufacturer: e.target.value }))}
                    className="w-full h-10 px-3 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-neutral-700 mb-1">Model</label>
                  <input
                    type="text"
                    value={formData.model || ''}
                    onChange={e => setFormData(f => ({ ...f, model: e.target.value }))}
                    className="w-full h-10 px-3 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-neutral-700 mb-1">Tracking Type *</label>
                  <SearchableSelect
                    options={TRACKING_OPTIONS}
                    value={formData.tracking_type || 'serial_tracked'}
                    onChange={v => setFormData(f => ({ ...f, tracking_type: v as any }))}
                    disabled={!!editingProduct}
                    placeholder="Select tracking type"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-neutral-700 mb-1">Category</label>
                  <SearchableSelect
                    options={CATEGORY_OPTIONS}
                    value={formData.category || ''}
                    onChange={v => setFormData(f => ({ ...f, category: v }))}
                    placeholder="Select category..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-[13px] text-neutral-700">
                  <input
                    type="checkbox"
                    checked={formData.player ?? false}
                    onChange={e => setFormData(f => ({ ...f, player: e.target.checked }))}
                    className="rounded accent-brand-500"
                  />
                  Media Player
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200">
              <button
                onClick={() => setShowForm(false)}
                className="h-10 px-4 bg-neutral-0 border border-neutral-200 rounded-lg text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="h-10 px-4 bg-neutral-900 text-neutral-0 rounded-lg text-[13px] font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingProduct ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.97) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
