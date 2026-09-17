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
--   ownership  text NOT NULL DEFAULT 'gp_owned'
--     CHECK (ownership IN ('gp_owned', 'customer_owned'))

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

**Design Decision: "Planned" is computed from jobs, not stored on inventory items**

`scheduled` is NOT a status on `inv_inventory_item`. Nobody at GP picks specific serial numbers before installation — the installer grabs from the client pool and reports afterwards. So no individual item is ever "scheduled."

Instead, the stock view computes a "Planned" count by joining unfulfilled `job_items` against the inventory pool. This tells you how many items are earmarked for upcoming jobs without pretending you know which specific serials will be used.

The key metric is **Free** = Available − Planned. This answers: "Can we commit to 10 more QM55C for KFC?"

**Revised stock view for tracked items:**

| Product | Client Pool | Available | Planned | Free | In Transit | Installed | Defect | In Repair | Total |
| ------- | ----------- | --------- | ------- | ---- | ---------- | --------- | ------ | --------- | ----- |
| QM55C   | KFC         | 42        | 8       | 34   | 2          | 18        | 0      | 0         | 62    |
| QM55C   | BJ Malaysia | 10        | 0       | 10   | 0          | 5         | 0      | 0         | 15    |
| QM55C   | Unallocated | 3         | 0       | 3    | 0          | 0         | 0      | 0         | 3     |

**How "Planned" is calculated:**

Planned = the sum of `(planned_quantity - fulfilled_quantity)` from `job_items` where:

- `job_items.direction = 'outbound'` (items going TO a site)
- The parent `job_jobs.status` is NOT `completed`, `closed`, `cancelled`, or `incomplete`
- The parent `job_jobs.client_id` matches the inventory pool's `allocated_client_id`
- `job_items.product_id` matches the inventory pool's `product_id`

In other words: how many of this product does this client have on active jobs that haven't been fulfilled yet?

**Free** = Available − Planned. Can go negative if more are planned than available (over-committed). Display negative values in red.

**Query approach:**

```sql
WITH inventory_counts AS (
  SELECT
    ii.product_id,
    ii.allocated_client_id,
    COUNT(*) FILTER (WHERE ii.status = 'available') AS available,
    COUNT(*) FILTER (WHERE ii.status = 'in_transit') AS in_transit,
    COUNT(*) FILTER (WHERE ii.status = 'installed') AS installed,
    COUNT(*) FILTER (WHERE ii.status = 'defect') AS defect,
    COUNT(*) FILTER (WHERE ii.status = 'in_repair') AS in_repair,
    COUNT(*) AS total
  FROM inv_inventory_item ii
  WHERE ii.status != 'written_off'
  GROUP BY ii.product_id, ii.allocated_client_id
),
planned_counts AS (
  SELECT
    ji.product_id,
    jj.client_id AS allocated_client_id,
    SUM(ji.planned_quantity - ji.fulfilled_quantity) AS planned
  FROM job_items ji
  JOIN job_jobs jj ON ji.job_id = jj.id
  WHERE ji.direction = 'outbound'
    AND jj.status NOT IN ('completed', 'closed', 'cancelled', 'incomplete')
    AND ji.fulfilled_quantity < ji.planned_quantity
  GROUP BY ji.product_id, jj.client_id
)
SELECT
  pr.name AS product_name,
  pr.sku,
  COALESCE(c.name, 'Unallocated') AS client_pool,
  COALESCE(ic.available, 0) AS available,
  COALESCE(pc.planned, 0) AS planned,
  COALESCE(ic.available, 0) - COALESCE(pc.planned, 0) AS free,
  COALESCE(ic.in_transit, 0) AS in_transit,
  COALESCE(ic.installed, 0) AS installed,
  COALESCE(ic.defect, 0) AS defect,
  COALESCE(ic.in_repair, 0) AS in_repair,
  COALESCE(ic.total, 0) AS total
FROM inventory_counts ic
FULL OUTER JOIN planned_counts pc
  ON ic.product_id = pc.product_id
  AND ic.allocated_client_id = pc.allocated_client_id
JOIN inv_product_registry pr ON COALESCE(ic.product_id, pc.product_id) = pr.id
LEFT JOIN mock_cl_companies c ON COALESCE(ic.allocated_client_id, pc.allocated_client_id) = c.id
ORDER BY pr.name, c.name NULLS LAST;
```

**Why FULL OUTER JOIN:** A client might have planned jobs for a product but zero inventory items in that pool yet (all still unallocated). The planned count should still show.

**Untracked items stock view** stays the same (no pool allocation for quantity-only items). Planned counts for quantity-only items can be added later using the same join pattern if needed.

**Status enum on `inv_inventory_item`:** `scheduled` remains as a valid status in the DB constraint for backward compatibility, but nothing in the application should ever set it automatically. It's effectively dead. The stock view does NOT display a "Scheduled" column — it displays "Planned" (computed from jobs) and "Free" (available minus planned) instead.

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

Single page for all item movements between locations. Replaces both the old Transfer and Return pages — **delete the Return page, route, and nav item.**

**For tracked items:**

1. Select item(s) by serial number (searchable, multi-select)
   - Show ALL items regardless of status (not just `installed` or `available`) — the page handles any location-to-location move
   - When an item is selected, show its current location (auto-populated, read-only)
2. Select destination location (dropdown of all warehouses + repair centers + client sites)
   - Cannot select the same location the item is already at
3. **Context-aware reason field:** When ANY selected item's current location is a `client_site`, show a required "Reason" dropdown:
   - `defect` — item is broken, needs repair
   - `de_installation` — client no longer needs it, item is functional
   - `swap` — being replaced by another item
   - `end_of_contract` — contract ended
   - When source is NOT a client site, hide the reason field entirely
4. Add optional notes
5. Movement date (required, blank by default — item 11)
6. Confirmation step: "Transfer [n] items from [source] to [destination] — Confirm?"
7. On submit:
   - **Movement type auto-inferred from source location type:**
     - Source is `client_site` → movement type = `return`
     - Source is `warehouse` or `repair_center` → movement type = `transfer`
   - Create `inv_stock_movement` per item with the inferred type
   - Update `inv_inventory_item.location_id` to the destination
   - **Status auto-updates:**
     - If reason is `defect` → status = `defect`
     - If destination is a `repair_center` → status = `in_repair`
     - If source is a `repair_center` and destination is a `warehouse` → status = `available`
     - If source is a `client_site` and reason is NOT `defect` → status = `available`

**For untracked items:**

1. Select product (dropdown, quantity_only products only)
2. Select source warehouse (dropdown, only warehouses where this product has stock > 0)
3. Select destination warehouse
4. Enter quantity (cannot exceed available stock at source)
5. Movement date (required, blank by default)
6. On submit:
   - Create `inv_stock_movement` (type: `transfer`)
   - Decrement `inv_warehouse_stock` at source
   - Increment (or upsert) `inv_warehouse_stock` at destination

### 5. Pool Allocation Management (Priority: MEDIUM)

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
- Query approach: same CTE pattern as Section 1 stock view (inventory_counts + planned_counts), but add `ii.designation` to the GROUP BY. The "Planned" and "Free" columns use the same job_items join logic. See Section 1 query for the full pattern — the only change is adding `ii.designation` as a grouping dimension.

**8d. Stock-in page**

- Add optional "Designation" dropdown, defaults to Deployment
- Sets `designation` on newly created items

**8e. Transfer page (handles both transfers and returns)**

- Do NOT change designation on any transfer or return. Item keeps whatever designation it had.

**8f. Business rule: Spare deployment**

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

### 11. Movement Date Input on All Movement Interfaces (Priority: HIGH)

All stock movement pages must capture **when the movement actually happened**, separate from when the record was created in the system.

**Schema:** `inv_stock_movement` already has `movement_time`. Add `created_at` if not present:

```sql
ALTER TABLE inv_stock_movement
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
```

- `movement_time` — user-entered datetime, when the physical movement happened. **Required, blank by default** — the user must input it. Do not default to now().
- `created_at` — auto-set by the database on insert. Never editable.

**UI changes — apply to all movement pages:**

- **Stock In** — add "Movement Date" datetime picker. Required. Blank by default. Placed before the submit button.
- **Transfer** — same.
- **Return** — same.
- **Adjustment** — same.

**Input behavior:**

- Blank on page load — no default value
- Required — form cannot submit without it
- Datetime picker (date + time). Default time to current time when user selects a date, but let them change it.
- Validation: cannot be in the future

**Movements log:**

- Display both columns: "Movement Date" (`movement_time`) and "Logged At" (`created_at`)
- Sort by `movement_time` by default (when things actually happened), not `created_at`
- The discrepancy between the two tells you how delayed the logging was

### 12. Ownership Field (Priority: LOW — no UI needed yet)

New column `ownership` on `inv_inventory_item` — already in the DB. Values: `gp_owned` (default), `customer_owned`.

**Context:** GP's Airtable inventory currently mixes three types of records:

1. **GP-owned, GP-deployed** — real inventory that GP bought and deploys. This is what the entire prototype models today.
2. **Customer-owned, GP-managed** — the customer bought their own screen, but GP runs signage software on it. GP needs to track the hardware for service delivery purposes, but it never went through GP's warehouse, has no PO, no GP cost, no GP warranty.
3. **Software-only subscriptions** — webplayer licenses recorded as `INV-xxxx` in Airtable. These are NOT inventory — they should migrate to the Subscriptions domain, not inventory.

**Rules for `customer_owned` items:**

- Skip procurement and stock-in flows (no PO, no goods receipt)
- Created directly in the system with serial number, product, and installation location
- No warehouse history, no cost, no GP warranty
- Still appear in the inventory view (deployment team needs to see them)
- Excluded from stock valuation and procurement reports
- Excluded from stock overview counts (they were never "in stock")

**What to do now: nothing.** The field exists in the DB for when migration happens. Do not wire it into the UI yet. All existing items default to `gp_owned`. When the Airtable migration (IN4) happens, customer-owned items get flagged during the migration script.

## Updated Navigation

```
Sidebar:
  Products        /products
  Inventory       /inventory
  Stock           /stock
  Stock In        /stock-in
  Transfer        /transfer
  Adjustment      /adjustment
  Movements       /movements
```

## Status Transition Rules

Valid status transitions for tracked items:

**Note:** `scheduled` is NOT used as an inventory status. "Planned" counts are computed from `job_items`, not stored on individual items. See Section 1 stock view design decision.

```
available → in_transit       (being shipped / picked for a job)
available → installed        (direct install, no transit step)
available → written_off      (lost, scrapped, or beyond repair)
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

## Bug Fixes (Priority: URGENT — apply before continuing)

### Fix 1: Metadata adjustments should not set locations

Adjustment movements that are purely metadata changes (designation change, status change, client reallocation) must set `from_location` and `to_location` to `null`. These are not physical movements — nothing changed location.

**Affected operations:**

- Inline designation change on inventory detail panel
- Bulk designation change
- Inline client reallocation on inventory detail panel
- Bulk client reallocation
- Status change via adjustment page

**NOT affected (these correctly use locations):**

- Write-offs — `from_location` should be set to where the item was (it left that location). `to_location` is null.
- Untracked quantity adjustments — `to_location` is the warehouse being corrected. `from_location` is null.

### Fix 2: Written-off items are terminal — no further operations

Items with `status = 'written_off'` must be excluded from all item selection dropdowns on operational pages:

- Adjustment page — cannot select written-off items (no double write-off)
- Transfer page — cannot select written-off items
- Return page — cannot select written-off items
- Bulk actions on inventory page — cannot include written-off items in reallocation or designation change

Written-off items remain visible in:

- Inventory list (for audit trail — shown with grey badge)
- Movement log (historical record)
- Product detail movement history

Filter: add `WHERE status != 'written_off'` to all item selection queries on operational pages.

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
8. **Cannot operate on written-off items:**
   After writing off an item, verify it does NOT appear in the item selection dropdown on adjustment, transfer, or return pages. Verify it cannot be selected for bulk actions.
9. **Metadata adjustment locations are null:**
   Change an item's designation via inline edit → check movement log → verify FROM and TO both show "—" (null). Do the same for client reallocation and status change.

---

## Section 6: Jobs Domain

**Date:** 2026-09-16
**Context:** Sections 1 and 2 (Inventory) are prototyped. The job schema extends the system to track work orders and connect them to inventory movements.

### New Tables (already in sandbox)

```sql
job_jobs (
  id uuid PK,
  job_number text UNIQUE NOT NULL,        -- format: JOB-00000001 (auto via sequence)
  job_type text NOT NULL,                  -- installation, delivery, collect, un_installation,
                                           -- rework, survey, ma_audit, ma_preventive,
                                           -- ma_reactive, account_setup, pre_sale
  status text NOT NULL DEFAULT 'tentative', -- tentative, scheduled, in_progress, completed,
                                           -- closed, incomplete, cancelled
  client_id uuid FK → mock_cl_companies NOT NULL,
  location_id uuid FK → mock_cl_locations NOT NULL,  -- one job = one location
  partner_id uuid FK → mock_cl_companies NULLABLE,   -- install partner or GP's own team
  scheduled_date timestamptz NULLABLE,     -- null for tentative jobs
  completed_date timestamptz NULLABLE,     -- set when status → completed
  closed_date timestamptz NULLABLE,        -- set when status → closed
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)

job_items (
  id uuid PK,
  job_id uuid FK → job_jobs NOT NULL (CASCADE),
  product_id uuid FK → inv_product_registry NOT NULL,
  direction text NOT NULL,                 -- 'outbound' (to site) | 'inbound' (from site)
  planned_quantity integer NOT NULL DEFAULT 1,
  fulfilled_quantity integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned',  -- 'planned' | 'partial' | 'fulfilled'
  created_at timestamptz
)

job_item_serials (
  id uuid PK,
  job_item_id uuid FK → job_items NOT NULL (CASCADE),
  inventory_item_id uuid FK → inv_inventory_item NOT NULL,
  entered_at timestamptz                   -- when the serial was logged
)

job_assignees (
  id uuid PK,
  job_id uuid FK → job_jobs NOT NULL (CASCADE),
  profile_id uuid FK → mock_plat_profiles NOT NULL,
  role text NOT NULL DEFAULT 'member',     -- 'lead' | 'member'
  UNIQUE (job_id, profile_id)
)
```

Helper function `generate_job_number()` returns next `JOB-XXXXXXXX` from `job_number_seq`.

### Seed Data

3 jobs seeded:

- **JOB-00000001** — Installation at KFC Siam Paragon, scheduled. 2x QM55C outbound + 2x SD cards outbound. Boss assigned as lead.
- **JOB-00000002** — Reactive maintenance at KFC Siam Paragon, tentative. 1x QM55C outbound (replacement) + 1x QM55C inbound (defective). No partner, no assignee yet.
- **JOB-00000003** — Survey at Apple Store CentralWorld, completed. No job items (survey has no inventory impact). Boss assigned as lead.

### Status Flow

```
tentative → scheduled → in_progress → completed → closed
                                    ↘ incomplete
                    (any) → cancelled
```

- `tentative` — job exists, no confirmed date
- `scheduled` — date confirmed
- `in_progress` — work is being done on-site
- `completed` — field work done, serial numbers entered, inventory moved
- `closed` — admin complete, sign-off received, docs uploaded
- `incomplete` — partial work, some items may be fulfilled
- `cancelled` — job called off

### Key Design Decision: Inventory moves on serial entry, NOT on job status change

When an installer enters a serial number against a job item:

1. Create `job_item_serials` row linking serial to job item
2. Immediately create `inv_stock_movement` (movement_time = user-entered date, created_at = now)
3. Immediately update `inv_inventory_item`:
   - Outbound items: status → `installed`, location → job's location, warranty activates on first install
   - Inbound items: status → `available` or `defect` (depending on context), location → warehouse
4. Increment `job_items.fulfilled_quantity`
5. If `fulfilled_quantity == planned_quantity` → job_items.status = `fulfilled`
6. If `fulfilled_quantity > 0 but < planned_quantity` → job_items.status = `partial`

This means inventory is accurate the moment data is entered, not when the job is closed. Late data entry (installer reports on the 17th for work done on the 12th) is handled by the movement_time field.

### Partial Fulfillment

An incomplete job can have partial inventory movements. 2 of 3 screens installed = 2 items moved, 1 still in warehouse. The job shows `incomplete`, the job item shows `partial` (fulfilled: 2, planned: 3).

Resolution paths:

- Send the remaining item later, fulfill the last serial → job item → `fulfilled` → job → `completed`
- Reduce `planned_quantity` to match reality → job item → `fulfilled` → job → `completed`
- Close the job as incomplete — installed items stay installed, unfulfilled items stay where they are

### Pages to Build

#### 13. Jobs List `/jobs` (Priority: HIGH)

Table view of all jobs.

**Columns:** Job Number, Type (badge), Status (badge), Client, Location, Partner, Scheduled Date, Assignees

**Filters:** status, job_type, client, partner

**Actions:**

- "Create Job" button → form
- Click row to open job detail

#### 14. Job Detail `/jobs/:id` (Priority: HIGH)

Full job view with sections:

**Header:** Job number, type badge, status badge, client, location, partner, dates

**Status controls:** Buttons to advance status along the flow. Only valid transitions enabled:

- Tentative: "Schedule" button (requires date)
- Scheduled: "Start" button
- In Progress: "Complete" or "Mark Incomplete"
- Completed: "Close"
- Incomplete: "Resume" (back to in_progress) or "Close as Incomplete"

**Job Items section:**

- Table of job_items: Product, Direction (outbound/inbound badge), Planned, Fulfilled, Status
- "Add Item" button for adding more items to the job
- Each row expandable to show linked serials from job_item_serials

**Serial Entry section** (visible when job is `in_progress` or `incomplete`):

- Select a job item (outbound or inbound)
- Enter serial number (searchable by existing inventory items)
  - For outbound: only show items matching the product, status `available` or `scheduled`, at a warehouse
  - For inbound: only show items matching the product, status `installed`, at this job's location
- Enter movement date (required, blank default — same MovementDateInput component)
- Submit → triggers the full chain (serial link + inventory update + stock movement + fulfilled_quantity increment)
- Show confirmation: "Serial [X] linked to [product]. Inventory updated: [warehouse] → [location]"

**Assignees section:**

- List of assigned profiles with role
- Add/remove assignees

**Notes section:**

- Free text, editable

#### 15. Create Job Form (Priority: HIGH)

Form fields:

- Job type (dropdown of all types)
- Client (searchable dropdown → mock_cl_companies)
- Location (searchable dropdown → mock_cl_locations, filtered to selected client's locations)
- Partner (searchable dropdown → mock_cl_companies, nullable)
- Scheduled date (optional — leave blank for tentative)
- Notes (optional)

On submit:

- Generate job_number via `generate_job_number()`
- Status = `tentative` if no date, `scheduled` if date provided
- Redirect to job detail page

Job items are added after creation, on the detail page — not in the create form. Keeps creation simple.

### Job Type → Inventory Impact Reference

| Job Type        | Typical Direction | Job Items Required?                 |
| --------------- | ----------------- | ----------------------------------- |
| installation    | outbound          | Yes                                 |
| delivery        | outbound          | Yes                                 |
| collect         | inbound           | Yes                                 |
| un_installation | inbound           | Yes                                 |
| ma_reactive     | both or none      | Optional — partner may fix in place |
| ma_preventive   | maybe outbound    | Optional                            |
| rework          | maybe both        | Optional                            |
| survey          | none              | No                                  |
| ma_audit        | none              | No                                  |
| account_setup   | none              | No                                  |
| pre_sale        | none              | No                                  |

### Test Scenarios

10. **Full installation flow:**
    Create an installation job for KFC Siam Paragon → add 2x QM55C outbound → schedule → start → enter serial numbers one at a time with different movement dates → verify each serial immediately moves inventory (status → installed, location → KFC Siam Paragon, warranty activates) → verify job item fulfilled_quantity increments → complete → close
11. **Reactive maintenance swap:**
    Create a ma_reactive job → add 1x QM55C outbound + 1x QM55C inbound → enter the replacement serial (outbound) → verify it installs → enter the defective serial (inbound) → verify it returns to warehouse with status defect → complete
12. **Partial installation:**
    Create installation job with 3x QM55C → enter 2 serials → mark incomplete → verify job_item status = partial, fulfilled = 2, planned = 3 → verify the 2 installed screens are correctly tracked → later enter 3rd serial → verify job_item → fulfilled → complete job
13. **No-inventory job:**
    Create a survey job → no job items → schedule → start → complete → close → verify no inventory movements created
