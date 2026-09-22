import { supabase } from './supabase'
import type { InventoryItem } from './types'

// Compares the items a page loaded against the database right before writing,
// so a tab that sat open while someone else moved or wrote off an item doesn't
// act on out-of-date state. Returns human-readable descriptions of what changed.
export async function findChangedItems(items: InventoryItem[]): Promise<string[]> {
  if (items.length === 0) return []
  const { data, error } = await supabase
    .from('inv_inventory_item')
    .select('id, serial_number, status, location_id, allocated_client_id, designation, location:mock_cl_locations(name)')
    .in('id', items.map(i => i.id))
  if (error) throw error

  const fresh = new Map((data ?? []).map((r: any) => [r.id, r]))
  const changes: string[] = []
  for (const item of items) {
    const now = fresh.get(item.id)
    if (!now) { changes.push(`${item.serial_number} no longer exists`); continue }
    const label = (v: string) => v.replace(/_/g, ' ')
    if (now.status !== item.status) {
      changes.push(`${item.serial_number} is now ${label(now.status)} (was ${label(item.status)})`)
    } else if ((now.location_id ?? null) !== (item.location_id ?? null)) {
      changes.push(`${item.serial_number} is now at ${now.location?.name ?? 'no location'}`)
    } else if ((now.allocated_client_id ?? null) !== ((item as any).allocated_client_id ?? null) || now.designation !== (item as any).designation) {
      changes.push(`${item.serial_number} was reallocated`)
    }
  }
  return changes
}
