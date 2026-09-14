import { useState, useEffect } from 'react'
import { supabase, BOSS_PROFILE_ID } from '../lib/supabase'
import type { Product, Location } from '../lib/types'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import { Plus, Trash2 } from 'lucide-react'

interface ComponentRow {
  product_id: string
  name: string
  sku: string
  quantity: number
}

export default function KitAssembly() {
  const { toast } = useToast()
  const [kitProducts, setKitProducts] = useState<Product[]>([])
  const [allQtyProducts, setAllQtyProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Location[]>([])
  const [selectedKit, setSelectedKit] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [components, setComponents] = useState<ComponentRow[]>([])
  const [addProductId, setAddProductId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadReferenceData()
  }, [])

  useEffect(() => {
    if (selectedKit) loadTemplate(selectedKit)
    else setComponents([])
  }, [selectedKit])

  async function loadReferenceData() {
    const [kitRes, qtyRes, locRes] = await Promise.all([
      supabase.from('inv_product_registry').select('*').eq('category', 'Kit').eq('active', true),
      supabase.from('inv_product_registry').select('*').eq('tracking_type', 'quantity_only').eq('active', true),
      supabase.from('mock_cl_locations').select('*').eq('type', 'warehouse'),
    ])
    if (kitRes.data) setKitProducts(kitRes.data)
    if (qtyRes.data) setAllQtyProducts(qtyRes.data)
    if (locRes.data) setWarehouses(locRes.data)
  }

  async function loadTemplate(kitId: string) {
    const { data } = await supabase
      .from('inv_kit_template')
      .select('default_quantity, component_product:inv_product_registry!inv_kit_template_component_product_id_fkey(id,name,sku,tracking_type)')
      .eq('product_registry_id', kitId)

    if (data) {
      setComponents(
        data.map((row: any) => ({
          product_id: row.component_product.id,
          name: row.component_product.name,
          sku: row.component_product.sku,
          quantity: Number(row.default_quantity),
        }))
      )
    }
  }

  function updateQuantity(idx: number, qty: number) {
    setComponents(prev => prev.map((c, i) => (i === idx ? { ...c, quantity: qty } : c)))
  }

  function removeComponent(idx: number) {
    setComponents(prev => prev.filter((_, i) => i !== idx))
  }

  function addComponent() {
    if (!addProductId) return
    if (components.some(c => c.product_id === addProductId)) {
      toast('warning', 'Component already in the list')
      return
    }
    const product = allQtyProducts.find(p => p.id === addProductId)
    if (!product) return
    setComponents(prev => [...prev, { product_id: product.id, name: product.name, sku: product.sku, quantity: 1 }])
    setAddProductId('')
  }

  async function handleSubmit() {
    if (!selectedKit || !serialNumber.trim() || !warehouseId) {
      toast('error', 'Please fill in all required fields')
      return
    }
    if (components.length === 0) {
      toast('error', 'Add at least one component')
      return
    }
    if (components.some(c => c.quantity <= 0)) {
      toast('error', 'All component quantities must be greater than 0')
      return
    }

    setSubmitting(true)
    try {
      // Check stock availability
      const stockChecks = await Promise.all(
        components.map(c =>
          supabase
            .from('inv_warehouse_stock')
            .select('id, quantity')
            .eq('product_id', c.product_id)
            .eq('location_id', warehouseId)
            .maybeSingle()
        )
      )

      for (let i = 0; i < components.length; i++) {
        const stock = stockChecks[i].data
        if (!stock || stock.quantity < components[i].quantity) {
          toast('error', `Insufficient stock for ${components[i].name} (have ${stock?.quantity ?? 0}, need ${components[i].quantity})`)
          setSubmitting(false)
          return
        }
      }

      // 1. Create kit inventory item
      const { data: kitItem, error: kitErr } = await supabase
        .from('inv_inventory_item')
        .insert({
          product_id: selectedKit,
          serial_number: serialNumber.trim(),
          status: 'available',
          location_id: warehouseId,
        })
        .select('id')
        .single()

      if (kitErr) throw kitErr

      // 2. Create kit_item_component rows
      const componentRows = components.map(c => ({
        inventory_item_id: kitItem.id,
        component_product_id: c.product_id,
        quantity: c.quantity,
      }))
      const { error: compErr } = await supabase.from('inv_kit_item_component').insert(componentRows)
      if (compErr) throw compErr

      // 3. Decrement warehouse stock for each component
      for (let i = 0; i < components.length; i++) {
        const stock = stockChecks[i].data!
        const { error: stockErr } = await supabase
          .from('inv_warehouse_stock')
          .update({ quantity: stock.quantity - components[i].quantity })
          .eq('id', stock.id)
        if (stockErr) throw stockErr
      }

      // 4. Create stock movements: one stock_in for kit, one stock_out per component
      const now = new Date().toISOString()
      const movements = [
        {
          product_id: selectedKit,
          inventory_item_id: kitItem.id,
          from_location: null,
          to_location: warehouseId,
          performed_by: BOSS_PROFILE_ID,
          movement_type: 'stock_in',
          quantity: 1,
          movement_time: now,
          notes: 'Kit assembled',
        },
        ...components.map(c => ({
          product_id: c.product_id,
          inventory_item_id: null,
          from_location: warehouseId,
          to_location: null,
          performed_by: BOSS_PROFILE_ID,
          movement_type: 'stock_out' as const,
          quantity: c.quantity,
          movement_time: now,
          notes: `Used in kit assembly: ${serialNumber.trim()}`,
        })),
      ]
      const { error: movErr } = await supabase.from('inv_stock_movement').insert(movements)
      if (movErr) throw movErr

      toast('success', `Kit ${serialNumber.trim()} assembled successfully`)
      setSerialNumber('')
      setSelectedKit('')
      setWarehouseId('')
      setComponents([])
    } catch (err: any) {
      toast('error', err.message || 'Failed to assemble kit')
    } finally {
      setSubmitting(false)
    }
  }

  const availableToAdd = allQtyProducts.filter(p => !components.some(c => c.product_id === p.id))

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader title="Kit Assembly" />

      <div className="bg-neutral-0 border border-neutral-200 rounded-xl p-6 space-y-5">
        {/* Kit product */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Kit Product</label>
          <SearchableSelect
            options={kitProducts.map(p => ({ value: p.id, label: p.name, sublabel: p.sku }))}
            value={selectedKit}
            onChange={setSelectedKit}
            placeholder="Select a kit…"
          />
        </div>

        {/* Serial number */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Serial Number</label>
          <input
            type="text"
            value={serialNumber}
            onChange={e => setSerialNumber(e.target.value)}
            placeholder="Enter serial number for this kit"
            className="w-full h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Warehouse */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Warehouse</label>
          <SearchableSelect
            options={warehouses.map(w => ({ value: w.id, label: w.name }))}
            value={warehouseId}
            onChange={setWarehouseId}
            placeholder="Select warehouse…"
          />
        </div>

        {/* Components */}
        {components.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Components</label>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 text-[11px] uppercase tracking-[0.06em] text-neutral-500">
                  <th className="text-left px-3 py-2 font-medium">Product</th>
                  <th className="text-left px-3 py-2 font-medium">SKU</th>
                  <th className="text-center px-3 py-2 font-medium w-24">Qty</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {components.map((c, idx) => (
                  <tr key={c.product_id} className="border-t border-neutral-100 hover:bg-neutral-25">
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-500">{c.sku}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min={1}
                        value={c.quantity}
                        onChange={e => updateQuantity(idx, parseInt(e.target.value) || 0)}
                        className="w-16 h-8 px-2 rounded-lg border border-neutral-200 text-center text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-1 py-2">
                      <button onClick={() => removeComponent(idx)} className="p-1 text-neutral-400 hover:text-danger-500">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Add component */}
            {availableToAdd.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                <SearchableSelect
                  options={availableToAdd.map(p => ({ value: p.id, label: p.name, sublabel: p.sku }))}
                  value={addProductId}
                  onChange={setAddProductId}
                  placeholder="Add component…"
                  className="flex-1"
                />
                <button
                  onClick={addComponent}
                  disabled={!addProductId}
                  className="h-10 px-3 rounded-lg border border-neutral-200 bg-neutral-0 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 flex items-center gap-1"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !selectedKit || !serialNumber.trim() || !warehouseId || components.length === 0}
          className="h-10 px-5 rounded-lg bg-neutral-900 text-neutral-0 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-120"
        >
          {submitting ? 'Assembling...' : 'Assemble Kit'}
        </button>
      </div>
    </div>
  )
}
