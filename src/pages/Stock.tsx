import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ItemStatus } from '../lib/types'
import { ChevronRight } from 'lucide-react'
import PageHeader from '../components/PageHeader'

interface TrackedItem {
  id: string
  status: ItemStatus
  locationId: string | null
  productId: string
  productName: string
  sku: string
  clientName: string
  clientId: string | null
}

interface UntrackedRow {
  id: string
  productName: string
  sku: string
  warehouseName: string
  warehouseId: string
  quantity: number
}

interface Warehouse {
  id: string
  name: string
}

type StatusCounts = Record<ItemStatus, number>

interface PoolRow {
  clientPool: string
  counts: StatusCounts
  total: number
}

interface ProductGroup {
  productId: string
  productName: string
  sku: string
  counts: StatusCounts
  total: number
  pools: PoolRow[]
}

const DISPLAY_STATUSES: ItemStatus[] = ['available', 'scheduled', 'in_transit', 'installed', 'defect', 'in_repair']
const emptyCounts = (): StatusCounts => ({
  available: 0, scheduled: 0, installed: 0, in_transit: 0, defect: 0, in_repair: 0, written_off: 0,
})

function ExpandableRows({ pools, expanded }: { pools: PoolRow[]; expanded: boolean }) {
  const ref = useRef<HTMLTableSectionElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (ref.current) {
      setHeight(ref.current.scrollHeight)
    }
  }, [pools, expanded])

  return (
    <tbody
      ref={ref}
      className="overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out"
      style={{
        maxHeight: expanded ? height : 0,
        opacity: expanded ? 1 : 0,
        display: expanded ? undefined : 'none',
      }}
    >
      {pools.map(pool => (
        <tr key={pool.clientPool} className="bg-neutral-50/60">
          <td className="px-3 py-1.5 text-[12px] text-neutral-800 pl-10">
            {pool.clientPool === 'Unallocated' ? (
              <span className="text-neutral-400 italic">Unallocated</span>
            ) : pool.clientPool}
          </td>
          <td className="px-3 py-1.5" />
          {DISPLAY_STATUSES.map(s => (
            <td key={s} className="px-3 py-1.5 font-mono text-[12px] text-center">
              {pool.counts[s] > 0 ? (
                <span className="text-neutral-700">{pool.counts[s]}</span>
              ) : (
                <span className="text-neutral-300">0</span>
              )}
            </td>
          ))}
          <td className="px-3 py-1.5 font-mono text-[12px] text-neutral-700 text-right">{pool.total}</td>
        </tr>
      ))}
    </tbody>
  )
}

export default function Stock() {
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([])
  const [untracked, setUntracked] = useState<UntrackedRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [activeTab, setActiveTab] = useState('')
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const [itemsRes, stockRes, locRes] = await Promise.all([
        supabase
          .from('inv_inventory_item')
          .select('id, status, location_id, allocated_client:mock_cl_companies!inv_inventory_item_allocated_client_id_fkey(id, name), product:inv_product_registry(id, name, sku)')
          .neq('status', 'written_off'),
        supabase
          .from('inv_warehouse_stock')
          .select('id, quantity, product:inv_product_registry(name, sku), location:mock_cl_locations(id, name)'),
        supabase
          .from('mock_cl_locations')
          .select('id, name')
          .eq('type', 'warehouse'),
      ])

      if (itemsRes.data) {
        setTrackedItems(
          itemsRes.data.map((item: any) => ({
            id: item.id,
            status: item.status,
            locationId: item.location_id,
            productId: item.product?.id ?? '',
            productName: item.product?.name ?? '—',
            sku: item.product?.sku ?? '—',
            clientName: item.allocated_client?.name ?? 'Unallocated',
            clientId: item.allocated_client?.id ?? null,
          }))
        )
      }

      if (stockRes.data) {
        setUntracked(
          stockRes.data.map((row: any) => ({
            id: row.id,
            productName: row.product?.name ?? '—',
            sku: row.product?.sku ?? '—',
            warehouseName: row.location?.name ?? '—',
            warehouseId: row.location?.id ?? '',
            quantity: row.quantity,
          }))
        )
      }

      if (locRes.data) {
        setWarehouses(locRes.data)
      }

      setLoading(false)
    }
    load()
  }, [])

  const productGroups = useMemo(() => {
    const items = activeTab
      ? trackedItems.filter(i => i.locationId === activeTab)
      : trackedItems

    const products = new Map<string, ProductGroup>()

    for (const item of items) {
      let group = products.get(item.productId)
      if (!group) {
        group = {
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          counts: emptyCounts(),
          total: 0,
          pools: [],
        }
        products.set(item.productId, group)
      }
      group.counts[item.status]++
      group.total++
    }

    for (const group of products.values()) {
      const poolMap = new Map<string, PoolRow>()
      const groupItems = items.filter(i => i.productId === group.productId)

      for (const item of groupItems) {
        const poolKey = item.clientId ?? 'none'
        let pool = poolMap.get(poolKey)
        if (!pool) {
          pool = { clientPool: item.clientName, counts: emptyCounts(), total: 0 }
          poolMap.set(poolKey, pool)
        }
        pool.counts[item.status]++
        pool.total++
      }

      group.pools = Array.from(poolMap.values()).sort((a, b) => {
        if (a.clientPool === 'Unallocated') return 1
        if (b.clientPool === 'Unallocated') return -1
        return a.clientPool.localeCompare(b.clientPool)
      })
    }

    return Array.from(products.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    )
  }, [trackedItems, activeTab])

  const filteredUntracked = activeTab
    ? untracked.filter(r => r.warehouseId === activeTab)
    : untracked

  function toggleProduct(productId: string) {
    setExpandedProducts(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="Stock Overview" />
        <div className="text-neutral-500 text-[13px]">Loading…</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader title="Stock Overview" />

      {/* Warehouse tabs */}
      <div className="flex gap-1 mb-5 bg-neutral-100 rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setActiveTab('')}
          className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-120 ${
            activeTab === '' ? 'bg-neutral-0 text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          All Items
        </button>
        {warehouses.map(w => (
          <button
            key={w.id}
            onClick={() => setActiveTab(w.id)}
            className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-120 ${
              activeTab === w.id ? 'bg-neutral-0 text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {w.name}
          </button>
        ))}
      </div>

      {/* Tracked Items Summary */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-neutral-800 mb-3">Serial-Tracked Items</h2>

        {productGroups.length === 0 ? (
          <p className="text-[13px] text-neutral-500">No tracked items found.</p>
        ) : (
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">Product</th>
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">SKU</th>
                  {DISPLAY_STATUSES.map(s => (
                    <th key={s} className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em] text-center">
                      {s.replace(/_/g, ' ')}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em] text-right">Total</th>
                </tr>
              </thead>
              {productGroups.map(group => {
                const isExpanded = expandedProducts.has(group.productId)
                return (
                  <Fragment key={group.productId}>
                    <tbody>
                      <tr
                        onClick={() => toggleProduct(group.productId)}
                        className={`border-t border-neutral-100 cursor-pointer transition-colors duration-120 ${
                          isExpanded ? 'bg-neutral-50' : 'hover:bg-neutral-25'
                        }`}
                      >
                        <td className="px-3 py-2 text-[12px] text-neutral-800 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronRight
                              size={14}
                              strokeWidth={2}
                              className={`text-neutral-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                            />
                            {group.productName}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[12px] text-neutral-600">{group.sku}</td>
                        {DISPLAY_STATUSES.map(s => (
                          <td key={s} className="px-3 py-2 font-mono text-[12px] text-center">
                            {group.counts[s] > 0 ? (
                              <span className="text-neutral-800 font-medium">{group.counts[s]}</span>
                            ) : (
                              <span className="text-neutral-300">0</span>
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-2 font-mono text-[12px] text-neutral-800 text-right font-semibold">{group.total}</td>
                      </tr>
                    </tbody>
                    <ExpandableRows pools={group.pools} expanded={isExpanded} />
                  </Fragment>
                )
              })}
            </table>
          </div>
        )}
      </section>

      {/* Untracked Items */}
      <section>
        <h2 className="text-base font-semibold text-neutral-800 mb-3">Quantity-Only Stock</h2>

        <div className="border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-neutral-100">
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">Product</th>
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">SKU</th>
                {!activeTab && <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">Warehouse</th>}
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em] text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {filteredUntracked.length === 0 ? (
                <tr>
                  <td colSpan={activeTab ? 3 : 4} className="px-3 py-6 text-center text-[13px] text-neutral-500">
                    No stock records found.
                  </td>
                </tr>
              ) : (
                filteredUntracked.map(row => (
                  <tr key={row.id} className="border-t border-neutral-100 hover:bg-neutral-25 transition-colors duration-120">
                    <td className="px-3 py-2 text-[12px] text-neutral-800">{row.productName}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-neutral-600">{row.sku}</td>
                    {!activeTab && <td className="px-3 py-2 text-[12px] text-neutral-700">{row.warehouseName}</td>}
                    <td className="px-3 py-2 font-mono text-[12px] text-neutral-800 text-right font-medium">{row.quantity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
