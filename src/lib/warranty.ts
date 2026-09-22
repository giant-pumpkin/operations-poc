import { supabase } from './supabase'

// Starts the warranty on first install, dated to when the install actually happened.
export async function activateWarrantyIfNeeded(itemId: string, installedAt: Date) {
  const { data: item, error } = await supabase
    .from('inv_inventory_item')
    .select('warranty_duration_years, warranty_start_date')
    .eq('id', itemId)
    .single()
  if (error) throw error

  if (!item) return
  if (item.warranty_duration_years == null) return
  if (item.warranty_start_date != null) return

  const end = new Date(installedAt)
  end.setFullYear(end.getFullYear() + item.warranty_duration_years)

  const { error: updateErr } = await supabase
    .from('inv_inventory_item')
    .update({
      warranty_start_date: installedAt.toISOString(),
      warranty_end_date: end.toISOString(),
    })
    .eq('id', itemId)
  if (updateErr) throw updateErr
}
