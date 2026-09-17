import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ItemStatus, Designation } from '../lib/types'
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
  designation: Designation
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
  label: string
  counts: StatusCounts
  total: number
  committed: number
}

interface ProductGroup {
  productId: string
  productName: string
  sku: string
  counts: StatusCounts
  total: number
  pools: PoolRow[]
  committed: number
}

interface WarehouseRow {
  warehouseName: string
  quantity: number
}

interface UntrackedGroup {
  productName: string
  sku: string
  totalQuantity: number
  warehouses: WarehouseRow[]
}

// 'scheduled' is not used as a stock-view column. The stock view computes "Committed"
// from open job_items. Available turns red when Available < Committed.
const REMAINING_STATUSES: ItemStatus[] = ['in_transit', 'installed', 'defect', 'in_repair']
const emptyCounts = (): StatusCounts => ({
  available: 0, scheduled: 0, installed: 0, in_transit: 0, defect: 0, in_repair: 0, written_off: 0,
})

function ExpandableRows({ pools, expanded, showCommitted }: { pools: PoolRow[]; expanded: boolean; showCommitted: boolean }) {
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
        <tr key={pool.label} className="bg-neutral-0 border-t border-neutral-100">
          <td className="px-3 py-1.5 text-[12px] text-neutral-800 pl-10">
            {pool.label}
          </td>
          <td className="px-3 py-1.5" />
          <td className={`px-3 py-1.5 font-mono text-[12px] text-center ${showCommitted && pool.counts.available < pool.committed ? 'text-red-600 font-semibold' : ''}`}>
            {pool.counts.available > 0 ? (
              <span className={showCommitted && pool.counts.available < pool.committed ? '' : 'text-neutral-700'}>{pool.counts.available}</span>
            ) : (
              <span className={showCommitted && pool.counts.available < pool.committed ? '' : 'text-neutral-300'}>0</span>
            )}
          </td>
          {showCommitted && (
            <td className="px-3 py-1.5 font-mono text-[12px] text-center">
              {pool.committed > 0 ? (
                <span className="text-neutral-700">{pool.committed}</span>
              ) : (
                <span className="text-neutral-300">0</span>
              )}
            </td>
          )}
          {REMAINING_STATUSES.map(s => (
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

function ExpandableWarehouseRows({ warehouses, expanded }: { warehouses: WarehouseRow[]; expanded: boolean }) {
  const ref = useRef<HTMLTableSectionElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (ref.current) {
      setHeight(ref.current.scrollHeight)
    }
  }, [warehouses, expanded])

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
      {warehouses.map(w => (
        <tr key={w.warehouseName} className="bg-neutral-0 border-t border-neutral-100">
          <td colSpan={2} className="px-3 py-1.5 text-[12px] text-neutral-700 pl-10">{w.warehouseName}</td>
          <td className="px-3 py-1.5 font-mono text-[12px] text-neutral-700 text-right">{w.quantity}</td>
        </tr>
      ))}
    </tbody>
  )
}

export default function Stock() {
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([])
  const [untracked, setUntracked] = useState<UntrackedRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [plannedByProductClient, setPlannedByProductClient] = useState<Map<string, { qty: number; clientId: string; clientName: string }>>(new Map())
  const [activeTab, setActiveTab] = useState('')
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const [expandedQtyProducts, setExpandedQtyProducts] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const [itemsRes, stockRes, locRes, jobItemsRes] = await Promise.all([
        supabase
          .from('inv_inventory_item')
          .select('id, status, location_id, designation, allocated_client:mock_cl_companies!inv_inventory_item_allocated_client_id_fkey(id, name), product:inv_product_registry(id, name, sku)')
          .neq('status', 'written_off'),
        supabase
          .from('inv_warehouse_stock')
          .select('id, quantity, product:inv_product_registry(name, sku), location:mock_cl_locations(id, name)'),
        supabase
          .from('mock_cl_locations')
          .select('id, name')
          .eq('type', 'warehouse'),
        supabase
          .from('job_items')
          .select('product_id, planned_quantity, fulfilled_quantity, direction, job:job_jobs(client_id, status, client:mock_cl_companies!job_jobs_client_id_fkey(name))')
          .eq('direction', 'outbound'),
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
            designation: item.designation ?? 'deployment',
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

      if (jobItemsRes.data) {
        const OPEN_JOB_STATUSES = new Set(['completed', 'closed', 'cancelled', 'incomplete'])
        const planned = new Map<string, { qty: number; clientId: string; clientName: string }>()
        for (const ji of jobItemsRes.data as any[]) {
          const job = ji.job
          if (!job || OPEN_JOB_STATUSES.has(job.status)) continue
          const remaining = ji.planned_quantity - ji.fulfilled_quantity
          if (remaining <= 0) continue
          const key = `${ji.product_id}__${job.client_id}`
          const existing = planned.get(key)
          planned.set(key, {
            qty: (existing?.qty ?? 0) + remaining,
            clientId: job.client_id,
            clientName: job.client?.name ?? 'Unknown',
          })
        }
        setPlannedByProductClient(planned)
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
          committed: 0,
        }
        products.set(item.productId, group)
      }
      group.counts[item.status]++
      group.total++
    }

    for (const group of products.values()) {
      const poolMap = new Map<string, PoolRow>()
      const poolClientIds = new Map<string, string | null>()
      const groupItems = items.filter(i => i.productId === group.productId)

      for (const item of groupItems) {
        const poolKey = `${item.clientId ?? 'none'}__${item.designation}`
        const designationLabel = item.designation.replace(/\b\w/g, c => c.toUpperCase())
        const label = `${item.clientName} · ${designationLabel}`
        let pool = poolMap.get(poolKey)
        if (!pool) {
          pool = { label, counts: emptyCounts(), total: 0, committed: 0 }
          poolMap.set(poolKey, pool)
          poolClientIds.set(poolKey, item.clientId)
        }
        pool.counts[item.status]++
        pool.total++
      }

      const distinctClientIds = new Set<string>()
      for (const [poolKey, pool] of poolMap) {
        const clientId = poolClientIds.get(poolKey)
        pool.committed = clientId ? (plannedByProductClient.get(`${group.productId}__${clientId}`)?.qty ?? 0) : 0
        if (clientId) distinctClientIds.add(clientId)
      }

      // Phantom pools: a client can have planned job demand for this product with zero
      // inventory allocated to their pool yet — still show the commitment (Available: 0).
      if (activeTab === '') {
        for (const [key, entry] of plannedByProductClient) {
          if (!key.startsWith(`${group.productId}__`)) continue
          if (distinctClientIds.has(entry.clientId)) continue
          const phantomKey = `${entry.clientId}__deployment`
          poolMap.set(phantomKey, {
            label: `${entry.clientName} · Deployment`,
            counts: emptyCounts(),
            total: 0,
            committed: entry.qty,
          })
          distinctClientIds.add(entry.clientId)
        }
      }

      group.committed = Array.from(distinctClientIds).reduce(
        (sum, clientId) => sum + (plannedByProductClient.get(`${group.productId}__${clientId}`)?.qty ?? 0),
        0
      )

      group.pools = Array.from(poolMap.values()).sort((a, b) => a.label.localeCompare(b.label))
    }

    return Array.from(products.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    )
  }, [trackedItems, activeTab, plannedByProductClient])

  const untrackedGroups = useMemo(() => {
    const filtered = activeTab
      ? untracked.filter(r => r.warehouseId === activeTab)
      : untracked

    const grouped = new Map<string, UntrackedGroup>()
    for (const row of filtered) {
      const key = `${row.productName}__${row.sku}`
      let group = grouped.get(key)
      if (!group) {
        group = { productName: row.productName, sku: row.sku, totalQuantity: 0, warehouses: [] }
        grouped.set(key, group)
      }
      group.totalQuantity += row.quantity
      group.warehouses.push({ warehouseName: row.warehouseName, quantity: row.quantity })
    }

    return Array.from(grouped.values()).sort((a, b) => a.productName.localeCompare(b.productName))
  }, [untracked, activeTab])

  function toggleProduct(productId: string) {
    setExpandedProducts(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  function toggleQtyProduct(key: string) {
    setExpandedQtyProducts(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
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
                <tr className="bg-neutral-800">
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-300 uppercase tracking-[0.06em]">Product</th>
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-300 uppercase tracking-[0.06em]">SKU</th>
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-300 uppercase tracking-[0.06em] text-center">available</th>
                  {activeTab === '' && (
                    <th className="px-3 py-2 text-[11px] font-medium text-neutral-300 uppercase tracking-[0.06em] text-center">committed</th>
                  )}
                  {REMAINING_STATUSES.map(s => (
                    <th key={s} className="px-3 py-2 text-[11px] font-medium text-neutral-300 uppercase tracking-[0.06em] text-center">
                      {s.replace(/_/g, ' ')}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-300 uppercase tracking-[0.06em] text-right">Total</th>
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
                          isExpanded ? 'bg-neutral-100' : 'bg-neutral-0 hover:bg-neutral-25'
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
                        <td className={`px-3 py-2 font-mono text-[12px] text-center ${activeTab === '' && group.counts.available < group.committed ? 'text-red-600 font-semibold' : ''}`}>
                          {group.counts.available > 0 ? (
                            <span className={activeTab === '' && group.counts.available < group.committed ? '' : 'text-neutral-800 font-medium'}>{group.counts.available}</span>
                          ) : (
                            <span className={activeTab === '' && group.counts.available < group.committed ? '' : 'text-neutral-300'}>0</span>
                          )}
                        </td>
                        {activeTab === '' && (
                          <td className="px-3 py-2 font-mono text-[12px] text-center">
                            {group.committed > 0 ? (
                              <span className="text-neutral-800 font-medium">{group.committed}</span>
                            ) : (
                              <span className="text-neutral-300">0</span>
                            )}
                          </td>
                        )}
                        {REMAINING_STATUSES.map(s => (
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
                    <ExpandableRows pools={group.pools} expanded={isExpanded} showCommitted={activeTab === ''} />
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

        {untrackedGroups.length === 0 ? (
          <p className="text-[13px] text-neutral-500">No stock records found.</p>
        ) : (
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '45%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr className="bg-neutral-800">
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-300 uppercase tracking-[0.06em]">Product</th>
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-300 uppercase tracking-[0.06em]">SKU</th>
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-300 uppercase tracking-[0.06em] text-right">Quantity</th>
                </tr>
              </thead>
              {untrackedGroups.map(group => {
                const key = `${group.productName}__${group.sku}`
                const isExpanded = expandedQtyProducts.has(key)
                const hasMultipleWarehouses = group.warehouses.length > 1
                return (
                  <Fragment key={key}>
                    <tbody>
                      <tr
                        onClick={() => hasMultipleWarehouses && toggleQtyProduct(key)}
                        className={`border-t border-neutral-100 transition-colors duration-120 ${
                          hasMultipleWarehouses ? 'cursor-pointer' : ''
                        } ${isExpanded ? 'bg-neutral-100' : 'bg-neutral-0 hover:bg-neutral-25'}`}
                      >
                        <td className="px-3 py-2 text-[12px] text-neutral-800 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {hasMultipleWarehouses ? (
                              <ChevronRight
                                size={14}
                                strokeWidth={2}
                                className={`text-neutral-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                              />
                            ) : (
                              <span className="w-3.5" />
                            )}
                            {group.productName}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[12px] text-neutral-600">{group.sku}</td>
                        <td className="px-3 py-2 font-mono text-[12px] text-neutral-800 text-right font-semibold">{group.totalQuantity}</td>
                      </tr>
                    </tbody>
                    {hasMultipleWarehouses && (
                      <ExpandableWarehouseRows warehouses={group.warehouses} expanded={isExpanded} />
                    )}
                  </Fragment>
                )
              })}
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
