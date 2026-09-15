import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ItemStatus } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import PageHeader from '../components/PageHeader'
import SearchableSelect from '../components/SearchableSelect'

interface TrackedSummary {
  key: string
  productName: string
  sku: string
  clientPool: string
  counts: Record<ItemStatus, number>
  total: number
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

const ALL_STATUSES: ItemStatus[] = ['available', 'scheduled', 'in_transit', 'installed', 'defect', 'in_repair']

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
          .select('id, status, allocated_client:mock_cl_companies!inv_inventory_item_allocated_client_id_fkey(id, name), product:inv_product_registry(id, name, sku)'),
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
        const emptyCounts = (): Record<ItemStatus, number> => ({
          available: 0, scheduled: 0, installed: 0, in_transit: 0, defect: 0, in_repair: 0,
        })
        for (const item of itemsRes.data) {
          const p = item.product as any
          if (!p) continue
          const client = item.allocated_client as any
          const clientName = client?.name ?? 'Unallocated'
          const key = `${p.id}__${client?.id ?? 'none'}`
          let entry = grouped.get(key)
          if (!entry) {
            entry = {
              key,
              productName: p.name,
              sku: p.sku,
              clientPool: clientName,
              counts: emptyCounts(),
              total: 0,
            }
            grouped.set(key, entry)
          }
          entry.counts[item.status as ItemStatus]++
          entry.total++
        }
        const sorted = Array.from(grouped.values()).sort((a, b) => {
          const nameCompare = a.productName.localeCompare(b.productName)
          if (nameCompare !== 0) return nameCompare
          if (a.clientPool === 'Unallocated') return 1
          if (b.clientPool === 'Unallocated') return -1
          return a.clientPool.localeCompare(b.clientPool)
        })
        setTracked(sorted)
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
    ? untracked.filter(r => r.warehouseId === warehouseFilter)
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
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">Product</th>
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">SKU</th>
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">Client Pool</th>
                  {ALL_STATUSES.map(s => (
                    <th key={s} className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em] text-center">
                      {s.replace(/_/g, ' ')}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em] text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {tracked.map(row => (
                  <tr key={row.key} className="border-t border-neutral-100 hover:bg-neutral-25 transition-colors duration-120">
                    <td className="px-3 py-2 text-[12px] text-neutral-800 font-medium">{row.productName}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-neutral-600">{row.sku}</td>
                    <td className="px-3 py-2 text-[12px] text-neutral-700">
                      {row.clientPool === 'Unallocated' ? (
                        <span className="text-neutral-400 italic">Unallocated</span>
                      ) : row.clientPool}
                    </td>
                    {ALL_STATUSES.map(s => (
                      <td key={s} className="px-3 py-2 font-mono text-[12px] text-center">
                        {row.counts[s] > 0 ? (
                          <span className="text-neutral-800 font-medium">{row.counts[s]}</span>
                        ) : (
                          <span className="text-neutral-300">0</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 font-mono text-[12px] text-neutral-800 text-right font-semibold">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Untracked Items by Warehouse */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-neutral-800">Quantity-Only Stock</h2>
          <SearchableSelect
            options={warehouses.map(w => ({ value: w.id, label: w.name }))}
            value={warehouseFilter}
            onChange={setWarehouseFilter}
            placeholder="All Warehouses"
            className="w-52"
          />
        </div>

        <div className="border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-neutral-100">
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">Product</th>
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">SKU</th>
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em]">Warehouse</th>
                <th className="px-3 py-2 text-[11px] font-medium text-neutral-600 uppercase tracking-[0.06em] text-right">Quantity</th>
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
                    <td className="px-3 py-2 text-[12px] text-neutral-800">{row.productName}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-neutral-600">{row.sku}</td>
                    <td className="px-3 py-2 text-[12px] text-neutral-700">{row.warehouseName}</td>
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
