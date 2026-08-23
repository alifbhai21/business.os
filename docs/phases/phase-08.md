# Phase 08 — Dashboard & Reports

## Objective
Implement the owner dashboard with today's key metrics and full sales/purchase/inventory/financial reports.

## Why This Phase Exists
The PRD requires a dashboard showing today's sales, purchases, expenses, profit, stock value, receivables, payables, cash balance, and low-stock list, plus comprehensive reports.

## Dependencies
- Phase 05 — Sales, Purchases & Payments (VERIFIED)
- Phase 07 — Double-Entry Accounting Engine (VERIFIED)

## Implementation (2026-08-23)

### Recovery audit result
- An interrupted prior session had left an untracked `server/src/services/dashboard.service.ts`.
  Audited against the real models: core aggregation correct; fixed one real bug (recent-activity
  queries included DRAFT and VOIDED sales/purchases) before building on it.
- Baseline gate recorded BEFORE implementation: backend typecheck exit 0; backend tests 465/465,
  0 failed / 0 skipped; mobile typecheck exit 0; `git diff` clean.

### Backend
- `services/dashboard.service.ts` — owner dashboard: today's sales/purchases/expenses counts+totals,
  gross profit delegated to the VERIFIED Phase 07 journal P&L over "today", stock value
  (Σ currentStock×avgCost), cash per shop-scoped accounts, receivables/payables totals, low-stock
  list (same predicate as inventory.service), merged recent activity (COMPLETED only, signed paisa).
- `services/report.service.ts` — server-authoritative reports over COMPLETED documents only:
  - Sales: daily / monthly (`$dateToString` UTC keys) / product (qtySold, returnedQty, salesTotal,
    taxTotal, netRevenue, costTotal, grossProfit from costPrice snapshots) / customer (walk-ins share
    the null-id bucket); `$facet` pagination on group dimensions.
  - Purchases: daily / monthly / product (qtyPurchased, purchasesTotal, costTotal) / supplier.
  - Inventory: business-wide summary (productCount, totalUnits, stockValue @avgCost, retailValue
    @sellingPrice, lowStockCount) + paginated rows with per-row computed values.
  - Receivables / Payables: customers with currentDue>0 / suppliers with currentPayable>0, sorted desc,
    totals + pagination.
  - Expenses: category aggregation with date-range filtering (count/total per category).
  - Profit-loss: DELEGATES to `accounting.service.profitLoss` — zero duplicated logic; identical output
    to `/api/v1/accounting/profit-loss` (asserted by test).
- `services/search.service.ts` — global search across products (name/sku/barcode), customers
  (name/phone/code), suppliers (name/phone/company), sales (invoiceNo/customerName) and purchases
  (invoiceNo/supplierInvoiceNo/supplierName). Term is regex-escaped (injection/ReDoS safe), ≥2 chars,
  5 hits per bucket, tenant-scoped always and shop-scoped for pinned members on transactional hits.
- Routes: `GET /api/v1/dashboard`, `GET /api/v1/reports/{sales,purchases,inventory,profit-loss,
  receivables,payables,expenses}`, `GET /api/v1/search` mounted in `app.ts`.

### Security
- Authentication: all routes behind `requireAuth`.
- Tenant isolation: `resolveBusiness` + service-level `membershipFor` re-check (defense in depth);
  foreign business → 404 everywhere (tested).
- Shop isolation: `assertShopAccess`; a shop-pinned member is pinned SERVER-side and cannot widen
  scope by passing another shopId (404) — dashboard scope echoes the effective shop (tested).
- RBAC: dashboard + all /reports endpoints answer to Owner/Admin/Manager/Accountant (the same
  financial persona matrix as Phase 07 accounting reads); Viewer/Salesperson/Inventory Manager → 403.
  /search mirrors catalog-read parity: any ACTIVE member.
- Validation: defensive query parsing — invalid dates, inverted ranges (from > to), invalid groupBy,
  missing businessId, short search terms → 400. No client-supplied financial value is ever read.
- Server-authoritative money: every figure derives from documents/journals in integer paisa;
  rounding never occurs client-side.

### Mobile
- `screens/Dashboard.tsx` — rebuilt on GET /api/v1/dashboard: quick actions (+Sale +Purchase
  +Payment +Expense +Transfer), today's metrics grid, balances (cash/receivables/payables/stock),
  low-stock list, recent activity, pull-to-refresh, loading/error/empty states, header buttons for
  Global Search and Reports. Zero local financial computation.
- `screens/Reports.tsx` — Reports overlay hub: Sales report (daily/monthly × product/customer
  breakdowns), Purchase report (daily/monthly × product/supplier), Inventory report (valuation summary
  + flagged rows), Financial report (P&L + receivables/payables + expenses by category).
- `screens/GlobalSearch.tsx` — debounced live search screen rendering all five buckets.
- `screens/Home.tsx` — overlays wired (reports/search), quick actions land on the matching
  Transactions-hub section; `TransactionsScreen` gained an `initial` section prop.
- `screens/Settings.tsx` — Reports entry added to the Settings navigation list.
- i18n: all Phase 08 keys added in BOTH bn and en (325 keys/language, bn↔en parity asserted by script).

### Testing
- `test/dashboard.test.ts` (8): hand-computed full-metric verification incl. journal-engine gross
  profit, DRAFT/VOIDED exclusion from recents+counts, tenant/shop isolation, server-side pinning,
  persona-matrix RBAC, 401/400.
- `test/reports.test.ts` (11): daily/monthly/product/customer sales buckets, purchase dimensions,
  inventory valuation + pagination, receivables/payables totals/ordering/delta, expense ranges,
  empty-tenant zeroing, P&L parity with the accounting engine, RBAC loop over all 7 endpoints,
  cross-tenant 404 loop, validation matrix.
- `test/report.test.ts` (18, recovered concurrent-session file): reconciled to the implemented
  contract; passes fully alongside the above.
- `test/search.test.ts` (7): multi-collection hits, literal escaping, status surfacing, tenant
  isolation, role parity, shop-pinned scoping of transactional hits.
- Real Atlas (`test/atlas/integration.atlas.ts`, +5): dashboard DELTA assertions against exact HTTP
  transactions; /reports/sales reconciled against raw Sale collection recomputed independently;
  /reports/inventory valuation recomputed from Product collection; receivables/payables totals equal
  Atlas dues; /search hit + foreign-tenant non-leak. All run against `business_os_api_test` via the
  existing safety-guarded harness (masked URIs, no destructive ops).

## API

- [x] `GET /api/v1/dashboard`
- [x] `GET /api/v1/reports/sales`
- [x] `GET /api/v1/reports/purchases`
- [x] `GET /api/v1/reports/inventory`
- [x] `GET /api/v1/reports/profit-loss`
- [x] `GET /api/v1/reports/receivables`
- [x] `GET /api/v1/reports/payables`
- [x] `GET /api/v1/reports/expenses`
- [x] `GET /api/v1/search?q=` (added for the spec'd global search)

## Verification status

- [x] Backend: typecheck exit 0; **510/510 tests pass** (465 baseline preserved + 45 new), 0 failed,
      0 skipped, process exits cleanly, no force-exit.
- [x] Mobile: `tsc --noEmit` exit 0.
- [x] Real Atlas: `npm run test:atlas` → 18/18 pass (13 pre-existing + 5 new Phase 08), dedicated test DB only.
- [x] Final git diff reviewed — no changes to any VERIFIED Phase 05–07 source file; additions are
      purely additive routes/services/tests plus the documented app.ts mounts.

## Known limitations
- "Today" on the dashboard uses the SERVER's local timezone (no per-business timezone yet).
- Daily/monthly grouping keys are UTC (`$dateToString` default); consistent and tested, but not
  timezone-adjusted per business.
- Products/customers/suppliers are business-level in this schema, so inventory valuation,
  receivables and payables are business-wide even for shop-pinned members (documented schema reality).
- Line-level sales figures are GROSS of later returns; net-of-returns truth lives in profit-loss
  (contra entries) by design.
- Mobile runtime verification still pending (no emulator/device available in this environment).

## Status
- [ ] Not started
- [ ] In progress
- [x] Complete — all acceptance criteria pass (2026-08-23)
