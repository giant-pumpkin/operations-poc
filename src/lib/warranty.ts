import { supabase } from './supabase'

export async function activateWarrantyIfNeeded(itemId: string) {
  const { data: item } = await supabase
    .from('inv_inventory_item')
    .select('warranty_duration_years, warranty_start_date')
    .eq('id', itemId)
    .single()

  if (!item) return
  if (item.warranty_duration_years == null) return
  if (item.warranty_start_date != null) return

  const now = new Date()
  const end = new Date(now)
  end.setFullYear(end.getFullYear() + item.warranty_duration_years)

  await supabase
    .from('inv_inventory_item')
    .update({
      warranty_start_date: now.toISOString(),
      warranty_end_date: end.toISOString(),
    })
    .eq('id', itemId)
}
