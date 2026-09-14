# ConnectIQ Inventory Management — Prototype Spec

## Purpose

Build a working prototype of the ConnectIQ Inventory Management module. This is a frontend simulation connected to a real Supabase sandbox database with seed data. The goal is to validate the data model and user flows before building in the production ConnectIQ project.

## Supabase Connection

- **Project ID:** `odpdnucjvgingrrwaaiv`
- **URL:** `https://odpdnucjvgingrrwaaiv.supabase.co`
- **This is a sandbox project.** The production ConnectIQ project is separate.

## Tech Stack

- React + TypeScript
- Supabase JS client (`@supabase/supabase-js`)
- Tailwind CSS
- No component library — keep it minimal and functional

## Database Schema

### Mock Reference Tables (stand-ins for existing ConnectIQ tables)

```sql
mock_cl_companies (id, name, status, country)
mock_cl_locations (id, cl_company_id → mock_cl_companies, name, type ['client_site'|'warehouse'], address, city, country)
mock_plat_profiles (id, full_name, email)
```

### Inventory Domain Tables

```sql
inv_product_registry (
  id uuid PK,
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  manufacturer text,
  model text,
  tracking_type text NOT NULL ['serial_tracked'|'quantity_only'],
  images text,
  category text,
  player boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz,
  updated_at timestamptz
)

inv_inventory_item (
  id uuid PK,
  product_id uuid FK → inv_product_registry NOT NULL,
  location_id uuid FK → mock_cl_locations NULLABLE,  -- null = in transit
  serial_number text UNIQUE NOT NULL,
  status text NOT NULL ['available'|'reserved'|'installed'|'in_transit'|'defect'],
  created_at timestamptz,
  updated_at timestamptz
)

inv_warehouse_stock (
  id uuid PK,
  product_id uuid FK → inv_product_registry NOT NULL,
  location_id uuid FK → mock_cl_locations NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz,
  UNIQUE (product_id, location_id)
)

inv_stock_movement (
  id uuid PK,
  product_id uuid FK → inv_product_registry NOT NULL,
  inventory_item_id uuid FK → inv_inventory_item NULLABLE,  -- null for untracked items
  from_location uuid FK → mock_cl_locations NULLABLE,       -- null for stock_in
  to_location uuid FK → mock_cl_locations NULLABLE,         -- null for stock_out/write-off
  performed_by uuid FK → mock_plat_profiles NOT NULL,
  movement_type text NOT NULL ['stock_in'|'stock_out'|'transfer'|'adjustment'],
  quantity integer NOT NULL DEFAULT 1,
  movement_time timestamptz NOT NULL,
  notes text
)

inv_product_pricing (
  id uuid PK,
  product_id uuid FK → inv_product_registry NOT NULL,
  client_id uuid FK → mock_cl_companies NOT NULL,
  cost_price numeric(10,2),
  sell_price numeric(10,2),
  effective_date timestamptz NOT NULL,
  UNIQUE (product_id, client_id, effective_date)
)

inv_kit_template (
  id uuid PK,
  product_registry_id uuid FK → inv_product_registry NOT NULL,
  component_product_id uuid FK → inv_product_registry NOT NULL,
  default_quantity numeric NOT NULL DEFAULT 1,
  UNIQUE (product_registry_id, component_product_id)
)

inv_kit_item_component (
  id uuid PK,
  inventory_item_id uuid FK → inv_inventory_item NOT NULL,
  component_product_id uuid FK → inv_product_registry NOT NULL,
  quantity numeric NOT NULL DEFAULT 1
)
```

## Key Concepts

### Tracked vs Untracked Items
- **Serial-tracked items** (tracking_type = 'serial_tracked'): Each physical unit has its own row in `inv_inventory_item` with a unique serial number. Examples: screens, media players, assembled kits.
- **Quantity-only items** (tracking_type = 'quantity_only'): Tracked as a running count per warehouse in `inv_warehouse_stock`. No serial numbers. Examples: SD cards, LAN cables, standee parts.

### Kitting
A kit is a serial-tracked product composed of quantity-only components. A "KFC 43-inch Standee Kit" is one product in the registry that, when assembled, deducts its components from warehouse stock.

- `inv_kit_template`: Default components for a kit product. Pre-populates the assembly form.
- `inv_kit_item_component`: Actual components of a specific assembled kit instance. Source of truth for what was actually used.
- Composition can vary per deployment — the template is a starting point, not a constraint.

### Unified Location Model
Warehouses and client sites both live in `mock_cl_locations` (in production: `cl_locations`), differentiated by the `type` column. Warehouses belong to their owning company (GP warehouses → Giant Pumpkin, partner warehouses → partner company).

### Stock Movements
`inv_stock_movement` is the universal audit trail. Every inventory change creates a movement record:
- **stock_in**: Items arriving. `from_location` is null, `to_location` is the receiving warehouse.
- **stock_out**: Items leaving (deployment, disposal). `from_location` is set, `to_location` is the client site or null for write-offs.
- **transfer**: Between warehouses. Both `from_location` and `to_location` are set.
- **adjustment**: Corrections (physical count vs system count).

For tracked items, `inventory_item_id` references the specific unit. For untracked items, it's null — only `product_id` and `quantity` are used.

## Seed Data Summary

The database is pre-seeded with:

**Companies:** Giant Pumpkin, KFC Thailand, BJ Malaysia, Apple Thailand

**Locations:**
| Name | Type | Company |
|------|------|---------|
| GP Warehouse | warehouse | Giant Pumpkin |
| Rangsit Warehouse | warehouse | Giant Pumpkin |
| BJ MYS Partner Warehouse | warehouse | BJ Malaysia |
| KFC Siam Paragon | client_site | KFC Thailand |
| Apple Store CentralWorld | client_site | Apple Thailand |

**Products:**
| SKU | Name | Tracking | Category |
|-----|------|----------|----------|
| SAM-QB55C | Samsung QB55C 55" Display | serial_tracked | Display |
| SAM-QB43C | Samsung QB43C 43" Display | serial_tracked | Display |
| SD-32GB | SD Card 32GB | quantity_only | Accessory |
| LAN-CAT6 | LAN Cable CAT6 1m | quantity_only | Accessory |
| KIT-KFC-43 | KFC 43" Standee Kit | serial_tracked | Kit |
| STANDEE-BASE | Standee Base | quantity_only | Accessory |
| STANDEE-TOP | Standee Top Part | quantity_only | Accessory |
| STANDEE-CAP | Standee Top Cap | quantity_only | Accessory |

**Kit template:** KFC 43" Standee Kit = 1x QB43C + 1x Standee Base + 1x Standee Top + 1x Standee Cap + 1x SD Card

**Tracked inventory:**
| Serial | Product | Location | Status |
|--------|---------|----------|--------|
| H4ZD400123 | QB55C | GP Warehouse | available |
| H4ZD400124 | QB55C | GP Warehouse | available |
| H4ZD400100 | QB55C | KFC Siam Paragon | installed |
| H4ZD300050 | QB43C | GP Warehouse | available |
| H4ZD300051 | QB43C | (in transit) | in_transit |

**Untracked stock at GP Warehouse:** 47 SD cards, 120 LAN cables, 15 each of standee base/top/cap

## Pages to Build

### 1. Product Registry (`/products`)

A table view of all products in `inv_product_registry`.

**Features:**
- Filterable by category, tracking type, active status
- Searchable by name, SKU, manufacturer
- Inline badge showing tracking type (serial / qty)
- Click a row to open detail view
- "Add Product" button → form with all fields
- Edit existing product
- Show inventory counts per product: for serial-tracked, count of `inv_inventory_item` grouped by status; for quantity-only, sum of `inv_warehouse_stock.quantity`

**Detail view for a product:**
- Product info header
- If serial-tracked: table of all `inv_inventory_item` rows for this product (serial, location, status)
- If quantity-only: table of `inv_warehouse_stock` rows (location, quantity)
- If kit: show the template components from `inv_kit_template` with product names and default quantities
- Movement history: all `inv_stock_movement` rows for this product, newest first

### 2. Inventory Items (`/inventory`)

A table view of all items in `inv_inventory_item` joined with product and location info.

**Features:**
- Filterable by status, product, location
- Searchable by serial number
- Columns: Serial Number, Product Name, SKU, Location, Status, Created At
- Status shown as colored badge (green=available, blue=reserved, purple=installed, yellow=in_transit, red=defect)
- Click a row to see full item detail: product info, current location, full movement history from `inv_stock_movement`

### 3. Stock View (`/stock`)

The "do we have it?" dashboard. Two sections:

**Tracked items summary:**
- Group by product, show count per status
- e.g., "Samsung QB55C: 2 available, 1 installed, 0 in transit"

**Untracked items by warehouse:**
- Table from `inv_warehouse_stock` joined with product and location
- Columns: Product, Warehouse, Quantity
- Filterable by warehouse

### 4. Stock-In (`/stock-in`)

Form to receive items into a warehouse.

**For serial-tracked items:**
1. Select product (only show serial_tracked products)
2. Select destination warehouse (only show locations where type = 'warehouse')
3. Enter serial number(s) — support adding multiple, one per line
4. Submit → creates one `inv_inventory_item` per serial (status: 'available') + one `inv_stock_movement` per item (type: 'stock_in', to_location: selected warehouse)

**For quantity-only items:**
1. Select product (only show quantity_only products)
2. Select destination warehouse
3. Enter quantity
4. Submit → upserts `inv_warehouse_stock` (increment quantity) + creates one `inv_stock_movement` (type: 'stock_in', quantity: entered amount)

**performed_by:** Hardcode to the seeded Boss profile for the prototype.

### 5. Stock Movement Log (`/movements`)

Full audit trail. Table of all `inv_stock_movement` records, newest first.

**Columns:** Movement Time, Type (badge), Product, Serial # (if tracked), Qty, From, To, Performed By, Notes

**Filterable by:** movement type, product, location, date range

### 6. Kit Assembly (`/kit-assembly`) — stretch goal

Form to assemble a kit:
1. Select kit product (products where category = 'Kit')
2. System loads default components from `inv_kit_template`
3. User can adjust component quantities or add/remove components
4. User enters a serial number for the assembled kit
5. Select warehouse
6. Submit →
   - Creates `inv_inventory_item` for the kit (status: 'available')
   - Creates `inv_kit_item_component` rows for each component
   - Decrements `inv_warehouse_stock` for each component
   - Creates `inv_stock_movement` records for each component stock-out and the kit stock-in

## Design Direction

This is an internal operations tool. Prioritize clarity and density over aesthetics.

- Left sidebar navigation with page links
- Content area with table views as the primary pattern
- Use a neutral palette — dark sidebar, light content area
- Tables should be dense and scannable, not card-based
- Status badges use color to convey meaning at a glance
- Forms use standard input patterns, nothing fancy
- Responsive is not critical — this is a desktop tool used in the office

## Notes

- All `inv_` tables have RLS disabled on the sandbox project. No auth required for the prototype.
- The `performed_by` field should be hardcoded to `c0000000-0000-0000-0000-000000000001` (Boss) for all operations.
- Error handling: show toast messages for success/failure on mutations.
- Optimistic updates are nice but not required — refetch after mutation is fine.
