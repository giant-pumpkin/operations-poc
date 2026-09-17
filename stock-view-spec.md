# Stock View Page — Data Spec for Redesign

## Purpose

The Stock Overview page is the central dashboard for seeing what inventory is where, who it's allocated to, and what state it's in. It serves operations staff who need to answer questions like: "Do we have enough Samsung QM55C screens available for the upcoming KFC deployment?" or "How many Manhattan mounts are sitting in GP Warehouse right now?"

## Two tracking modes

The system tracks inventory in two fundamentally different ways depending on the product:

### 1. Serial-Tracked Items

Each physical unit has its own row with a unique serial number (e.g. `0R3FHNFYC00001`). These are high-value items like commercial displays.

**Fields per item:**

| Field | Type | Example values |
|-------|------|----------------|
| `serial_number` | string | `0R3FHNFYC00001` |
| `product_name` | string | `Samsung QM55C` |
| `sku` | string | `SAM-QM55C` |
| `status` | enum | `available`, `scheduled`, `installed`, `in_transit`, `defect`, `in_repair`, `written_off` |
| `location` | string (warehouse name) | `GP Warehouse`, `AudioAsis Warehouse`, `Titanium Warehouse (MYS)` |
| `allocated_client` | string or null | `THA - KFC - RD`, `THA - Advice IT`, `null` (= unallocated) |
| `designation` | enum | `deployment`, `spare`, `maintenance` |

**Aggregation on current page:**
- Grouped by **product**, then expandable sub-rows by **pool** (client + designation combo)
- Columns show count per status: Available, Committed, In Transit, Installed, Defect, In Repair, Total
- "Committed" = unfulfilled job demand for that product+client (computed from open jobs, not a stored field)
- Available turns red when Available < Committed (warning: not enough stock to cover demand)
- Can filter by warehouse tab

### 2. Quantity-Only Stock

Bulk/commodity items tracked as aggregate quantities per pool — no serial numbers (e.g. SD cards, mounts).

**Fields per stock row:**

| Field | Type | Example values |
|-------|------|----------------|
| `product_name` | string | `Manhattan 43" Mount`, `8GB SD Card` |
| `sku` | string | `MHTN-43`, `UT-SD_CARD` |
| `warehouse` | string | `GP Warehouse` |
| `allocated_client` | string or null | `THA - KFC - RD`, `null` (= unallocated) |
| `designation` | enum | `deployment`, `spare`, `maintenance` |
| `quantity` | integer | `20`, `5`, `50` |

**Aggregation on current page:**
- Grouped by **product**, then expandable sub-rows by **pool** (client + designation combo)
- Columns: Product, SKU, Quantity (total)
- Sub-rows show: pool label (`Client · Designation` or `Unallocated · Designation`) and quantity
- No status breakdown (quantity-only items don't have per-unit statuses)

## Dimensions / filters

| Dimension | Values | Notes |
|-----------|--------|-------|
| **Warehouse** | `GP Warehouse`, `AudioAsis Warehouse`, `Titanium Warehouse (MYS)` | Currently shown as tab filter at top. "All Items" is the default view. |
| **Product** | Any registered product | Top-level grouping row |
| **Client allocation** | Any client company or `Unallocated` | Current clients: `Giant Pumpkin`, `THA - KFC - RD`, `THA - Advice IT`, `MYS - Boost Juice` |
| **Designation** | `deployment`, `spare`, `maintenance` | Purpose/category of the stock |
| **Status** (serial only) | `available`, `scheduled`, `installed`, `in_transit`, `defect`, `in_repair` | `written_off` items are excluded from the view |

## Key relationships

- A **pool** is the combination of `(product, location, client, designation)` — this is the unique grouping unit
- Serial-tracked items each belong to exactly one pool
- Quantity-only items store an aggregate count per pool
- **Committed** demand comes from `job_items` (outbound direction, unfulfilled quantity on open jobs)
- A product can have committed demand from a client even if zero items are currently allocated to that client — these show as "phantom pools" with Available: 0 and Committed: N

## Current sample data scale

- 3 warehouses
- 4 clients
- ~3 serial-tracked products (~7 items each, ~19 total serial items)
- ~2 quantity-only products (~2-3 pools each)

Production will have more products and items, but the warehouse and client count stays small (5-10 each).

## Pain points with current design

- Two separate tables (serial-tracked vs quantity-only) that show the same conceptual thing (stock levels) but look completely different
- The serial-tracked table has many columns (7 status columns) and most cells are 0 — lots of visual noise
- The accordion expand/collapse to see pool breakdown requires clicking into each product
- Warehouse filtering is tab-based and takes up horizontal space
- No quick way to see "all stock for client X" or "all spare stock" across products
