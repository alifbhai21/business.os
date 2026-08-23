# Universal Business OS — Project Tracker

**Date:** 2026-08-17
**Auditor:** Lead Software Architect

---

## Overall Progress

| Area | Progress |
|---|---|
| Overall | 22% |
| Frontend | 0% |
| Backend | 36% |
| Database | 30% |
| Mobile | 33% |
| Offline | 0% |
| Sync | 0% |
| Accounting | 0% |
| Testing | 31% |
| Security | 16% |

> **Note:** Verified only. Code that exists but is broken (missing imports, empty src/) does not count as progress.

---

## Phase Progress

- [x] Phase 01 — Foundation & Project Setup ✅
- [ ] Phase 02 — Authentication & Security — IMPLEMENTATION COMPLETE — RUNTIME VERIFICATION PENDING
- [ ] Phase 03 — Business & Shops — IMPLEMENTATION COMPLETE — RUNTIME VERIFICATION PENDING
- [ ] Phase 04 — Products, Customers & Suppliers — IMPLEMENTATION COMPLETE — RUNTIME VERIFICATION PENDING
- [x] Phase 05 — Sales, Purchases & Payments — IMPLEMENTATION COMPLETE (05.01–05.13 VERIFIED; 412/412 TESTS)
- [x] Phase 06 — Inventory, Returns & Transfers — IMPLEMENTATION COMPLETE (VERIFIED 2026-08-23; 444/444 TESTS)
- [ ] Phase 07 — Double-Entry Accounting Engine — IMPLEMENTATION COMPLETE (VERIFIED 2026-08-23; 465/465 TESTS)
- [ ] Phase 08 — Dashboard & Reports
- [ ] Phase 09 — Employees, Roles & Devices
- [ ] Phase 10 — Offline SQLite & Sync Engine
- [ ] Phase 11 — Backup & Restore
- [ ] Phase 12 — Enhancements
- [ ] Phase 13 — Testing, CI/CD & Deployment
- [ ] Phase 14 — Production Hardening & Monitoring
- [ ] Phase 15 — Future

---

## Phase 01 — Foundation & Project Setup ✅

### Database

- [x] Create MongoDB connection module (`server/src/db/connect.ts`, in-memory fallback)
- [x] Add Mongoose models directory structure
- [x] Add environment configuration (Zod-validated .env) (`server/src/config/env.ts`)
- [x] Add health check endpoint
- [x] Add ready check endpoint

### Backend

- [x] Set up Express + TypeScript project
- [x] Add tsconfig strict mode
- [x] Add package.json scripts (dev, build, start, typecheck, test)
- [x] Add middleware stack: helmet, CORS, body limit, mongo-sanitize, rate limit (Sentry deferred to Phase 14)
- [x] Add error handler middleware
- [x] Add asyncHandler utility
- [x] Add ApiError class
- [x] Add response envelope utilities
- [x] Add Winston logging

### Mobile Frontend

- [x] Fix missing `src/api.ts` — API client with token attach
- [x] Fix missing `src/theme.ts` — colors, typography, spacing
- [x] Fix missing `src/i18n/dictionaries.ts` — bn/en dictionaries
- [x] Add navigation library (state-based kept)
- [ ] Add expo-secure-store for token storage (Phase 02)
- [x] Add app icon and splash screen config (verified present)
- [x] Add Android configuration (verified present)

### Security

- [x] Add CORS allowlist config
- [x] Add express-rate-limit config
- [x] Add express-mongo-sanitize
- [x] Add helmet

### Testing

- [x] Set up test framework (node:test + supertest)
- [x] Add test config for TypeScript
- [x] Add mongodb-memory-server test setup
- [x] Add first smoke test (health/ready/404)

### Documentation

- [x] Update README with setup instructions
- [x] Add .env.example
- [x] Add .gitignore
- [x] Resolve duplicate `business-os/` directory (git-excluded, root canonical)

### Acceptance Criteria

- [x] Server starts with `npm run dev` (verified — boots with in-memory MongoDB)
- [x] Health endpoint returns 200 (verified)
- [x] Mobile app compiles without errors (verified `tsc --noEmit` 0 errors)
- [x] Typecheck passes (`npm run typecheck`)
- [x] Tests pass (`npm test` 3/3)
- [x] No missing imports (verified)

---

## Phase 02 — Authentication & Security

### Database

- [x] Create User model (name, phone, email, passwordHash, role)
- [x] Create RefreshToken model
- [x] Create Device model (deviceId, deviceName, user, branch, revoked)
- [x] Create BusinessMembership model + AuditLog model
- [x] Add indexes on User.phone, RefreshToken.token

### Backend

- [x] Create auth service
- [x] Create auth controller
- [x] Create auth routes (`/api/v1/auth/register`)
- [x] Create login route (`/api/v1/auth/login`)
- [x] Create refresh route (`/api/v1/auth/refresh`) — rotation + reuse detection
- [x] Create logout route (`/api/v1/auth/logout`)
- [x] Create forgot password route
- [ ] Create OTP verification route (NOT implemented — deferred)
- [x] Password hashing with bcrypt (cost ≥ 10)
- [x] JWT access token (15 min)
- [x] Refresh token (30 days) with rotation
- [x] Refresh token reuse detection (revoke all on reuse)
- [x] Account lockout (5 attempts → 15 min)
- [x] Zod validation on all auth routes

### API

- [x] `POST /api/v1/auth/register`
- [x] `POST /api/v1/auth/login`
- [x] `POST /api/v1/auth/refresh`
- [x] `POST /api/v1/auth/logout`
- [x] `POST /api/v1/auth/forgot-password`
- [x] `POST /api/v1/auth/reset-password`
- [x] `GET /api/v1/auth/me`
- [ ] `POST /api/v1/auth/verify-otp` (deferred)

### Mobile

- [x] Secure token storage (expo-secure-store)
- [x] Login screen wired to API
- [x] Register screen wired to API (account only — business fields removed; business created in Business Setup)
- [x] Auto-refresh token interceptor (401 → refresh → retry once)
- [x] Logout clears secure storage
- [ ] Forgot password screen (API only)
- [ ] OTP verification screen (deferred)

### Security

- [x] JWT middleware (`requireAuth`)
- [x] RBAC middleware (`requireRole`/`requirePermission`)
- [x] Tenant middleware (`resolveBusiness`/`assertShopAccess`)
- [x] Rate limiting on auth routes (30/15min) + global
- [x] Audit login/logout/register/refresh events

### Testing

- [x] Auth unit tests (register, login, refresh, logout)
- [x] Auth integration tests
- [x] Password hashing tests
- [x] Token rotation tests
- [x] Account lockout tests
- [x] RBAC tests
- [x] Security tests (Zod validation, cross-tenant isolation)
- [ ] Mobile automated auth test (manual verification pending)

### Acceptance Criteria

- [x] Register creates user + session/device foundation (no default business; onboarding creates it explicitly)
- [x] Login returns access + refresh tokens
- [x] Refresh rotates token
- [x] Old refresh token reuse revokes session
- [x] Lockout after 5 failed attempts
- [x] All routes validated with Zod
- [x] Tests passing (22)

---

## Phase 03 — Business & Shops

### Database

- [x] Create Business model (name, type, currency, tax, fiscalYear, allowNegativeStock)
- [x] Create Shop model (name, branchCode, address, phone, isWarehouse, openingCash)
- [x] Create Membership model (userId, businessId, shopId, role) — reused from Phase 02
- [x] Add indexes: Business.id, Shop.businessId, Shop.businessId+branchCode (unique)

### Backend

- [x] Create business service
- [x] Create business controller
- [x] Create business routes (`/api/v1/businesses`)
- [x] Create shop service
- [x] Create shop controller
- [x] Create shop routes (`/api/v1/shops`)
- [x] Business type enum (PRD §8.2 — 10 types)
- [x] Module activation by business type (`MODULES_BY_TYPE`)
- [x] Business-scoped middleware (`requireBusiness`/membership-scoped services)
- [x] Register no longer auto-creates a default Business (onboarding: Register → Business Setup → Shop Setup)
- [x] Business creation grants the authenticated user Owner membership (server-derived, not client-chosen)

### API

- [x] `GET/POST /api/v1/businesses`
- [x] `PUT /api/v1/businesses/:id`
- [x] `GET/POST /api/v1/shops`
- [x] `PUT /api/v1/shops/:id`
- [x] `GET /api/v1/businesses/:id/modules`

### Mobile

- [x] Create Business screen
- [x] Create Shop setup screen
- [x] Create Business type selection
- [x] Create Multi-shop switching
- [x] Onboarding flow: Welcome → Register (account only) → Business Setup (explicit) → Shop Setup → Dashboard
- [x] Business switcher screen (list, switch, reload shops, invalidate stale active shop)
- [x] Shop switcher screen (list, switch, inactive badge, empty/loading/error states)
- [x] Business settings screen (name, type, address, phone, email, allowNegativeStock via PATCH)
- [x] Shop management screen (list, create, edit, activate/deactivate via PUT + status PATCH)
- [x] AuthContext business/shop state (businesses, shops, activeBusinessId, activeShopId)
- [x] API integration via `authRequest()` (no second client)
- [x] Mobile TypeScript clean (`tsc --noEmit` 0 errors)
- [ ] Mobile runtime verification (pending — no emulator/device available)

### Testing

- [x] Business CRUD tests
- [x] Shop CRUD tests
- [x] Multi-tenant isolation tests
- [x] Module activation tests
- [x] Duplicate branch code → 409 conflict (minimal backend fix + test updated)
- [x] Onboarding chain test (register → explicit business + Owner → first shop)
- [x] Register does NOT create a default Business (tested)

### Acceptance Criteria

- [x] Business creation works
- [x] Multiple shops per business
- [x] Business + shop scoping enforced
- [x] Onboarding flow complete (implementation; runtime verification pending)
- [x] Tests passing (42 total: 22 Phase 02 + 20 Phase 03)

---

## Phase 04 — Products, Customers & Suppliers

### Database

- [x] Create Product model (name, SKU, barcode, category, brand, unit, prices in paisa, stock, min/max, avgCost, image, description, status) — barcode unique per business (partial unique index)
- [x] Create Category model (businessId, name, description) — name unique per business
- [x] Create Customer model (name, phone, email, code, address, openingBalance, creditLimit, currentDue, status) — business-level (no shopId, per ZIP B)
- [x] Create Supplier model (name, phone, company, address, openingBalance, currentPayable, status) — business-level (no shopId)
- [x] Add indexes: Product.businessId+name, Product.businessId+barcode (partial unique), Customer.businessId, Supplier.businessId

### Backend

- [x] Create product service (CRUD, search by name/SKU/barcode, low-stock, category filter, barcode lookup)
- [x] Create product controller
- [x] Create product routes (`/api/v1/products`)
- [x] Create category service
- [x] Create category routes (`/api/v1/categories`)
- [x] Create customer service (currentDue seeded from openingBalance; openingBalance edits shift currentDue by delta)
- [x] Create customer routes (`/api/v1/customers`)
- [x] Create supplier service (currentPayable seeded from openingBalance; delta shift on edit)
- [x] Create supplier routes (`/api/v1/suppliers`)
- [x] Zod validation on all routes (create/update/status)
- [x] Search: name, SKU, barcode (products); name, phone, code (customers); name, phone, company (suppliers)
- [x] Low-stock filter (`lowStock=true`)
- [x] Category filter (`categoryId=`)
- [x] Pagination (page/limit, default 20, max 100, total/totalPages envelope)
- [x] Global units endpoint (PRD §8.3: piece, box, packet, kg, gram, liter, meter, feet, dozen, custom)
- [x] RBAC per module (services re-check role — defense in depth)

### API

- [x] `GET/POST /api/v1/products`, `GET/PUT/PATCH /api/v1/products/:id`, `PATCH /api/v1/products/:id/status`
- [x] `GET /api/v1/products/lookup/barcode`
- [x] `GET/POST /api/v1/categories`, `GET/PUT/PATCH /api/v1/categories/:id`, `PATCH /api/v1/categories/:id/status`
- [x] `GET/POST /api/v1/customers`, `GET/PATCH /api/v1/customers/:id`, `PATCH /api/v1/customers/:id/status`
- [x] `GET/POST /api/v1/suppliers`, `GET/PATCH /api/v1/suppliers/:id`, `PATCH /api/v1/suppliers/:id/status`
- [x] `GET /api/v1/units`
- [ ] `GET /api/v1/customers/:id/ledger` — deferred to Phase 05 (ledger entries created by sales/payments)
- [ ] `GET /api/v1/suppliers/:id/ledger` — deferred to Phase 05

### Mobile

- [x] Product list screen (search, low-stock chip, category filter, pagination) — rebuilt on authRequest + activeBusinessId
- [x] Add product form (all PRD fields: category/unit/preferred-supplier selectors, 4 prices, tax rate, min/max stock, description, image URL)
- [x] Edit product form (tap row; activate/deactivate in modal)
- [x] Category manager (list, add, edit, activate/deactivate)
- [x] Customer list screen (search, currentDue)
- [x] Add/edit customer (name, phone, email, address, code, openingBalance, creditLimit)
- [x] Supplier list screen (search, currentPayable)
- [x] Add/edit supplier (name, phone, email, company, address, openingBalance)
- [x] Unit selector (global units, bn/en labels)
- [x] Brand field
- [x] Wholesale price + min price fields
- [x] Min/max stock fields
- [x] Active/inactive toggle (products, categories, customers, suppliers)
- [x] Money helpers (src/money.ts, taka↔paisa) + i18n keys (bn/en)
- [x] Dashboard counts fixed (was calling dead `/api/*` endpoints)
- [ ] Product/customer/supplier detail + ledger screens — deferred to Phase 05

### Testing

- [x] Product CRUD tests
- [x] Product search tests (name, SKU, barcode)
- [x] Low-stock filter tests
- [x] Barcode uniqueness + lookup tests
- [x] Category CRUD + duplicate-name tests
- [x] Customer CRUD tests
- [x] Customer due calculation tests (opening balance seeding + delta)
- [x] Supplier CRUD tests
- [x] Supplier payable tests (opening balance seeding + delta)
- [x] Validation tests
- [x] RBAC tests (Viewer 403; Salesperson customer create)
- [x] Cross-tenant isolation tests
- [x] Soft-delete (status) tests
- [x] Units endpoint test

### Acceptance Criteria

- [x] Product CRUD verified (all PRD fields)
- [x] Customer CRUD verified
- [x] Supplier CRUD verified
- [x] Search works
- [x] Low-stock filter works
- [x] All fields supported
- [x] Tests passing (93/93: 42 baseline + 51 Phase 04)
- [ ] Ledger views — deferred to Phase 05 (no transactions yet)

---

## Phase 05 — Sales, Purchases & Payments

> **Phase 05.13 Offline sync + device identity VERIFIED (2026-08-21):** Expense offline retries are now idempotent — the unique partial index on
> `{businessId, localId}`, in-transaction deduplication and duplicate-key recovery mean a retried offline expense returns the ORIGINAL record
> (`duplicate: true`) instead of deducting the account twice. Device identity is snapshotted from the VERIFIED JWT claims (`req.user.deviceId`),
> never the request body — the Zod `.strict()` schemas reject a client-supplied deviceId outright. This closes a real security gap: the interrupted
> session had only wired deviceId-from-JWT into the Expense controller; Sale, Purchase, Payment and the settlement sub-resources still passed
> `req.body` directly, so a client could impersonate any device. All four now derive deviceId from the token, and `payment.service.ts` /
> `purchase.service.ts` persist it (the models already had the field). 8 new Expense offline-sync tests (first localId, duplicate retry, concurrent
> duplicate, different localId, conflicting payload, business-scoped uniqueness, deviceId-from-token, retry-after-failure) plus one deviceId
> security test each for Sale and Purchase. Full suite 412/412; npm test exits 0; backend typecheck 0 errors; mobile typecheck 0 errors.

> **Phase 05.12 Mobile screens VERIFIED (2026-08-21):** The Phase 05 transaction screens were entirely missing from the mobile app. Added a
> Transactions hub (Sales/Purchases/Payments/Accounts/Expenses) wired into the Home tab bar, with full list + create flows for each. Every screen
> uses the established `authRequest` + `useAuth` + `useI18n` + `formatTaka` patterns, has loading/error/empty/success states, validates before
> submit, and never sends server-owned financial values (balance, due, payable, totals, invoice numbers) — the server recomputes all totals. Every
> create sends a `localId` so an offline retry is idempotent. bn/en i18n strings added for all Phase 05 features. Mobile typecheck 0 errors.

> **Phase 05.09 Void / Reversal VERIFIED (2026-08-20):** New `void.service.ts` (`voidSale`, `voidPurchase`, `calcAvgCostAfterVoid`) wired as
> `POST /api/v1/sales/:id/void` and `POST /api/v1/purchases/:id/void` through the established middleware chain. Recovery audit found no
> pre-existing 05.09 work. Only `COMPLETED → VOIDED` is legal: DRAFT is 400 and a repeat void is an idempotent no-op reporting `duplicate: true`.
> Nothing is ever deleted — the document keeps its invoiceNo, totals, original journal and original audit entry, and every reversal is a NEW row.
> Sale void restores stock (`sale_void` movement), decrements the customer due under a `currentDue >= dueAmount` guard, debits the paid amount out of
> the SAME account (snapshotted `paymentAccountId`), mirrors the journal and writes `SALE_VOIDED`. Purchase void removes stock under the existing
> `allowNegativeStock` policy, recomputes avgCost from inventory VALUE (never an inverse-formula un-blend, so it stays correct after later purchases
> and absorbs paisa drift), decrements the supplier payable under a `currentPayable >= dueAmount` guard, refunds the SAME account, mirrors the journal
> and writes `PURCHASE_VOIDED`. Journal reversal reuses the verified 05.04 engine unchanged (`REVERSAL`, `isReversal`, `reversesEntryId`, mirrored
> debit/credit); the original entry and its lines are asserted unchanged after the void and both entries asserted balanced. Documents with settlement
> `Payment` records are refused 400 rather than double-refunded; a due/payable already settled below the document's own figure is refused rather than
> driven negative. RBAC Owner/Admin/Manager at route AND service level — Salesperson, Accountant, Inventory Manager and Viewer 403 (Inventory Manager
> may record a purchase but not unwind one). Cross-tenant/cross-shop/foreign-document 404 with zero side effects. Four fault-injection rollback proofs
> including one that aborts at the LAST step before commit (journal reversal) with stock, avgCost, payable and the account refund all restored.
> Additive model changes only: `sale_void`/`purchase_void` StockMovement types (kept distinct from Phase 06 returns) and a nullable `paymentAccountId`
> snapshot on Sale/Purchase.
> Known gaps: no settlement-payment refund, no partial/line-level void (Phase 06 returns), no un-void, no mobile screens (05.12).
> 44 void tests pass; full suite 320/320; npm test exits 0; backend typecheck 0 errors; mobile typecheck 0 errors.

> **Phase 05.08 Purchase VERIFIED (2026-08-20):** Purchase model (embedded PurchaseItem) + purchase service/controller/routes/schemas mounted at
> `/api/v1/purchases` (`POST /`, `GET /`, `GET /:id`, `POST /:id/finalize`). Recovered from an interrupted session — all files already existed and the
> re-run baseline was green, so no 05.08 code was rewritten; the gap was test coverage (38 → 46 tests). StockMovement, BusinessCounter, journal,
> account and transaction infrastructure are reused unchanged. DRAFT purchases carry server-computed totals with no stock or financial effect;
> finalization is a single `withTransaction` covering atomic numbering (`PUR-<fiscalYear>-<branchCode>-<sequence>`, counter key `PURCHASE`), stock
> increment, weighted-average cost recalculation, StockMovement, supplier payable, guarded account decrement, Purchase completion, balanced journal
> and audit. avgCost = (oldStock × oldAvgCost + line costAmount) / (oldStock + qty), divided once and rounded to integer paisa; zero prior stock
> collapses to the purchase's own unit cost. Header discounts are allocated pro-rata into each line's cost basis and `discountAmount` is derived back
> from Σ costAmount, so the journal balances by construction. Journal: DEBIT Inventory + Tax Receivable (new ASSET concept) / CREDIT cash-bank +
> Supplier Payable, debit total === credit total. `Supplier.currentPayable` moves by `dueAmount` only — no duplicate Payment document for money paid
> at purchase time. Idempotent on duplicate finalize (draft and inline-COMPLETED paths), concurrent finalize and repeated `localId`. Three rollback
> proofs: insufficient balance, a two-line finalize whose second product went INACTIVE, and an invoiceNo unique-index collision that fails AFTER the
> account decrement. RBAC Owner/Admin/Manager/Inventory Manager at route + service level (Viewer 403, Salesperson 403).
> Cross-tenant/cross-shop/foreign-supplier/foreign-product/foreign-account all 404. Zod `.strict()` rejects 19 spoof/malformed payloads.
> Known gaps: void/reversal is 05.09, no `/purchases/:id/payments` sub-resource, no landed-cost apportionment, no mobile screens (05.12).
> 46 purchase tests pass; full suite 276/276; npm test exits 0; backend typecheck 0 errors; mobile typecheck 0 errors.

> **Phase 05.07 Sale VERIFIED (2026-08-20):** Sale + StockMovement models, sale service/controller/routes/schemas mounted at `/api/v1/sales`
> (`POST /`, `GET /`, `GET /:id`, `POST /:id/finalize`). DRAFT sales carry server-computed totals with no stock or financial effect; finalization is a
> single `withTransaction` covering atomic invoice numbering (BusinessCounter — never `countDocuments()+1`), guarded stock decrement, StockMovement,
> customer due, account credit, Sale completion, balanced journal and audit. Totals/tax/costPrice are recomputed server-side and the `.strict()` Zod
> schema rejects any client attempt to send them. Journal: DEBIT cash/bank + Customer Receivable / CREDIT Sales Revenue + Tax Payable, debit total ===
> credit total. `allowNegativeStock` honoured both ways; walk-in sales supported (a walk-in due is rejected); overpayment rejected. Idempotent on
> duplicate finalize and on repeated `localId`. Rollback proven with a two-line sale whose second line lacks stock. RBAC Owner/Admin/Manager/Salesperson
> at route + service level (Viewer 403, Accountant 403). Cross-tenant/cross-shop/foreign-product/foreign-customer all 404. List paginated with
> status/paymentStatus/customer/date filters.
> Invoice format is `INV-<fiscalYear>-<branchCode>-<sequence>` — the per-shop counter would otherwise collide on the business-wide unique index.
> Known gaps: no COGS/Inventory journal leg (Phase 07), creditLimit not enforced, void is 05.09, no mobile screens.
> 37 sale tests pass; full suite 230/230; npm test exits 0; backend typecheck 0 errors; mobile typecheck 0 errors.

> **Phase 05.06 Expense VERIFIED (2026-08-20):** Expense model/service/controller/routes/schemas mounted at `/api/v1/expenses`.
> Categories reuse the existing `EXPENSE_CATEGORIES` config (no second enum). Journal is DEBIT `Expense:<category>` (EXPENSE) / CREDIT the
> canonical asset account for the payment account type (`journalAssetAccountFor`), debit total === credit total asserted.
> Owner/Admin/Manager/Accountant may record; Salesperson/Viewer 403 (route `requireRole` + service `assertCanRecord`).
> Zod schema is `.strict()` — unknown fields (e.g. `createdBy`) are rejected; zero/negative/non-integer/unsafe amounts, bad category,
> malformed date and malformed receiptUrl all 400. Cross-tenant, cross-shop, foreign-business account and foreign-shop account all 404.
> Insufficient balance rejected 400 via the existing `decrementBalance` guard. Fault-injected mid-transaction failure rolls back the
> account balance, Expense, JournalEntry, JournalLine and AuditLog. Listing is business+shop scoped and paginated.
> 29 expense tests pass; full suite 193/193; npm test exits 0; backend typecheck 0 errors; mobile typecheck 0 errors.

> **Phase 05.05 Payment Engine VERIFIED (2026-08-20):** Payment model/service/controller/routes/schemas mounted.
> Owner/Admin/Manager/Accountant may record; Salesperson/Viewer 403 (route + service-level RBAC).
> customer_payment requires customerId / supplier_payment requires supplierId; invalid combinations 400.
> idempotencyKey dedupes sequential + concurrent calls. Failed payment rolls back Payment + journal + due/payable + account + audit atomically.
> Cross-tenant/cross-shop 404. 25 payment tests pass; full suite 164/164; npm test terminates normally; typecheck 0 errors.

### Database

- [x] Create Sale model (embedded items, totals, paymentStatus)
- [x] Create SaleItem embedded schema
- [x] Create Purchase model (embedded items, totals, paymentStatus)
- [x] Create PurchaseItem embedded schema
- [x] Create Payment model (type, amount, method, account, reference, idempotencyKey)
- [x] Create Expense model (category, amount, paymentAccount, note, receiptUrl)
- [x] Create Account model (name, type: cash/bank/bkash/nagad/rocket, balance)
- [ ] Add indexes: Sale.businessId+createdAt, Purchase.businessId+createdAt

### Backend

- [x] Create sale service (transaction: sale + stock + customer due + cash + journal)
- [x] Create sale controller
- [x] Create sale routes
- [x] Create purchase service (transaction: purchase + stock + supplier payable + cash + journal)
- [x] Create purchase controller
- [x] Create purchase routes
- [x] Create payment service
- [x] Create payment routes
- [x] Create expense service
- [x] Create expense routes
- [x] Create account service
- [x] Create account routes
- [ ] Create invoice serializer
- [x] Money as integer paisa (BigInt-safe)
- [x] Server-side total recalculation
- [x] Stock guard (atomic $inc + currentStock >= qty filter)
- [x] Idempotency (unique stock movement key per ref + product)
- [x] Average cost recalculation on purchase
- [x] Sale: UNPAID/PARTIAL/PAID status

### API

- [x] `POST/GET /api/v1/sales`
- [x] `POST /api/v1/sales/:id/finalize`
- [x] `POST /api/v1/sales/:id/void`
- [x] `GET /api/v1/sales/:id`
- [x] `POST/GET /api/v1/purchases`
- [x] `POST /api/v1/purchases/:id/finalize`
- [x] `POST /api/v1/purchases/:id/void`
- [x] `GET /api/v1/purchases/:id`
- [x] `POST/GET /api/v1/payments`
- [x] `POST/GET /api/v1/expenses`
- [x] `GET/POST /api/v1/accounts`
- [ ] `GET /api/v1/invoices/sales`
- [ ] `GET /api/v1/invoices/purchases`

### Mobile

- [ ] Sales list screen
- [ ] New sale screen (search → cart → customer → payment → finalize)
- [ ] Sale detail screen (invoice preview + payments + cancel)
- [ ] Purchase list screen
- [ ] New purchase screen
- [ ] Purchase detail screen
- [ ] Payment selection (cash/bank/bKash/Nagad/Rocket/card)
- [ ] Customer payment screen
- [ ] Supplier payment screen
- [ ] Expense list + add
- [ ] Account list + add
- [ ] Invoice view + share

### Offline

- [ ] Design sync-ready sale/purchase schema (localId, syncStatus)

### Testing

- [x] Cash sale test
- [x] Credit sale test
- [x] Partial payment sale test
- [x] Insufficient stock rejection test
- [x] Duplicate finalize idempotency test
- [x] Purchase stock increase test
- [x] Purchase average cost test
- [x] Customer payment due reduction test
- [x] Supplier payment payable reduction test
- [x] Expense cash deduction test
- [x] Cross-business isolation test
- [x] Unauthorized rejection test

### Acceptance Criteria

- [x] Sale creates invoice + stock decrease + customer due + cash + journal
- [x] Purchase creates invoice + stock increase + supplier payable + cash + journal
- [x] Payment reduces due/payable + updates account
- [x] Expense reduces account
- [x] All calculations server-side
- [x] No partial writes (transactional)
- [x] Tests passing

---

## Phase 06 — Inventory, Returns & Transfers

> **Phase 06 VERIFIED (2026-08-23):** Recovered from an interrupted session first: `test/payment.test.ts` had been overwritten with leaked editor
> text and `test/inventory.test.ts` carried a stray diff-marker line — both repaired from HEAD/surgical edit before any Phase 06 work, restoring the
> 412-test Phase 05 baseline. Implemented on top of it: the immutable StockMovement ledger (signed qtyChange + prevStock/newStock + unitCost snapshot,
> unique per {business, refType, refId, product}); StockTransfer with a PENDING → IN_TRANSIT/RECEIVED/CANCELLED state machine writing TRANSFER_OUT on
> the source at creation and TRANSFER_IN at the destination on receive; ADJUSTMENT/DAMAGE corrections and OPENING stock via one guarded atomic `$inc`
> inside `withTransaction`; and full/partial SALE_RETURN / PURCHASE_RETURN flows that restore or remove stock, reverse the original journal
> proportionally (debit total === credit total), adjust customer due / supplier payable under guarded updates, refund the snapshotted payment account,
> write audit rows, and enforce cumulative returnedQty <= qty via an atomic `$expr` increment so concurrent returns can never over-return.
> Idempotency follows the 05.13 pattern end-to-end: new StockReturn documents carry localId behind a unique partial index with in-transaction
> pre-check and duplicate-key recovery, so retried or concurrent returns resolve to the ORIGINAL return (`duplicate:true`) with zero additional
> stock or financial effect; StockTransfer already did. Fixed en route: PUT /transfers/:id/status returned 201 instead of 200. RBAC enforced twice
> (route requireRole + service re-check): inventory Owner/Admin/Manager/Inventory Manager, returns Owner/Admin/Manager, transfers like inventory.
> `.strict()` Zod schemas reject spoofed server-owned fields (returnedAmount, float qty). Mobile gained an Inventory hub tab: stock list with
> low-stock filter, movements ledger, adjust/opening modals, sale/purchase returns (server owns every figure) and transfers — bn/en strings included;
> Sale/Purchase serializers now expose returnedQty for the UI. MongoDB connectivity re-verified explicitly (connect, insert/read/delete round-trip,
> admin ping, clean shutdown) against Atlas (`MONGODB_URI`, credentials only in gitignored `server/.env`; logs mask the URI).
> Mobile completion pass (2026-08-23): all four Phase 06 sections brought to the Products-screen conventions — page/limit load-more pagination on
> stock, movements, returns and transfers lists; average cost rendered from the server payload; movement rows resolve product names client-side
> (presentation-only join); transfer rows show reference id + created date. bn/en strings for all additions. Known gaps: no /returns register endpoint,
> no avgCost reversal on purchase returns, mobile runtime verification pending.

### Database

- [x] Create StockMovement model (type, qtyChange, prevStock/newStock snapshots, refType/refId)
- [x] Create StockTransfer model (source, dest, product, qty, status state machine)
- [x] Create StockReturn model (return record + localId idempotency anchor)
- [x] Add indexes: StockMovement.businessId+productId+createdAt (+shopId variant)
- [x] Unique index: { businessId, refType, refId, productId }; unique partial { businessId, localId } on transfers & returns

### Backend

- [x] Create inventory service (atomic stock engine)
- [x] Create inventory controller
- [x] Create inventory routes
- [x] Sales return service
- [x] Purchase return service
- [x] Stock transfer service
- [x] Stock adjustment service
- [x] Low-stock detection service

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

- [x] Inventory screen (stock list + low stock, avg cost, load-more pagination)
- [x] Stock movements screen (product name, signed qty, prev→new, ref, date, pagination)
- [x] Adjust stock modal
- [x] Opening stock modal
- [x] Sales return screen (server `returnedQty` bounds the input; pagination)
- [x] Purchase return screen
- [x] Stock transfer screen (source → dest → product → qty, receive/cancel actions, ref + created date, pagination)
- [x] Wired as 6th "Inventory" tab in Home (`mobile/screens/InventoryHub.tsx`, `Home.tsx`)
- [x] bn/en i18n strings for all Phase 06 features (`avgCost` added 2026-08-23)

### Testing

- [x] Adjustment test (+/-, prev/new snapshots)
- [x] Damaged stock test
- [x] Low-stock detection test
- [x] Sales/purchase return stock tests (increase/decrease)
- [x] Over-return + concurrent over-return guards
- [x] Transfer in/out movement records test
- [x] Return + transfer idempotency (retry, concurrent duplicate)
- [x] Atomic stock guard retained from Phase 05 suite
- [x] HTTP surface: auth 401, RBAC 403, strict schema 400, cross-tenant 404, pagination

### Acceptance Criteria

- [x] Stock movements tracked for all operations
- [x] Returns reverse stock + financials
- [x] Transfers between shops work
- [x] Adjustments work
- [x] Low-stock alerts work
- [x] Tests passing (444/444; npm test exits 0; backend typecheck 0 errors; mobile typecheck 0 errors)

---

## Phase 07 — Double-Entry Accounting Engine

> **Phase 07 VERIFIED (2026-08-23):** Recovery audit found the journal WRITE engine already shipped as Phase 05/06 dependencies (balanced journals
> asserted across the suite); the genuinely missing pieces were the sale COGS leg, spec-exact return contra accounts, all six accounting read APIs,
> cash transfers and the mobile report screens. Implemented: sale finalization now journals **Dr Cost of Goods Sold / Cr Inventory** from the
> authoritative `SaleItem.costPrice` snapshots (zero-cost sales omit the legs; voids mirror them automatically). Sale returns write a
> **Sales Returns** contra-revenue debit plus an EXACT per-line inventory restoration/COGS reversal (Σ returnedQty × costPrice — proven not to drift
> on multi-margin documents), with deterministic paisa reconciliation on every mirrored leg. Purchase returns keep releasing the Inventory asset so
> GL stock value never diverges from physical stock. New `POST /accounts/transfer` moves money between same-shop accounts inside one
> `withTransaction` (guarded decrement → increment → DestCash Dr/SourceCash Cr journal → audit), idempotent via a new unique partial
> `{businessId, referenceType, localId}` index on JournalEntry. Read layer: `/api/v1/accounting/{journal,ledger,trial-balance,profit-loss,
> balance-sheet,cash-flow}` — pure journal aggregations, tenant+shop scoped, Owner/Admin/Manager/Accountant RBAC at route and service level.
> Balance Sheet reports retained earnings as the balancing figure and surfaces unjournaled legacy opening cash as explicit
> `unreconciledOpeningEquity`. Trial balance hard-fails if debits ≠ credits. Mobile gained an Accounting overlay (Settings → Accounting) with P&L,
> Balance Sheet, Cash Flow, Trial Balance and General Ledger screens — every figure rendered from server payloads, bn/en strings included.
> Chart of accounts remains config-driven constants (`config/accounts.ts`) until the P2 chart-management feature (PRD §8.14 defers it).
> 21 new tests in `test/accounting.test.ts`; full suite 465/465; npm test exits 0; backend typecheck 0 errors; mobile typecheck 0 errors.

### Database

- [x] JournalEntry model (+ new localId column + unique partial `{businessId, referenceType, localId}` index)
- [x] JournalLine model (*existed*)
- [x] AccountChart → deliberate deviation: canonical chart lives in `config/accounts.ts` (extended with COGS/Sales Returns/Purchase Returns)
- [x] Indexes: businessId+date, referenceId (*existed*)

### Backend

- [x] Accounting read services (ledger, trial balance, P&L, balance sheet, cash flow) + existing write engine preserved
- [x] Sale COGS journaling (Dr COGS / Cr Inventory @ avgCost snapshot)
- [x] Sales-return contra journals with exact cost reversal + rounding reconciliation
- [x] Cash transfer service/controller/route (transactional, idempotent, rollback-proven)

### API

- [x] `GET /api/v1/accounting/journal`
- [x] `GET /api/v1/accounting/ledger`
- [x] `GET /api/v1/accounting/trial-balance`
- [x] `GET /api/v1/accounting/profit-loss`
- [x] `GET /api/v1/accounting/balance-sheet`
- [x] `GET /api/v1/accounting/cash-flow`
- [x] `POST /api/v1/accounts/transfer`

### Mobile

- [x] Accounting hub (Settings → Accounting): P&L, Balance Sheet, Cash Flow, Trial Balance, General Ledger screens
- [x] bn/en strings for all Phase 07 UI
- [ ] Mobile runtime verification (pending — no emulator/device available)

### Testing

- [x] 21 accounting tests: COGS legs, zero-cost omission, contra returns (exact multi-line cost), purchase-return inventory release, transfer happy-path/rollback/RBAC/cross-tenant/validation/idempotency/concurrency, trial balance, P&L (hand-computed isolated shop + contra flow), balance sheet (blended avgCost hand-computed), cash flow (operating vs transfers), ledger running balance, journal pagination/filters, reports RBAC + foreign-tenant 404

### Acceptance Criteria

- [x] Every transaction auto-creates balanced journal entry
- [x] GL, Trial Balance, P&L, Balance Sheet, Cash Flow all correct
- [x] No manual journal entry needed for normal operations
- [x] Financial records voided/reversed, never physically deleted
- [x] Tests passing (465/465)

---

## Phase 07 — Double-Entry Accounting Engine (original checklist superseded above)

> All items in the original checklist below are covered by the VERIFIED section above.

---

## Phase 08 — Dashboard & Reports

### Backend

- [ ] Create dashboard service
- [ ] Create report service
- [ ] Sales report (daily/monthly, product-wise, customer-wise)
- [ ] Purchase report (date-wise, supplier-wise, product-wise)
- [ ] Inventory report (current stock, valuation, low stock)
- [ ] Financial report (P&L summary, receivables, payables, expenses)

### API

- [ ] `GET /api/v1/dashboard`
- [ ] `GET /api/v1/reports/sales`
- [ ] `GET /api/v1/reports/purchases`
- [ ] `GET /api/v1/reports/inventory`
- [ ] `GET /api/v1/reports/profit-loss`
- [ ] `GET /api/v1/reports/receivables`
- [ ] `GET /api/v1/reports/payables`
- [ ] `GET /api/v1/reports/expenses`

### Mobile

- [ ] Dashboard screen (today's sales/purchases/expenses/profit, stock value, receivables/payables, cash, low stock)
- [ ] Sales report screen
- [ ] Purchase report screen
- [ ] Inventory report screen
- [ ] Financial report screen
- [ ] Quick actions (+Sale +Purchase +Payment +Expense +Transfer)
- [ ] Global search

### Testing

- [ ] Dashboard aggregation tests
- [ ] Sales report tests
- [ ] Inventory report tests
- [ ] Receivables/payables tests

### Acceptance Criteria

- [ ] Dashboard shows all key metrics
- [ ] Reports generate correctly
- [ ] Quick actions work
- [ ] Tests passing

---

## Phase 09 — Employees, Roles & Devices

### Database

- [ ] Create Employee model
- [ ] Create Role/Permission model
- [ ] Update Device model with shop/branch
- [ ] Add audit log coverage fields

### Backend

- [ ] Employee service (CRUD)
- [ ] Role/permission service
- [ ] Device service (register, revoke, lastSync)
- [ ] Audit service (log all sensitive actions)
- [ ] RBAC enforcement on all routes
- [ ] Shop-level permission enforcement

### API

- [ ] `GET/POST/PUT/DELETE /api/v1/employees`
- [ ] `GET/POST /api/v1/roles`
- [ ] `GET/POST /api/v1/devices`
- [ ] `PUT /api/v1/devices/:id/revoke`
- [ ] `GET /api/v1/audit`

### Mobile

- [ ] Employee list screen
- [ ] Add/edit employee
- [ ] Role assignment
- [ ] Device list screen
- [ ] Revoke device
- [ ] Audit log screen
- [ ] Sync status per device

### Testing

- [ ] Employee CRUD tests
- [ ] Role permission tests
- [ ] Device revoke test
- [ ] Audit log coverage tests
- [ ] RBAC enforcement tests

### Acceptance Criteria

- [ ] Employees can be added with roles
- [ ] Permissions enforced
- [ ] Devices registered and revocable
- [ ] Audit log covers all sensitive actions
- [ ] Tests passing

---

## Phase 10 — Offline SQLite & Sync Engine

### Database

- [ ] Set up expo-sqlite
- [ ] Create local schema (all core tables)
- [ ] Add local migrations
- [ ] Create sync_queue table
- [ ] Create sync_metadata table

### Offline

- [ ] Offline products (local copy)
- [ ] Offline customers
- [ ] Offline suppliers
- [ ] Offline sales (create offline)
- [ ] Offline purchases (create offline)
- [ ] Offline payments
- [ ] Offline expenses
- [ ] Offline inventory movements
- [ ] local_id generation (client UUID)
- [ ] Sync status tracking (PENDING/SYNCING/SYNCED/FAILED/CONFLICT)

### Backend Sync

- [ ] `POST /api/v1/sync/push` (idempotent by local_id + device_id)
- [ ] `POST /api/v1/sync/pull` (delta since cursor)
- [ ] Server-side duplicate prevention
- [ ] Conflict detection and logging

### Mobile Sync

- [ ] Sync queue manager
- [ ] Retry with backoff
- [ ] Connectivity change listener
- [ ] Sync on app foreground
- [ ] Sync status UI
- [ ] Conflict resolution UI (notify user)

### Testing

- [ ] Offline create sale test
- [ ] Offline create purchase test
- [ ] Sync push idempotency test
- [ ] Sync pull delta test
- [ ] Retry test
- [ ] Conflict detection test
- [ ] Duplicate prevention test
- [ ] Sync status transition test

### Acceptance Criteria

- [ ] App fully functional offline
- [ ] All offline ops queued and synced
- [ ] No duplicate records after sync
- [ ] Retry works with backoff
- [ ] Conflicts detected and logged
- [ ] Sync success rate ≥ 99.5% in tests
- [ ] Tests passing

---

## Phase 11 — Backup & Restore

### Backend

- [ ] Backup strategy (MongoDB Atlas as backup source)
- [ ] Restore API
- [ ] Data export endpoint

### Mobile

- [ ] Restore on login to new device
- [ ] Backup status indicator
- [ ] Data export screen

### Testing

- [ ] Backup test
- [ ] Restore test
- [ ] Export test

### Acceptance Criteria

- [ ] New device restore works
- [ ] Data export works
- [ ] Tests passing

---

## Phase 12 — Enhancements

### Mobile

- [ ] Barcode scanning (expo-camera + ML Kit)
- [ ] FCM push notifications
- [ ] In-app notifications (low stock, due, sync failure)
- [ ] CSV/Excel export
- [ ] PDF/print invoices
- [ ] Product variants (S/M/L, sizes)
- [ ] Chart of accounts UI
- [ ] Custom expense categories

### Testing

- [ ] Barcode scanner tests
- [ ] Notification tests
- [ ] Export tests

### Acceptance Criteria
- [ ] All enhancements verified
- [ ] Tests passing

---

## Phase 13 — Testing, CI/CD & Deployment

### Testing

- [ ] API test suite (all endpoints)
- [ ] Integration test suite
- [ ] Unit test suite
- [ ] Database test suite
- [ ] Mobile UI tests (where appropriate)
- [ ] Offline tests
- [ ] Sync tests
- [ ] Security tests
- [ ] Performance tests

### CI/CD

- [ ] GitHub Actions (or equivalent): npm ci, typecheck, lint, test, npm audit
- [ ] Dependabot/Snyk monitoring
- [ ] Staging environment
- [ ] Production environment

### Deployment

- [ ] MongoDB Atlas cluster config
- [ ] Server deployment (Render/Railway/Vercel)
- [ ] Android APK build (EAS)
- [ ] Google Play Store setup
- [ ] HTTPS enforcement

### Acceptance Criteria

- [ ] All tests passing in CI
- [ ] `npm audit` clean (zero high/critical)
- [ ] Deployed to staging
- [ ] Deployed to production
- [ ] Android APK builds

---

## Phase 14 — Production Hardening & Monitoring

### Monitoring

- [ ] Sentry error tracking
- [ ] Winston structured logging (no secrets/PII)
- [ ] API latency monitoring (p95 < 500ms)
- [ ] Sync success rate monitoring
- [ ] Crash reporting

### Performance

- [ ] Product search with 5,000+ products
- [ ] Low-end device optimization (2-3GB RAM)
- [ ] Low mobile-data usage (delta sync, compressed payloads)
- [ ] Battery optimization (no aggressive polling)

### Security

- [ ] Full security audit
- [ ] Penetration testing
- [ ] Data encryption review
- [ ] Compliance review

### Acceptance Criteria

- [ ] Monitoring active in production
- [ ] Performance targets met
- [ ] Security audit passed

---

## Phase 15 — Future

- [ ] AI Business Assistant (Bangla)
- [ ] Due reminders (WhatsApp/SMS with authorization)
- [ ] Google Sheets integration
- [ ] Accounting period locking (fiscal year close)
- [ ] Payroll (salary, attendance, commission)
- [ ] SaaS subscriptions + billing
- [ ] FIFO/batch costing
- [ ] iOS app
- [ ] Barcode label printing
- [ ] Service business jobs module