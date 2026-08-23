# Phase 06 — Inventory, Returns & Transfers

## Objective
Implement the inventory movement ledger, sales/purchase returns, stock transfers between shops, adjustments, and low-stock detection.

## Why This Phase Exists
The PRD requires tracking all inventory movements (opening, purchases, sales, returns, transfers, adjustments, damaged) and supporting returns and multi-shop stock transfers.

## Dependencies
- Phase 05 — Sales, Purchases & Payments

## Existing Implementation Status
- ZIP A: inventory_movements + stock_transfers tables + API → **REFERENCE**
- ZIP B: inventory_movements table + API → **REFERENCE**
- Returns: → **NOT_IMPLEMENTED** in both

## Tasks

### Database

- [x] Create StockMovement model (businessId, shopId, productId, type, qtyChange, prevStock/newStock, unitCost snapshot, refType/refId) (`server/src/models/StockMovement.ts`)
- [x] Create StockTransfer model (businessId, sourceShopId, destShopId, productId, quantity, PENDING/IN_TRANSIT/RECEIVED/CANCELLED, notes, createdBy, localId) (`server/src/models/StockTransfer.ts`)
- [x] Create StockReturn model — immutable return record; refId of reversal movements/journal/audit; localId idempotency (`server/src/models/StockReturn.ts`)
- [x] Add indexes: StockMovement.businessId+productId+createdAt, businessId+shopId+createdAt
- [x] Unique index: { businessId, refType, refId, productId } on StockMovement (one movement per source doc per product)
- [x] Unique partial index { businessId, localId } on StockTransfer and StockReturn (offline idempotency)

### Backend

- [x] Create inventory service (atomic stock engine — guarded `$inc` + immutable movement inside `withTransaction`)
- [x] Create inventory controller
- [x] Create inventory routes
- [x] Sales return service (stock restored via `sale_return` movement, proportional journal reversal SALE_RETURN, customer due reduced under `currentDue >= returnedDue` guard, paid cash refunded from snapshotted `paymentAccountId`, cumulative per-line `returnedQty` guarded by atomic `$expr $inc`)
- [x] Purchase return service (stock removed respecting allowNegativeStock, PURCHASE_RETURN journal, supplier payable guard, paid amount collected back)
- [x] Stock transfer service (create → guarded TRANSFER_OUT on source; RECEIVED → TRANSFER_IN on dest; CANCELLED restores source; state machine refuses illegal transitions)
- [x] Stock adjustment service (correction `ADJUSTMENT` / damaged+expired `DAMAGE` kinds)
- [x] Low-stock detection (`lowStock=true` filter on GET /inventory/stock using minStock>0 AND currentStock<=minStock)
- [x] Return idempotency (localId pre-check in transaction + unique partial index + duplicate-key recovery → retried/concurrent return resolves to original, zero extra effect)

### API

- [x] `GET /api/v1/inventory/stock`
- [x] `GET /api/v1/inventory/movements`
- [x] `POST /api/v1/inventory/adjust`
- [x] `POST /api/v1/inventory/opening`
- [x] `POST /api/v1/sales/:id/return`
- [x] `POST /api/v1/purchases/:id/return`
- [x] `POST/GET /api/v1/transfers`
- [x] `PUT /api/v1/transfers/:id/status`

### Mobile

- [x] Inventory screen (stock list + low stock filter, avg cost display, load-more pagination) (`mobile/screens/Inventory.tsx`)
- [x] Stock movements screen (product name, signed qty, prev→new, refType, date, pagination) (`mobile/screens/StockMovements.tsx`)
- [x] Adjust stock modal (in Inventory screen)
- [x] Opening stock modal (in Inventory screen)
- [x] Sales return screen + Purchase return screen (`mobile/screens/Returns.tsx` — direction chips; sends only productId/qty/reason/localId, never financial values; server `returnedQty` bounds the per-line input; pagination)
- [x] Stock transfer screen (`mobile/screens/Transfers.tsx` — source → dest → product → qty, receive/cancel actions, reference id + created date, pagination)
- [x] Wired as 6th "Inventory" tab in Home (`mobile/screens/InventoryHub.tsx`, `Home.tsx`)
- [x] bn/en i18n strings for all Phase 06 features (incl. `avgCost`)

### Testing

- [x] Adjustment movement test (+/- with prev/new snapshots)
- [x] Damaged stock test
- [x] Low-stock detection test
- [x] Partial sale return: stock restored, due reduced, account refunded, balanced journal, audit row
- [x] Over-return refused (cumulative returnedQty never exceeds qty; zero side effects)
- [x] Concurrent sale returns cannot over-return (exactly one applies)
- [x] Purchase return: stock removed, payable reduced, account collected back, balanced journal
- [x] Purchase over-return refused
- [x] Transfer create/receive writes both TRANSFER_OUT and TRANSFER_IN movements
- [x] Transfer over-draw refused; same-shop transfer rejected; cross-tenant 404; cancel restores source stock
- [x] Return RBAC at route AND service level (Owner/Admin/Manager; Salesperson/Viewer/Accountant/Inventory Manager 403)
- [x] Return idempotency: sequential retry, concurrent duplicate localIds (sale + purchase), zero additional effects
- [x] HTTP surface: 401 unauthenticated, 403 Viewer, strict Zod rejects spoofed `returnedAmount`/float qty, cross-tenant 404 with zero side effects, tenant-scoped paginated transfer list, repeated transfer localId creates exactly one
- [x] Atomic stock guard (Phase 05 suite retained: concurrent sales/finalizes, insufficient stock rollback)

## Acceptance Criteria

- [x] All stock movements tracked with previousStock/newStock snapshots
- [x] Returns reverse stock + financials (customer/supplier balance + journal)
- [x] Transfers between shops work (both sides)
- [x] Adjustments work
- [x] Low-stock alerts work
- [x] Tests passing (444/444; 32 Phase 06 tests)

## Security Model
- Every endpoint: `requireAuth` → `resolveBusiness` → `assertShopAccess` → route `requireRole` → service-level role re-check.
- Service-level matrices: inventory writes Owner/Admin/Manager/Inventory Manager; returns Owner/Admin/Manager; transfers Owner/Admin/Manager/Inventory Manager.
- All queries scoped by businessId (+ shopId where shop-pinned). Foreign business/shop/product/customer/supplier/account/document → 404.
- `.strict()` Zod schemas reject client-owned fields (totals, amounts, returnedAmount, deviceId, createdBy).

## Transaction Behavior
- One `withTransaction` per mutation: counter-free numbering n/a here; guarded stock `$inc` + StockMovement + party balance + account balance + journal + audit all commit or roll back together.
- Originals are never mutated/deleted: sale/purchase docs keep invoiceNo and history; reversals are new rows linked by refType/refId.
- Journal reversals mirror the original entry proportionally (ratio = returnedAmount/originalTotal) so debit total === credit total by construction.

## Idempotency Behavior
- StockTransfer.localId / StockReturn.localId: unique partial index `{businessId, localId}` + in-transaction pre-check + duplicate-key recovery. Retry → original returned (`duplicate:true`), zero additional effect; concurrent duplicate → loser aborts and resolves to winner's record.
- Duplicate finalize protection inherited unchanged from Phase 05.

## Known Limitations / Decisions for Later Phases
- Returns reverse value proportionally to the ORIGINAL document totals (no per-line tax recompute); Phase 07 reporting reads these entries as-is.
- No average-cost adjustment on purchase returns (cost basis stays historical; consistent with void policy).
- No dedicated return listing endpoint yet (returns visible via movements + journal; add `/returns` register if reporting needs it). The mobile Returns screen therefore lists COMPLETED sale/purchase documents and drives the return flow from them.
- Transfers move quantity only (unitCost snapshot carried; no inter-branch cost variance accounting until Phase 07).
- Pull-to-refresh is not used anywhere in the app; screens reload on mount, business/shop change, and after each mutation (consistent with the app convention).
- Movement product names are resolved client-side from `GET /products` (presentation-only join; fallback to a short id) — stock figures themselves are never computed on the client.
- Mobile runtime verification still pending (no emulator/device available — same caveat as Phase 05).

## Final Verification (2026-08-23)
- Backend: `npm run typecheck` — PASS (0 errors); `npm test` — 444/444 pass, 0 failed, 0 skipped, process terminates normally.
- Mobile: `npx tsc --noEmit` — PASS (0 errors).
- MongoDB Atlas: `/ready` → 200 `{db:"connected"}`, admin ping OK (`MONGODB_URI` from gitignored `server/.env`; success log masks credentials).
- Security spot-audit: tenant/shop scoping asserted in every list/mutation service path (`assertAccess` + businessId filter + `$or` shop scope for transfers); `.strict()` schemas reject server-owned fields; localId idempotency retained on transfers/returns/adjust/opening payloads.

## Status
- [ ] Not started
- [x] In progress → COMPLETE (all acceptance criteria verified 2026-08-23)
- [ ] Incomplete
