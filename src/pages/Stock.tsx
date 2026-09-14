import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ItemStatus } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'

interface TrackedSummary {
  productId: string
  productName: string
  sku: string
  counts: Record<ItemStatus, number>
  total: number
}

interface UntrackedRow {
  id: string
  productName: string
  sku: string
  warehouseName: string
  quantity: number
}

interface Warehouse {
  id: string
  name: string
}

const ALL_STATUSES: ItemStatus[] = ['available', 'reserved', 'installed', 'in_transit', 'defect']

export default function Stock() {
  const [tracked, setTracked] = useState<TrackedSummary[]>([])
  const [untracked, setUntracked] = useState<UntrackedRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const [itemsRes, stockRes, locRes] = await Promise.all([
        supabase
          .from('inv_inventory_item')
          .select('id, status, product:inv_product_registry(id, name, sku)'),
        supabase
          .from('inv_warehouse_stock')
          .select('id, quantity, product:inv_product_registry(name, sku), location:mock_cl_locations(id, name)'),
        supabase
          .from('mock_cl_locations')
          .select('id, name')
          .eq('type', 'warehouse'),
      ])

      if (itemsRes.data) {
        const grouped = new Map<string, TrackedSummary>()
        for (const item of itemsRes.data) {
          const p = item.product as any
          if (!p) continue
          let entry = grouped.get(p.id)
          if (!entry) {
            entry = {
              productId: p.id,
              productName: p.name,
              sku: p.sku,
              counts: { available: 0, reserved: 0, installed: 0, in_transit: 0, defect: 0 },
              total: 0,
            }
            grouped.set(p.id, entry)
          }
          entry.counts[item.status as ItemStatus]++
          entry.total++
        }
        setTracked(Array.from(grouped.values()))
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

  const filteredUntracked = warehouseFilter
    ? untracked.filter((r: any) => r.warehouseId === warehouseFilter)
    : untracked

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

      {/* Tracked Items Summary */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-neutral-800 mb-3">Serial-Tracked Items</h2>

        {tracked.length === 0 ? (
          <p className="text-[13px] text-neutral-500">No tracked items found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {tracked.map(item => (
              <div
                key={item.productId}
                className="bg-neutral-0 border border-neutral-200 rounded-xl p-4"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[13px] font-semibold text-neutral-800 truncate mr-2">
                    {item.productName}
                  </span>
                  <span className="font-mono text-[11px] text-neutral-500 shrink-0">
                    {item.sku}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {ALL_STATUSES.map(status => (
                    item.counts[status] > 0 && (
                      <span key={status} className="flex items-center gap-1">
                        <span className="font-mono text-[12px] text-neutral-700 font-medium">
                          {item.counts[status]}
                        </span>
                        <StatusBadge status={status} />
                      </span>
                    )
                  ))}
                </div>

                <div className="mt-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-500 uppercase tracking-wide">
                  Total: <span className="font-mono font-medium text-neutral-700">{item.total}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Untracked Items by Warehouse */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-neutral-800">Quantity-Only Stock</h2>
          <select
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            className="text-[13px] border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-neutral-0 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1"
          >
            <option value="">All Warehouses</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-neutral-100">
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">
                  Product
                </th>
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">
                  SKU
                </th>
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">
                  Warehouse
                </th>
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em] text-right">
                  Quantity
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUntracked.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-[13px] text-neutral-500">
                    No stock records found.
                  </td>
                </tr>
              ) : (
                filteredUntracked.map(row => (
                  <tr key={row.id} className="border-t border-neutral-100 hover:bg-neutral-25 transition-colors duration-120">
                    <td className="px-3 py-2 text-[12px] text-neutral-800">
                      {row.productName}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-neutral-600">
                      {row.sku}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-neutral-700">
                      {row.warehouseName}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-neutral-800 text-right font-medium">
                      {row.quantity}
                    </td>
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
