const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return '—'
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`
}

export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return '—'
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return '—'
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
