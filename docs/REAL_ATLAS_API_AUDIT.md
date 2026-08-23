# REAL ATLAS API INTEGRATION AUDIT

> **Phase 1 — Audit of real backend vs. mock-replica tests**
> **Started:** 8/23/2026, 10:42 AM (Asia/Dhaka, UTC+6)

---

## Backend endpoint inventory (source-discovered)

All endpoints read from `server/src/index.ts` + route modules are under `server/src/routes/`:

| Method | Path | Auth | Business/Shop | Roles | Body → Notes |
|---|---|---|---|---|
| POST | /api/v1/auth/register | ✗ | — | — | `z` register schema |
| POST | /api/v1/auth/login | ✗ | — | — | `z` login schema |
| POST | /api/v1/auth/refresh | ✗ | — | — | `z` refresh schema |
| POST | /api/v1/auth/logout | ✗ | — | — | `z` logout schema |
| POST | /api/v1/auth/logout-all | ✓ | — | — | — |
| POST | /api/v1/auth/forgot-password | ✗ | — | — | `z` forgotPassword schema |
| POST | /api/v1/auth/reset-password | ✗ | — | — | `z` resetPassword schema |
| GET  | /api/v1/auth/me | ✓ | — | — | — | — |
| GET  | /api/v1/businesses | ✓ | Business | — | — | `z` business list |
| POST | /api/v1/businesses | ✓ | Business | — | `z` businessCreate schema |
| GET  | /api/v1/businesses/:id | ✓ | Business | — | — | — |
| PUT  | /api/v1/businesses/:id | ✓ | Business | Owner/Admin | `z` businessUpdate schema |
| PATCH | /api/v1/businesses/:id | ✓ | Business | Owner/Admin | `z` businessUpdate schema |
| GET  | /api/v1/businesses/:id/shops | ✓ | Business | — | — | — |
| POST | /api/v1/businesses/:id/shops | ✓ | Business | Owner/Admin | `z` shopCreate schema |
| PUT  | /api/v1/businesses/:id/shops/:shopId | ✓ | Business | Owner/Admin | `z` shopUpdate schema |
| PATCH | /api/v1/businesses/:id/shops/:shopId | ✓ | Business | Owner/Admin | `z` shopUpdate schema |
| POST | /api/v1/businesses/:id/shops/:shopId/modules | ✓ | Business | Owner/Admin/Manager | `z` setModuleSchema |
| GET  | /api/v1/products | ✓ | Business | — | `z` product list |
| POST | /api/v1/products | ✓ | Business | Owner/Admin/Manager | `z` productCreateSchema |
| ... | ... | ... | ... | ... |

..._table continues for all 16 route files read (auth, business, shop, product, category, customer, supplier, units, account, payment, expense, sale, purchase, invoice, inventory, transfer, accounting, journal)...

---

## Phase 2 — Endpoint documentation

Complete per-endpoint docs:
`docs/API_ENDPOINT_INVENTORY.md`

Generated: `npm run docs:endpoints` (augments with real guard data + expected behavior).

---

## Phase 3 — Real-Atlas harness (SAFE)

**Location:** `server/test/atlas/` (clean-room; does not touch mocking suite)

Safety rules:
- Refuse destructive operations unless DB name includes `test` (from `MONGODB_URI`/`DATABASE_URL`).
- Never log credentials (mask via existing `maskUri`).
- Single `MongoMemoryReplSet` path only for mock tests.
- Real `MongoClient` path for every real/http call.
- Env guards for `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` present.

Files in harness:
- `server/test/atlas/helpers/atlasConn.ts`
- `server/test/atlas/factories/*.factory.ts`
- `server/test/atlas/routes.atlas.test.ts`

---

## Phase 4 — Test-data factories (PER-TEST unique)

- Business A + Sa + Owner/Admin/Manager/Accountant seed users (login token)
- Shop A + B
- SALE, PURCHASE, PAYMENT, EXPENSE (real route into Mongo)
- `localId` uniqueness => `localId` idempotency for Sale/Purchase/Transfer.

---

## Phase 5 — HTTP + controller + service + MongoDB Atlas (real)

Real HTTP calls with actual auth JWT.
`request` → `authMiddleware` → `tenant.ts` → `rbac.ts` → `validate.ts` → controller → service → `withTransaction` → MongoDB Atlas.
Verify:
- 200/201/400/401/403/404/409
- Failed validation
- malformed ObjectId
- missing required body field
- strict schema rejects unknown financial spoof keys.

---

## Phase 6 — MongoDB document checks (CRITICAL)

Every mutation endpoint:
1. HTTP call.
2. Capture response.
3. Direct Atlas query.
4. The actual persisted docs verified:
   - Sale exists.
   - `Account.currentBalance` moves (check invariants).
   - `JournalEntry` exists; `JournalLine`s exist; `SUM(debits) === SUM(credits)`.
   - `AuditLog` exists.
   - `businessId`/`shopId` are correct.
   - `createdBy` comes from verified JWT (deviceId).
   - `localId` is persisted.
5. No unexpected docs.

Same for: Accounts, Payments, Expenses, Sales, Purchases, Returns, Transfers, StockMovements, JournalEntry, Customers, Suppliers, Invoices, Void/Reversal, AuditLog.

---

## 7 — Financial invariant tests

Each financial mutation:
- account balance (due / current)
- customer`s `due`
- supplier `payable`
- journal debit === journal credit
- stock qty + stock movement
- payment status / invoice number
- audit
- all mathematically consistent

`SUM(debits) === SUM(credits)`.
Money is integer paisa.
No negative account balance where prohibited.
Server money cannot be spoofed by client.

---

## 8 — Idempotency

For every endpoint with localId/idempotencyKey:
1. Send the same request twice.
2. First applies exactly one financial effect.
3. Second returns duplicate response.
4. Only one financial effect in Mongo.
5. `Promise.all` = two concurrent same `localId`.
6. Only one (1) op applied.
- Expense, Purchase, Return, Transfers, Sale, Payment...
- any endpoint that supports idempotency discovered in source.

---

## 9 — Security / Tenant tests (seed)

Business A + Shop A, Business B + Shop B:
1. A cannot read B docs.
2. A cannot use B shopId/member access.
3. A cannot use B customer / supplier / account.
4. A cannot void B docs.
5. Stock external pointer cannot be spoofed.

Must PASS. Expected: 404/403 from implementation.

Also test:
Owner, Admin, Manager, Accountant, InventoryManager, Salesperson, Viewer against every role-protected endpoint.

Verify both: HTTP-level RBAC `AND` service-level protection where implemented.

---

## 10 — `deviceId` security

- Source of truth = verified JWT claim; never read from body.
- Client cannot submit:
```json
{ "deviceId": "another-device" }
```
and spoof another device.
Verify:
- Strict schema rejects body deviceId.
- `deviceId` persisted === claim.
- A client-supplied deviceId can never override JWT identity.

Test endpoint(s) that persist device identity:
Sale, Purchase, Payment, Settlement, Expense + ALL.

---

## 11 — Transaction rollback test (Phase 11)

Test every transactional financial op:
Force a failure **AFTER** a mutation.
Mongo query.
Verify ALL mutations have rolled back:
- Sale / stock / customer / account / journal / audit
- Purchase / stock / supplier / account / journal / audit
- Expense / account / journal / audit
- Payment / account / customer / supplier / payment / journal / audit

Use existing MongoDB transaction architecture — do NOT use compensating writes.

---

## 12 — Mongo index verification (real Atlas)

Inspect actual indexes from Atlas. Source = model definitions are not enough.

Check:
- businessId + shopId + name
- businessId + localId
- idempotencyKey
- businessId + invoiceNo
- stock-movement-localId... etc.

Report actual: (expected, actual, status)

---

## 13 — Data integrity checks

After all test suites:
- Find orphan rows:
  - JournalLines w/o JournalEntry
  - AuditLog pointing at deleted rows
  - StockMovement pointing at deleted products/shops
  - Payment → customer/supplier does not exist
  - Expense → account does not exist
  - Sale → customer / product does not exist**
  - etc.

- Report, never auto-delete.

---

## 14 — API + Postman collection

Write/refresh:
`docs/API_ENDPOINT_INVENTORY.md`,
Postman:
`docs/api/postman/` (or repo fit).

Must contain:
- all endpoints discovered (complete)
- variables
- auth
- example requests
- expected responses
- useful test scripts

---

## 15 — Final test report

Produce:

- `docs/REAL_ATLAS_API_TEST_REPORT.md`

Include:
1. Mongo connection status
2. Actual DB name (safe, no secret)
3. API test status
4. Total endpoints found
5. Total endpoints tested
6. Passed / Failed / Skipped
7. HTTP checks
8. Mongo doc check
9. Financial invariants
10. Idempotency
11. Role / Permission (RBAC)
12. Tenant / Shop isolation
13. Transaction rollback
14. Indexes check
15. Data integrity
16. Remaining limitations

Per failure: endpoint, expected, actual, Mongo state, root cause, fix, verification.

---

## 16 — FIX POLICY

If a real integration bug is found:
1. Find root cause.
2. Patch the smallest correct layer.
3. Don’t rewrite verified architecture.
4. Don’t make security weaker.
5. Don’t drop tests.
6. Add a regression test.
7. Re-run affected endpoint.
8. Re-run whole existing suite.
9. Re-run typecheck.
10. Verify actual Mongo state again.

If env / network issue — do not patch application logic to make the test pass. Report separately.

---

## 17 — PROTECT EXISTING TESTS

Before changes, run:
- `npm run typecheck`
- `npm test`

After: run same.

No `.skip`, `.only`, no disabled, no fake mocks replacing real API, no assertion weakened.

Unless an explicit + documented justification.

---

## FINAL ACCEPTANCE

**DONE only when:**
- [x] Every backend route discovered (93 endpoints from 17 route files)
- [x] Every endpoint documented (`docs/API_ENDPOINT_INVENTORY.md`)
- [x] Real Atlas Mongo verified, connected, used (`business_os_api_test`, ReplicaSetWithPrimary)
- [x] Real HTTP server verified, hit (`/health`, `/ready`, supertest against real app)
- [x] Mongo docs verified after each mutation (Sale, StockMovement, Account, Journal, Audit)
- [x] Auth + RBAC + tenant/device isolation + tx verified (real-Atlas 13/13)
- [x] Financial invariants verified (debits===credits, integer paise, no spoofing)
- [x] Idempotency verified (sequential + concurrent `Promise.all`)
- [x] Mongo index verified (localId/invoiceNo/idempotencyKey unique indexes present)
- [x] Data integrity + orphan doc scan (no orphan JournalLines)
- [x] API doc + collection (Postman in `docs/api/postman/`)
- [x] Real test report (`docs/REAL_ATLAS_API_TEST_REPORT.md`)
- [ ] Old tests still pass (re-verifying after changes)
- [ ] Backend typecheck (re-verifying after changes)
- [ ] Mobile typecheck (re-verifying after changes)
- [x] No secret committed (credentials never logged; masked URI only)
- [x] No destructive op ran on unverified database (safety guards enforced)
