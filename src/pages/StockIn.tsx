import { useState, useEffect } from 'react'
import { supabase, BOSS_PROFILE_ID } from '../lib/supabase'
import type { Product, Location, Company } from '../lib/types'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import MovementDateInput from '../components/MovementDateInput'

type Mode = 'serial_tracked' | 'quantity_only'

const WARRANTY_OPTIONS = [
  { value: '', label: 'None' },
  { value: '3', label: '3 years' },
  { value: '5', label: '5 years' },
]

const DESIGNATION_OPTIONS = [
  { value: 'deployment', label: 'Deployment' },
  { value: 'spare', label: 'Spare' },
  { value: 'maintenance', label: 'Maintenance' },
]

export default function StockIn() {
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>('serial_tracked')
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Location[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [productId, setProductId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [serials, setSerials] = useState('')
  const [quantity, setQuantity] = useState('')
  const [allocatedClientId, setAllocatedClientId] = useState('')
  const [warrantyDuration, setWarrantyDuration] = useState('')
  const [designation, setDesignation] = useState('deployment')
  const [movementDate, setMovementDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase
      .from('inv_product_registry')
      .select('*')
      .eq('active', true)
      .eq('tracking_type', mode)
      .order('name')
      .then(({ data }) => {
        setProducts(data ?? [])
        setProductId('')
      })
  }, [mode])

  useEffect(() => {
    Promise.all([
      supabase.from('mock_cl_locations').select('*').eq('type', 'warehouse').order('name'),
      supabase.from('mock_cl_companies').select('*').order('name'),
    ]).then(([locRes, compRes]) => {
      if (locRes.data) setWarehouses(locRes.data as unknown as Location[])
      if (compRes.data) setCompanies(compRes.data as unknown as Company[])
    })
  }, [])

  function resetForm() {
    setProductId('')
    setWarehouseId('')
    setSerials('')
    setQuantity('')
    setAllocatedClientId('')
    setWarrantyDuration('')
    setDesignation('deployment')
    setMovementDate('')
  }

  async function handleSerialSubmit() {
    const lines = serials
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)

    if (!productId || !warehouseId || lines.length === 0 || !movementDate) {
      toast('warning', 'Please fill in all fields and enter at least one serial number.')
      return
    }
    const movementTime = new Date(movementDate)
    if (movementTime > new Date()) {
      toast('warning', 'Movement date cannot be in the future.')
      return
    }

    setSubmitting(true)
    try {
      const items = lines.map(sn => ({
        product_id: productId,
        location_id: warehouseId,
        serial_number: sn,
        status: 'available' as const,
        allocated_client_id: allocatedClientId || null,
        warranty_duration_years: warrantyDuration ? Number(warrantyDuration) : null,
        designation,
      }))

      const { data: insertedItems, error: itemErr } = await supabase
        .from('inv_inventory_item')
        .insert(items)
        .select('id, product_id')

      if (itemErr) throw itemErr

      const movements = (insertedItems ?? []).map(item => ({
        product_id: item.product_id,
        inventory_item_id: item.id,
        from_location: null,
        to_location: warehouseId,
        performed_by: BOSS_PROFILE_ID,
        movement_type: 'stock_in' as const,
        quantity: 1,
        movement_time: movementTime.toISOString(),
        notes: null,
      }))

      const { error: mvErr } = await supabase
        .from('inv_stock_movement')
        .insert(movements)

      if (mvErr) throw mvErr

      toast('success', `Stocked in ${lines.length} serial-tracked item${lines.length > 1 ? 's' : ''}.`)
      resetForm()
    } catch (err: any) {
      toast('error', err.message ?? 'Failed to stock in items.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleQuantitySubmit() {
    const qty = parseInt(quantity, 10)
    if (!productId || !warehouseId || !qty || qty <= 0 || !movementDate) {
      toast('warning', 'Please fill in all fields with a valid quantity.')
      return
    }
    const movementTime = new Date(movementDate)
    if (movementTime > new Date()) {
      toast('warning', 'Movement date cannot be in the future.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('stock_in_quantity', {
        p_product_id: productId,
        p_location_id: warehouseId,
        p_client_id: allocatedClientId || null,
        p_designation: designation,
        p_qty: qty,
        p_movement_time: movementTime.toISOString(),
        p_performed_by: BOSS_PROFILE_ID,
        p_notes: null,
      })
      if (error) throw error

      const product = products.find(p => p.id === productId)
      toast('success', `Stocked in ${qty}× ${product?.name ?? 'items'}.`)
      resetForm()
    } catch (err: any) {
      toast('error', err.message ?? 'Failed to stock in items.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1'

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader title="Stock In" />

      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-6">
        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg mb-6 w-fit">
          <button
            onClick={() => setMode('serial_tracked')}
            className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-120 ${
              mode === 'serial_tracked'
                ? 'bg-neutral-0 text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Serial Tracked
          </button>
          <button
            onClick={() => setMode('quantity_only')}
            className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-120 ${
              mode === 'quantity_only'
                ? 'bg-neutral-0 text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Quantity Only
          </button>
        </div>

        <div className="space-y-4">
          {/* Product select */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Product</label>
            <SearchableSelect
              options={products.map(p => ({ value: p.id, label: p.name, sublabel: p.sku }))}
              value={productId}
              onChange={setProductId}
              placeholder="Select a product…"
            />
          </div>

          {/* Warehouse select */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Destination Warehouse
            </label>
            <SearchableSelect
              options={warehouses.map(w => ({ value: w.id, label: w.name }))}
              value={warehouseId}
              onChange={setWarehouseId}
              placeholder="Select a warehouse…"
            />
          </div>

          {mode === 'serial_tracked' ? (
            <>
              {/* Allocate to client */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Allocate to Client <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <SearchableSelect
                  options={companies.map(c => ({ value: c.id, label: c.name }))}
                  value={allocatedClientId}
                  onChange={setAllocatedClientId}
                  placeholder="Unallocated"
                />
              </div>

              {/* Warranty duration */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Warranty Duration <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <SearchableSelect
                  options={WARRANTY_OPTIONS}
                  value={warrantyDuration}
                  onChange={setWarrantyDuration}
                  placeholder="None"
                />
              </div>

              {/* Designation */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Designation
                </label>
                <SearchableSelect
                  options={DESIGNATION_OPTIONS}
                  value={designation}
                  onChange={setDesignation}
                  placeholder="Deployment"
                />
              </div>

              {/* Serial numbers */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Serial Numbers
                  <span className="text-neutral-400 font-normal ml-1">(one per line)</span>
                </label>
                <textarea
                  value={serials}
                  onChange={e => setSerials(e.target.value)}
                  rows={5}
                  placeholder={'H4ZD400200\nH4ZD400201\nH4ZD400202'}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-0 text-sm font-mono text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 resize-y"
                />
                {serials.trim() && (
                  <p className="text-[12px] text-neutral-500 mt-1">
                    {serials.split('\n').filter(s => s.trim()).length} serial number(s)
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Allocate to client */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Allocate to Client <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <SearchableSelect
                  options={companies.map(c => ({ value: c.id, label: c.name }))}
                  value={allocatedClientId}
                  onChange={setAllocatedClientId}
                  placeholder="Unallocated"
                />
              </div>

              {/* Designation */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Designation
                </label>
                <SearchableSelect
                  options={DESIGNATION_OPTIONS}
                  value={designation}
                  onChange={setDesignation}
                  placeholder="Deployment"
                />
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="Enter quantity"
                  className={inputClass}
                />
              </div>
            </>
          )}

          <MovementDateInput value={movementDate} onChange={setMovementDate} />
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={mode === 'serial_tracked' ? handleSerialSubmit : handleQuantitySubmit}
            disabled={submitting || !movementDate}
            className="h-10 px-5 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors duration-120"
          >
            {submitting ? 'Processing…' : 'Receive Stock'}
          </button>
          <button
            onClick={resetForm}
            disabled={submitting}
            className="h-10 px-5 rounded-lg bg-neutral-0 border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 transition-colors duration-120"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
