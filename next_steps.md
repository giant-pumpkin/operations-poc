# Section 2: Deployment — Implementation Plan

**Date:** 2026-09-15
**Context:** Section 1 (Know What We Have) is complete. The schema has been updated with new fields and constraints for Section 2. This document describes what to build next.

## Schema Changes Already Applied

The following changes are live on the sandbox Supabase (`odpdnucjvgingrrwaaiv`):

```sql
-- inv_inventory_item has new columns:
--   allocated_client_id  uuid FK → mock_cl_companies (nullable)
--   warranty_duration_years  integer
--   warranty_start_date  timestamptz
--   warranty_end_date  timestamptz
--   designation  text NOT NULL DEFAULT 'deployment'
--     CHECK (designation IN ('deployment', 'spare', 'maintenance'))

-- inv_inventory_item.status now accepts:
--   'available', 'scheduled', 'in_transit', 'installed', 'defect', 'in_repair', 'written_off'
--   (changed: 'reserved' is now 'scheduled', added 'in_repair', 'written_off')

-- inv_stock_movement.movement_type now accepts:
--   'stock_in', 'stock_out', 'transfer', 'return', 'adjustment'
--   (added: 'return')

-- mock_cl_locations.type now accepts:
--   'client_site', 'warehouse', 'repair_center'
--   (added: 'repair_center')
```

### New seed data

- Samsung Service Center Bangkok (repair_center location)
- Existing inventory items now have `allocated_client_id` set (KFC pool, Apple TH pool, one unallocated)
- Installed screen has warranty fields populated (3-year, activated 2026-06-15)
- Available screens have `warranty_duration_years` set but no start/end date (not yet activated)

## What to Build

### 1. Update Stock View — Pool Allocation Display (Priority: HIGH)

The stock view currently shows inventory by product. It needs to show allocation pools.

**Revised stock view for tracked items:**

| Product | Client Pool | Available | Scheduled | Installed | Defect | Total |
| ------- | ----------- | --------- | --------- | --------- | ------ | ----- |
| QM55C   | KFC         | 2         | 0         | 1         | 0      | 3     |
| QM43C   | Apple TH    | 1         | 0         | 0         | 0      | 1     |
| QM43C   | Unallocated | 0         | 0         | 0         | 0      | 1\*   |

\*in_transit items still show in their pool (or Unallocated if no pool)

**Query approach:**

```sql
SELECT
  pr.name AS product_name,
  pr.sku,
  COALESCE(c.name, 'Unallocated') AS client_pool,
  COUNT(*) FILTER (WHERE ii.status = 'available') AS available,
  COUNT(*) FILTER (WHERE ii.status = 'scheduled') AS scheduled,
  COUNT(*) FILTER (WHERE ii.status = 'installed') AS installed,
  COUNT(*) FILTER (WHERE ii.status = 'defect') AS defect,
  COUNT(*) FILTER (WHERE ii.status = 'in_repair') AS in_repair,
  COUNT(*) AS total
FROM inv_inventory_item ii
JOIN inv_product_registry pr ON ii.product_id = pr.id
LEFT JOIN mock_cl_companies c ON ii.allocated_client_id = c.id
GROUP BY pr.name, pr.sku, c.name
ORDER BY pr.name, c.name NULLS LAST;
```

**Untracked items stock view** stays the same (no pool allocation for quantity-only items).

### 2. Update Inventory Detail — Show New Fields (Priority: HIGH)

The inventory item detail panel / table needs to display:

- **Allocated Client** — show company name, or "Unallocated" badge if null
- **Warranty Status** — computed badge:
  - "Not activated" if `warranty_start_date` is null
  - "Active (expires YYYY-MM-DD)" if `warranty_end_date` > now
  - "Expired" if `warranty_end_date` <= now
  - "No warranty" if `warranty_duration_years` is null
- **Warranty Duration** — "3 years" / "5 years"

Add these as columns in the inventory table and as fields in the detail view.

### 3. Update Status Badges (Priority: HIGH)

Add the new statuses to the badge component:

- `scheduled` — orange badge
- `in_repair` — purple badge

Remove `reserved` if it exists — it's been replaced by `scheduled`.

### 4. Stock Transfer Page `/transfer` (Priority: HIGH)

New page for manually transferring items between locations.

**For tracked items:**

1. Select item(s) by serial number (searchable, multi-select)
   - When an item is selected, show its current location (auto-populated, read-only)
2. Select destination location (dropdown of all warehouses + repair centers)
   - Cannot select the same location the item is already at
3. Add optional notes
4. Confirmation step: "Transfer [n] items from [source] to [destination] — Confirm?"
5. On submit:
   - Create `inv_stock_movement` per item (type: `transfer`, from_location: current, to_location: selected)
   - Update `inv_inventory_item.location_id` to the destination
   - If destination is a repair center, update status to `in_repair`
   - If source is a repair center and destination is a warehouse, update status to `available`

**For untracked items:**

1. Select product (dropdown, quantity_only products only)
2. Select source warehouse (dropdown, only warehouses where this product has stock > 0)
3. Select destination warehouse
4. Enter quantity (cannot exceed available stock at source)
5. On submit:
   - Create `inv_stock_movement` (type: `transfer`)
   - Decrement `inv_warehouse_stock` at source
   - Increment (or upsert) `inv_warehouse_stock` at destination

### 5. Return Page `/return` (Priority: MEDIUM)

Page for recording items coming back from client sites.

**Workflow:**

1. Select item(s) by serial number
   - Only show items with status `installed` (items currently at client sites)
   - Auto-show current location
2. Select return destination (dropdown of warehouses — default to GP Warehouse)
3. Select return reason:
   - `defect` — item is broken, needs repair
   - `de_installation` — client no longer needs it, item is functional
   - `swap` — being replaced by another item
   - `end_of_contract` — contract ended
4. Add optional notes
5. On submit:
   - Create `inv_stock_movement` (type: `return`, from_location: client site, to_location: warehouse)
   - Update `inv_inventory_item.location_id` to the warehouse
   - Update `inv_inventory_item.status`:
     - If reason is `defect` → status = `defect`
     - If reason is anything else → status = `available`

### 6. Pool Allocation Management (Priority: MEDIUM)

Add ability to set or change the client pool allocation on inventory items.

**Two entry points:**

**A. On stock-in:** When stocking in serial-tracked items, add an optional "Allocate to client" dropdown. This sets `allocated_client_id` on the newly created `inv_inventory_item`.

**B. Bulk reallocation:** On the inventory page, add a "Reallocate" action:

1. Select one or more items (checkboxes on the inventory table)
2. Click "Reallocate" button
3. Select target client (or "Unallocated")
4. Confirm
5. On submit:
   - Update `inv_inventory_item.allocated_client_id` for all selected items
   - Create `inv_stock_movement` per item (type: `adjustment`, notes: "Reallocated from [old client] to [new client]")

### 7. Warranty Auto-Activation (Priority: MEDIUM)

**Business rule:** When an item's status changes to `installed` for the first time, automatically set warranty dates.

**Logic (in the stock-out or installation flow):**

```
if item.warranty_duration_years is not null
   AND item.warranty_start_date is null:
     item.warranty_start_date = now()
     item.warranty_end_date = now() + (warranty_duration_years * interval '1 year')
```

This should only trigger on the FIRST installation. If an item is returned and reinstalled, the warranty does NOT restart.

### 8. Designation Field — Thread Through UI (Priority: HIGH)

New column `designation` on `inv_inventory_item` — values: `deployment` (default), `spare`, `maintenance`. Already in the DB.

**8a. Types + Badge**

- Add `Designation` type: `'deployment' | 'spare' | 'maintenance'`
- Add `DesignationBadge` component: blue for deployment, amber for spare, purple for maintenance

**8b. Inventory page**

- Add Designation column to the inventory table
- Add Designation filter dropdown
- Make designation inline-editable in the detail panel (creates an adjustment movement with note "Designation changed from [old] to [new]" on save)
- Extend the bulk action bar to support bulk designation change alongside reallocation: select items → "Change Designation" → pick new designation → creates adjustment movements

**8c. Stock view**

- Expand the client pool accordion rows to show client + designation combinations
- Keep two levels, not three. Collapsed: product-level totals. Expanded: one row per client × designation combo
- Row format: "KFC Thailand · Deployment", "KFC Thailand · Spare"
- Hide combos that have zero items (exclude `written_off` as before)
- Query approach:

```sql
SELECT
  pr.name AS product_name,
  pr.sku,
  COALESCE(c.name, 'Unallocated') AS client_pool,
  ii.designation,
  COUNT(*) FILTER (WHERE ii.status = 'available') AS available,
  COUNT(*) FILTER (WHERE ii.status = 'scheduled') AS scheduled,
  COUNT(*) FILTER (WHERE ii.status = 'installed') AS installed,
  COUNT(*) FILTER (WHERE ii.status = 'defect') AS defect,
  COUNT(*) FILTER (WHERE ii.status = 'in_repair') AS in_repair,
  COUNT(*) AS total
FROM inv_inventory_item ii
JOIN inv_product_registry pr ON ii.product_id = pr.id
LEFT JOIN mock_cl_companies c ON ii.allocated_client_id = c.id
WHERE ii.status != 'written_off'
GROUP BY pr.name, pr.sku, c.name, ii.designation
ORDER BY pr.name, c.name NULLS LAST, ii.designation;
```

**8d. Stock-in page**

- Add optional "Designation" dropdown, defaults to Deployment
- Sets `designation` on newly created items

**8e. Return page**

- Do NOT reset designation on return. Item keeps whatever designation it had.

**8f. Transfer page**

- Do NOT change designation on transfer. Item keeps its designation.

**8g. Business rule: Spare deployment**

- When a spare is deployed to replace a failed screen (via future stock-out/installation flow), the designation changes from `spare` to `deployment`
- The movement log captures the change: "Spare deployed to replace SN [X] (defect)"
- For now this is manual via inline edit or bulk action — the automated flow comes with Section 6 (Jobs)

### 9. Movement Type Badges (Priority: LOW)

Update the MovementBadge component to include the new `return` type:

- `return` — teal or cyan badge

### 10. Stock-In Update — Warranty + Allocation Fields (Priority: LOW)

Update the stock-in page for serial-tracked items to include:

- **Allocate to client** — optional dropdown of companies
- **Warranty duration** — dropdown: None / 3 years / 5 years

These are set once at stock-in time. Warranty activates later on first installation.

## Updated Navigation

```
Sidebar:
  Products        /products
  Inventory       /inventory
  Stock           /stock
  Stock In        /stock-in
  Transfer        /transfer
  Return          /return
  Adjustment      /adjustment
  Movements       /movements
```

## Status Transition Rules

Valid status transitions for tracked items:

```
available → scheduled        (allocated to a job)
available → in_transit       (being shipped)
available → written_off      (lost, scrapped, or beyond repair)
scheduled → in_transit       (picked and shipped)
scheduled → available        (job cancelled, released back)
in_transit → installed       (installation confirmed)
in_transit → available       (returned to warehouse before install)
installed → defect           (failed at client site)
installed → available        (de-installed, returned to warehouse)
defect → in_repair           (sent to repair center)
defect → written_off         (beyond repair, scrapped)
in_repair → available        (repaired, back in warehouse)
in_repair → defect           (repair failed, needs re-evaluation)
in_repair → written_off      (unrepairable, scrapped)
```

These transitions should be enforced in application logic. Invalid transitions (e.g., `installed` → `scheduled`) should be rejected with an error message.

## Hardcoded Values

- `performed_by`: Continue using `c0000000-0000-0000-0000-000000000001` (Boss profile) for all operations
- No auth required for the prototype

## Test Scenarios

After building, verify these flows work end-to-end:

1. **Stock in → Allocate → Transfer → Install:**
   Stock in a new QM55C with serial "TEST001", allocate to KFC, transfer from GP Warehouse to Rangsit, then stock-out to KFC Siam Paragon → verify warranty activates
2. **Defect → Return → Repair → Available:**
   Take the installed screen at KFC Siam Paragon, mark as defect, return to GP Warehouse, transfer to Samsung Service Center (status: in_repair), transfer back (status: available)
3. **Pool reallocation:**
   Take a KFC-allocated screen and reallocate to Boost Juice → verify stock view updates both pools
4. **Untracked transfer:**
   Transfer 20 SD cards from GP Warehouse to Rangsit → verify both warehouse_stock rows update
5. **Designation change:**
   Stock in a QM55C as "Spare" allocated to KFC → verify stock view shows it under "KFC Thailand · Spare" → change designation to "Deployment" via inline edit → verify movement log records the change and stock view updates
6. **Bulk designation change:**
   Select multiple KFC-allocated items → bulk change designation from "Deployment" to "Maintenance" → verify all items updated and adjustment movements created for each
7. **Write-off exclusion:**
   Write off an item → verify it disappears from stock view but remains in inventory list and movement log
