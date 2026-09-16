# ConnectIQ Inventory Demo - Progress Report

**Date:** 2026-09-15
**Repo:** connectiq-inventory-demo
**Branch:** master
**Stack:** React 19 + TypeScript + Vite + Tailwind CSS 4 + Supabase

## Current Pages

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Products | `/products` | Working | Product registry with CRUD, detail panel, filters |
| Inventory | `/inventory` | Working | Serial-tracked inventory items with search/filters |
| Stock | `/stock` | Working | Warehouse stock levels for quantity-only products |
| Stock In | `/stock-in` | Working | Two modes: serial (enter serial numbers) and quantity (enter qty) |
| Movements | `/movements` | Working | Stock movement history log |

## Shared Components

- **SearchableSelect** - Reusable dropdown with search, used across all forms
- **StatusBadge / TrackingBadge / MovementBadge** - Consistent status pills
- **PageHeader** - Page title with optional action slot
- **Toast** - Toast notification system (success/error/warning)
- **Layout** - Sidebar nav + main content shell

## Data Model (Supabase)

### Core tables
- `inv_product_registry` - Product catalog (SKU, name, category, tracking_type: serial_tracked | quantity_only)
- `inv_inventory_item` - Individual serial-tracked items (serial number, status, location)
- `inv_warehouse_stock` - Aggregate quantity-only stock per product per warehouse
- `inv_stock_movement` - Movement audit log (stock_in, stock_out, transfer, adjustment)

### Reference/mock tables
- `mock_cl_companies` - Companies
- `mock_cl_locations` - Warehouses and client sites
- `mock_plat_profiles` - User profiles

### Unused tables (can be dropped)
- `inv_kit_template` - Was part of kit assembly feature (removed)
- `inv_kit_item_component` - Was part of kit assembly feature (removed)
- `inv_product_pricing` - Not referenced by the app

## Current Product Data

| SKU | Name | Category | Tracking | Active |
|-----|------|----------|----------|--------|
| SAM-QM43C | Samsung QM43C | Display | Serial | Yes |
| SAM-QM55C | Samsung QM55C | Display | Serial | Yes |
| UT-SD_CARD | 8GB SD Card | Data storage | Qty Only | Yes |

## Recent Changes

1. Removed kit assembly feature entirely (page, route, nav, types, template display in product detail)
2. Removed "Active" checkbox from Add/Edit Product form (defaults to active)
3. Consolidated all dropdowns into shared SearchableSelect component
4. Cleaned up kit-related DB records (product, inventory items, movements, components)

## Known Issues / Cleanup

- DB tables `inv_kit_template` and `inv_kit_item_component` still exist but are unused - can be dropped
- `inv_product_pricing` table exists but is not used by any page
- No authentication - uses a hardcoded profile ID (`BOSS_PROFILE_ID`) for movements
- No RLS policies on tables

## Not Yet Built

- Reporting / dashboards
- Product image upload
- Bulk import
- User auth + role-based access

---

## Progress Report — Session 2 (2026-09-15)

### New Pages

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Transfer | `/transfer` | Working | Serial (multi-select) and quantity modes, confirmation step, same-location tooltip, auto-status on repair center |
| Return | `/return` | Working | For installed items, reasons: defect/de_installation/swap/end_of_contract, auto-status based on reason |
| Adjustment | `/adjustment` | Working | Tracked: Write Off + Status Change. Untracked: Quantity Correction. All create audit movements |

### Major Enhancements

**Inventory page**
- Inline editing for Allocated Client (creates adjustment movement on save) and Warranty Duration
- Bulk reallocation via checkboxes + action bar
- Movement history in detail panel uses dd-MMM-yyyy date format
- Warranty status display: Not activated / Active / Expired / No warranty

**Stock page — full redesign**
- Warehouse tabs (dynamic from DB) replace dropdown — scope both sections to selected location
- "All Items" tab shows aggregate across all locations
- Accordion rows: product-level summary → expand for client pool breakdown (tracked) or warehouse breakdown (quantity)
- Dark table headers matching sidebar theme
- Fixed column layout prevents shift on accordion expand

**Stock In page**
- "Allocate to Client" optional dropdown
- "Warranty Duration" optional dropdown (None / 3yr / 5yr)
- Sets `allocated_client_id` and `warranty_duration_years` on insert

**Stock overview (Pool Allocation)**
- Serial-tracked items grouped by product × client pool
- Shows all 6 status columns + total

### New Status: `written_off`
- Added to DB constraint and TypeScript types
- Write-off sets status to `written_off` (not `defect`), clears location
- Stock view excludes `written_off` items — they stay in DB for audit trail
- Grey neutral badge style

### Statuses
`available` | `scheduled` | `installed` | `in_transit` | `defect` | `in_repair` | `written_off`

### UX Polish
- Disabled button errors use dark hover tooltips (`#2b2b2e`), not plain text
- dd-MMM-yyyy date format throughout (Created column, movement history)
- Quantity inputs strip non-numeric characters
- Transfer page: "Quantity exceeds maximum" tooltip, "Cannot transfer to same location" tooltip
- Adjustment quantity section: balanced 3-column grid (current / new / difference)
- Warranty auto-activation on first `installed` status (via `activateWarrantyIfNeeded`)

### DB Changes
- `inv_inventory_item.status` constraint updated to include `written_off`
- `inv_inventory_item.allocated_client_id` — nullable FK to `mock_cl_companies`
- `inv_inventory_item.warranty_duration_years`, `warranty_start_date`, `warranty_end_date` columns
- Movement type `return` added
- **Pending data fix:** Two items written off before `written_off` status existed are still `defect` with `location_id IS NULL` — run: `UPDATE inv_inventory_item SET status = 'written_off' WHERE status = 'defect' AND location_id IS NULL;`

### Commits (session 2)
```
1e9dc78 Polish stock overview: dark headers, accordion for quantity items, fix column shift
780fa2b Rename All Warehouses tab to All Items for clarity
48d97b7 Add accordion rows to tracked stock table grouped by product
0c7c661 Replace warehouse dropdown with tabs that filter both stock sections
624947a Redesign quantity adjustment section as balanced 3-column grid
4ddc90d Add written_off status and exclude from stock overview
336a00c Add Adjustment page with write-off and status change for tracked items
9422eea Add inline editing for client and warranty in inventory detail panel
c16008f Replace same-location error text with hover tooltip on Transfer page
78a6356 Implement Section 2: deployment features
```

---

## Progress Report — Session 3 (2026-09-16)

### Designation Field (Item 8 from next_steps.md)

New column `designation` on `inv_inventory_item` — values: `deployment` (default), `spare`, `maintenance`. Allows segregating inventory by purpose (new installs vs spare replacements vs maintenance stock).

**Types + Badge (8a)**
- `Designation` type exported from `types.ts`
- `DesignationBadge` component: blue (deployment), amber (spare), purple (maintenance)

**Inventory page (8b)**
- Designation column added to the table
- Designation filter dropdown in the filter bar
- Inline-editable designation in the detail panel — creates adjustment movement with note "Designation changed from X to Y"
- Bulk designation change via action bar: select items → "Change Designation" → pick new designation → creates adjustment movements per item

**Stock view (8c)**
- Accordion child rows now show client × designation combos
- Format: "KFC Thailand · Deployment", "KFC Thailand · Spare"
- Zero-count combos excluded (filtered by `written_off` as before)

**Stock-in page (8d)**
- Designation dropdown added (defaults to Deployment)
- Sets `designation` on newly created items

**Return + Transfer (8e/8f)**
- No changes — designation is preserved through returns and transfers

### Bug Fixes (from next_steps.md)

**Fix 1: Metadata adjustments no longer set locations**
- Adjustment movements for designation change, status change, and client reallocation now set `from_location` and `to_location` to `null`
- Affected: inline designation edit, bulk designation change, inline client edit, bulk reallocation (Inventory page), status change (Adjustment page)
- Not affected: write-offs (correctly use `from_location`), quantity adjustments (correctly use warehouse location)
- Retroactively fixed 3 existing movement records in DB

**Fix 2: Written-off items excluded from operational pages**
- Adjustment page: item query filters out `written_off`
- Transfer page: item query filters out `written_off`
- Return page: already safe (only queries `installed` items)
- Inventory page: checkboxes disabled on written-off rows, select-all and toggle skip them

**Movement history display**
- Movements page: metadata adjustments show "No location change" spanning From/To columns
- Inventory detail panel: metadata adjustments show "No location change" instead of "— → —"
- Movements page: added `return` to movement type filter dropdown

### Movements page — multi-select inventory item filter

- `SearchableSelect` component extended with `multi` prop for multi-select mode (checkmarks, X to clear, "N selected" label)
- Movements page: new "Item" filter — search and select multiple serial numbers, filters movements to those items
- Uses Supabase `.in('inventory_item_id', [...])` for the query

### Movement Date input (Item 11 from next_steps.md)

Every movement page now captures **when the movement actually happened**, separate from when the record was logged.

- `inv_stock_movement.created_at` already existed in the DB (auto-set, `now()` default) — no migration needed
- New shared `MovementDateInput` component: required `datetime-local` picker, blank by default, `max` capped to now (prevents future dates in the native picker) plus a JS check as a backstop
- **Stock In**: added to both serial and quantity modes — replaces the old `new Date().toISOString()` default for `movement_time`
- **Transfer**: added for both tracked and untracked modes
- **Return**: added
- **Adjustment**: added to both tracked (write-off/status change) and untracked (quantity correction) modes
- All other `updated_at` fields (item rows, warehouse stock rows) still use actual system time — only `movement_time` reflects the user-entered date
- **Movements page**: added "Logged At" column showing `created_at` next to the existing "Movement Date" (`movement_time`) column; list already sorted by `movement_time` descending, unchanged

### Commits (session 3)
```
1886ff4 Thread designation field through inventory, stock, and stock-in pages
d07189c Fix metadata adjustment locations and exclude written-off items from operations
83fa1fb Add multi-select inventory item filter to stock movements page
```

### What's Left

- Reporting / dashboards
- Product image upload
- Bulk import
- User auth + role-based access
- DE1 (installation pipeline) → needs Jobs + Contracts
- Stock-out to client site → needs Jobs
- **Pending data fix:** `UPDATE inv_inventory_item SET status = 'written_off' WHERE status = 'defect' AND location_id IS NULL;`
