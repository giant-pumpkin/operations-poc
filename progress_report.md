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

- Transfer workflow (move items between locations)
- Stock adjustment workflow
- Reporting / dashboards
- Product image upload
- Bulk import
- User auth + role-based access
