# ConnectIQ Inventory

Internal inventory management prototype for Giant Pumpkin's hardware deployment operations — digital signage displays, accessories, and related equipment deployed to client sites.

It tracks serial-tracked items (displays) and quantity-only items (cables, SD cards) across warehouses, repair centers, and client sites, with per-client pool allocation, warranty tracking, and a Jobs domain for work orders (installation, delivery, maintenance, etc.) that ties directly into inventory movements.

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS 4 + Supabase

## Planning docs

- **`next_steps.md`** — the spec. Written in Claude web and pasted in as new sections get planned; describes what to build next, DB schema changes, and test scenarios to verify each feature.
- **`progress_report.md`** — the log. Updated alongside each commit with what was actually built, so progress can be reviewed and the next round of planning (back in Claude web) picks up from an accurate state.

Together these two files are the source of truth for "what's planned" vs. "what's done" — check them before assuming a page or feature does or doesn't exist yet.

## Pages

| Page | Route | Notes |
|------|-------|-------|
| Products | `/products` | Product registry (CRUD) |
| Inventory | `/inventory` | Serial-tracked items, search/filters, inline editing |
| Stock | `/stock` | Warehouse stock levels, pool allocation view |
| Stock In | `/stock-in` | Receive new stock (serial or quantity mode) |
| Transfer | `/transfer` | Move items between locations; auto-detects return vs. transfer from source type |
| Adjustment | `/adjustment` | Write-offs, status changes, quantity corrections |
| Jobs | `/jobs`, `/jobs/:id` | Work orders (installation, delivery, maintenance, etc.), fulfilled by entering serials/quantities against inventory |
| Movements | `/movements` | Full stock movement audit log |

## Development

```
npm install
npm run dev
```

Uses a Supabase sandbox project (no auth — hardcoded profile ID for movement attribution, RLS disabled).
