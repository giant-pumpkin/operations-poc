import type { InventoryItem } from '../lib/types'
import { StatusBadge } from './StatusBadge'

interface Props {
  items: InventoryItem[]
}

export default function MultiSelectInfoTable({ items }: Props) {
  if (items.length === 0) return null

  return (
    <div className="bg-neutral-50 rounded-lg overflow-hidden text-[12px]">
      <table className="w-full">
        <thead>
          <tr className="text-left text-[11px] text-neutral-500 uppercase tracking-wider">
            <th className="px-3 py-2 font-medium">Serial</th>
            <th className="px-3 py-2 font-medium">Product</th>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Location</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-t border-neutral-200/60">
              <td className="px-3 py-1.5 font-medium text-neutral-800">{item.serial_number}</td>
              <td className="px-3 py-1.5 text-neutral-600">{(item.product as any)?.name}</td>
              <td className="px-3 py-1.5 text-neutral-600">{(item as any).allocated_client?.name ?? <span className="text-neutral-400">Unallocated</span>}</td>
              <td className="px-3 py-1.5"><StatusBadge status={item.status} /></td>
              <td className="px-3 py-1.5 text-neutral-600">{(item.location as any)?.name ?? <span className="text-neutral-400">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
