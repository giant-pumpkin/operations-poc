export interface Company {
  id: string
  name: string
  status: string
  country: string | null
}

export interface Location {
  id: string
  cl_company_id: string
  name: string
  type: 'client_site' | 'warehouse' | 'repair_center'
  address: string | null
  city: string | null
  country: string | null
  company?: Company
}

export interface Profile {
  id: string
  full_name: string
  email: string
}

export interface Product {
  id: string
  sku: string
  name: string
  manufacturer: string | null
  model: string | null
  tracking_type: 'serial_tracked' | 'quantity_only'
  images: string | null
  category: string | null
  player: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export interface InventoryItem {
  id: string
  product_id: string
  location_id: string | null
  serial_number: string
  status: 'available' | 'scheduled' | 'installed' | 'in_transit' | 'defect' | 'in_repair' | 'written_off'
  allocated_client_id: string | null
  warranty_duration_years: number | null
  designation: 'deployment' | 'spare' | 'maintenance'
  warranty_start_date: string | null
  warranty_end_date: string | null
  created_at: string
  updated_at: string
  product?: Product
  location?: Location
  allocated_client?: Company
}

export interface WarehouseStock {
  id: string
  product_id: string
  location_id: string
  quantity: number
  updated_at: string
  product?: Product
  location?: Location
}

export interface StockMovement {
  id: string
  product_id: string
  inventory_item_id: string | null
  from_location: string | null
  to_location: string | null
  performed_by: string
  movement_type: 'stock_in' | 'stock_out' | 'transfer' | 'return' | 'adjustment'
  quantity: number
  movement_time: string
  notes: string | null
  product?: Product
  inventory_item?: InventoryItem
  from_loc?: Location
  to_loc?: Location
  performer?: Profile
}

export type ItemStatus = InventoryItem['status']
export type MovementType = StockMovement['movement_type']
export type TrackingType = Product['tracking_type']
export type Designation = InventoryItem['designation']
