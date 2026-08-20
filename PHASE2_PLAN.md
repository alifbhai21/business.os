# Phase 2 Implementation Plan — Sales & Purchase + Inventory

This plan extends the existing Phase 1 architecture. It **does not** change the stack
(Express + TS + Mongoose backend, Expo SDK 57 + TS mobile) and reuses all existing
conventions: `asyncHandler`/`ApiError`, zod validation, string money, `businessId`
tenant isolation, `requireAuth`, the mobile `FormModal`/`Card`/`Input`/`Button`/`Chip`
UI kit, and the bn/en i18n dictionaries.

## Phase 1 facts that drive the design (from code inspection)

- Money is stored as **strings** (`Party.openingBalance`, `Product.purchasePrice`,
  `Product.sellingPrice`, `Product.wholesalePrice`). Money math stays in the server.
- `Product.stock` is a `Number` (physical quantity, not money) with `minStock`.
- Existing response envelopes: `{ products: [...] }`, `{ items: [...] }`,
  `{ categories: [...] }`, `{ users: [...] }`, `{ message }`, `{ item }`, `{ product }`.
- Errors are `{ message }` with 4xx/5xx via `ApiError`.
- `req.user`/`req.business` are attached by `requireAuth` (typed via `express.d.ts`).
- Roles: `OWNER`, `ADMIN`, `STAFF`. Only `OWNER`/`ADMIN` manage users. Register creates an OWNER.
- Modules are activated per business type (`MODULES_BY_TYPE`), including `sales`,
  `purchases`, `inventory`.
- The mobile app has no navigation library — `Home` switches tabs with state.
- There is **no test framework** yet. Node 22 ships `node:test`.

## Key Phase 2 design decisions

1. **Single sale/purchase document with embedded items.** Separate `SaleItem` /
   `PurchaseItem` models are not needed. Embedded item arrays keep an order atomic —
   there is no separate save step to get out of sync with the stock movement.
2. **Idempotency is guaranteed by unique stock-movement keys.**
   `StockMovement` has a unique compound index `{ businessId, refType, refId }` where
   refId is the document id (sale/purchase/adjustment). The movement is inserted
   *inside* the same MongoDB transaction as the document save, so finalizing twice
   fails on the unique key and can never double-move stock.
3. **Inventory is derived, never stored as a separate balance.** `Product.stock` is
   the live denormalized count updated atomically in the transaction; `StockMovement`
   rows are the auditable ledger and always carry `balanceAfter` snapshots. A `stock`
   field is also persisted on the order item so history is correct even if a product
   is later edited.
4. **Money = integer minor units.** Product price strings are parsed to integer minor
   units (`100.50` BDT → `10050`) via a BigInt-safe utility. Discounts, taxes, paid
   amounts are the same. All client-sent totals are **recalculated server-side**.
   `taxRate` is a percent string (e.g. `"5"`), item discount and order discount are
   flat amounts.
5. **Stock guard is atomic.** The stock decrease uses a conditional `findOneAndUpdate`
   (`$inc` + `$expr` guard `stock >= qty`) inside the transaction, so two concurrent
   sales cannot both read `stock=10` and sell 10. Negative stock is rejected unless
   `Business.allowNegativeStock` is enabled (new field, default `false`).
6. **Roles:** `OWNER` and `ADMIN` can create/finalize/cancel sales & purchases, adjust
   stock, record payments. `STAFF` can view and (config kept minimal) sell — see
   Known Limitations. Stock adjustment is OWNER/ADMIN only.
7. **Payments** are a separate embedded array on sale/purchase (method, amount, date,
   note, recordedBy, idempotency key). Status `UNPAID | PARTIAL | PAID` is derived and
   stored for querying. `/api/payments` handles recording + listing.
8. **Invoice engine** is one serializer that renders a unified invoice shape from any
   sale or purchase doc — one code path for sales and purchase invoices.
9. **Transactions:** server supports MongoDB replica-set transactions. `mongodb-memory-server`
   auto-starts a single-node replica set, so transactions work in dev and tests
   automatically. If a non-transactional environment is detected, a fallback creates
   the movement before the document and deletes it on failure (keeps atomicity within
   the limits of the current setup).

## Models added

| Model | Purpose |
|---|---|
| `Sale` | Header + embedded items + totals + payments + status |
| `Purchase` | Header + embedded items + totals + payments + status |
| `StockMovement` | Auditable ledger row (unique per ref) + `balanceAfter` |
| `Business` (modified) | + `allowNegativeStock: Boolean` (default false) |

Indexes: `Sale/Purchase.businessId + createdAt`, `+ _id`; `StockMovement.businessId +
productId + createdAt`; unique `{businessId, refType, refId}` for idempotency;
`Payments` idempotency keys unique within order.

## API endpoints added

- `POST/GET /api/purchases`, `POST /api/purchases/:id/finalize`, `POST
  /api/purchases/:id/cancel`, `GET /api/purchases/:id`, `GET /api/purchases/:id/payments`,
  `POST /api/purchases/:id/payments`
- `POST/GET /api/sales`, `POST /api/sales/:id/finalize`, `POST /api/sales/:id/cancel`,
  `GET /api/sales/:id`, `GET /api/sales/:id/payments`, `POST /api/sales/:id/payments`
- `GET /api/invoices/sales`, `GET /api/invoices/purchases`, `GET /api/invoices/:type/:id`
- `GET /api/inventory/stock`, `GET /api/inventory/movements`, `POST
  /api/inventory/adjust`, `POST /api/inventory/opening`
- `GET /api/dashboard`

## Mobile screens added

- `Home`: module chips → navigates to Sales / Purchases / Inventory / Invoices
- `SalesScreen` (list), `SaleNewScreen` (search → cart → customer → payment →
  finalize), `SaleDetailScreen` (invoice preview + payments + cancel)
- `PurchasesScreen` (list), `PurchaseNewScreen`, `PurchaseDetailScreen`
- `InventoryScreen` (stock list + low stock + movements + adjust + opening)
- `InvoicesScreen` (sales/purchases invoices + detail)
- `DashboardScreen` reworked: today's sales/purchases, stock value, low-stock count,
  receivable, payable, recent sales/purchases
- All new strings added to both bn and en dictionaries

## Testing

Backend tests use `node:test` + `tsx` + `mongodb-memory-server` (already a dev dep).
Covered: purchase stock increase, draft no-stock, duplicate finalize idempotency, sale
stock decrease, insufficient-stock rejection, sale payment statuses (UNPAID/PARTIAL/
PAID), due calculation, stock movement rows, stock adjustment, cross-business isolation,
unauthorized rejection, opening stock. Commands:
`cd server && npm run typecheck && npm test`, `cd mobile && npx tsc --noEmit`.

## Order of work

1. Money/utils/middleware
2. Models
3. Inventory service (atomic stock engine)
4. Sales & purchase services/routes
5. Invoice/payment/inventory/dashboard APIs
6. Tests
7. Mobile screens + i18n
8. Typechecks, fixes
9. Final security/simplify review + README

## Phase 3 hook

The Payment/Invoice/StockMovement architecture is deliberately order-agnostic
(refType string + unified invoice serializer), so returns, expenses, accounting, and
multi-branch can reuse it without rework.
