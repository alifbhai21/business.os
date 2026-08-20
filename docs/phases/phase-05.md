# Phase 05 — Sales, Purchases & Payments

## Objective
Implement the core transaction engine: sales with full automation, purchases with full automation, payments, expenses, accounts, and invoice generation.

## Why This Phase Exists
This is the heart of the PRD — "enter a transaction once, everything updates automatically." Sale/purchase must atomically update stock, customer/supplier dues, cash/accounts, journal entries, and profit.

## Dependencies
- Phase 04 — Products, Customers & Suppliers

## Existing Implementation Status
- ZIP A: sales/purchases/payments/expenses/accounts API with journal entries but no validation → **REFERENCE**
- ZIP B: sales/purchases API with Zod validation + average cost but no journal → **REFERENCE**
- Mobile: → **NOT_IMPLEMENTED** (no sales/purchase screens)
- Server: → **NOT_IMPLEMENTED**

## Tasks

### Database

- [ ] Create Sale model (businessId, shopId, invoiceNo, customerId, items[], totals, payments[], status, createdBy)
- [ ] Create Purchase model (businessId, shopId, invoiceNo, supplierId, items[], totals, payments[], status, createdBy)
- [x] Create Payment model (businessId, shopId, type, customerId/supplierId, saleId/purchaseId, amount, method, account, note, idempotencyKey)
- [x] Create Expense model (businessId, shopId, category, amount, paymentAccount, note, receiptUrl)
- [x] Create Account model (businessId, shopId, name, type: cash/bank/bkash/nagad/rocket/card/other, accountNumber, currentBalance)
- [ ] Add indexes: Sale.businessId+createdAt, Purchase.businessId+createdAt, Payment.businessId+createdAt

### Backend

- [ ] Create money utility (string → integer paisa, BigInt-safe) — reference ZIP A currency.ts
- [ ] Create sale service (MongoDB transaction: sale + stock decrement + customer due + account + journal + audit)
- [ ] Create sale controller
- [ ] Create sale routes
- [ ] Create purchase service (MongoDB transaction: purchase + stock increment + avgCost recalc + supplier payable + account + journal + audit)
- [ ] Create purchase controller
- [ ] Create purchase routes
- [x] Create payment service (customer payment: reduce due + increase account; supplier payment: reduce payable + decrease account)
- [x] Create payment controller
- [x] Create payment routes
- [x] Create expense service (deduct account)
- [x] Create expense controller
- [x] Create expense routes
- [x] Create account service
- [x] Create account routes
- [ ] Create invoice serializer (unified for sale/purchase)
- [ ] Stock guard: atomic `$inc` with `$expr` check `stock >= qty` (reject insufficient stock)
- [ ] Negative stock rejected unless `Business.allowNegativeStock`
- [ ] Idempotency: unique stock-movement key { businessId, refType, refId } — duplicate finalize fails
- [ ] Server-side total recalculation (never trust client totals)
- [ ] Average cost recalculation on purchase
- [ ] Payment status derived: UNPAID/PARTIAL/PAID
- [ ] Zod validation on all routes

### API

- [ ] `POST/GET /api/v1/sales`
- [ ] `POST /api/v1/sales/:id/finalize`
- [ ] `POST /api/v1/sales/:id/cancel` (void — never delete)
- [ ] `GET /api/v1/sales/:id`
- [ ] `POST /api/v1/sales/:id/payments`, `GET /api/v1/sales/:id/payments`
- [ ] `POST/GET /api/v1/purchases`
- [ ] `POST /api/v1/purchases/:id/finalize`
- [ ] `POST /api/v1/purchases/:id/cancel` (void)
- [ ] `GET /api/v1/purchases/:id`
- [ ] `POST /api/v1/purchases/:id/payments`, `GET /api/v1/purchases/:id/payments`
- [x] `POST/GET /api/v1/payments`
- [x] `POST/GET /api/v1/expenses`
- [x] `GET/POST /api/v1/accounts`
- [ ] `GET /api/v1/invoices/sales`, `GET /api/v1/invoices/purchases`, `GET /api/v1/invoices/:type/:id`

### Mobile

- [ ] Sales list screen
- [ ] New sale screen (search → cart → customer → payment → finalize)
- [ ] Sale detail screen (invoice preview + payments + cancel)
- [ ] Purchase list screen
- [ ] New purchase screen
- [ ] Purchase detail screen
- [ ] Payment method selector (Cash/Bank/bKash/Nagad/Rocket/Card)
- [ ] Customer payment screen
- [ ] Supplier payment screen
- [ ] Expense list + add screen
- [ ] Account list + add screen
- [ ] Invoice view + share (image/text)
- [ ] All i18n strings in bn/en

### Offline

- [ ] Design sync-ready sale/purchase schema (localId, syncStatus, deviceId)

### Testing

- [ ] Cash sale test (stock decreases, revenue recorded, cash increases, journal balanced)
- [ ] Credit sale test (customer due increases)
- [ ] Partial payment sale test (UNPAID/PARTIAL/PAID statuses)
- [ ] Insufficient stock rejection test
- [ ] Negative stock blocked (allowNegativeStock=false) test
- [ ] Duplicate finalize idempotency test (no double stock movement)
- [ ] Purchase stock increase test
- [ ] Purchase average cost recalculation test
- [ ] Customer payment due reduction test
- [ ] Supplier payment payable reduction test
- [x] Expense cash deduction test
- [ ] Cancel/void sale test (reverses)
- [ ] Cross-business isolation test
- [ ] Unauthorized rejection test
- [ ] Zod validation tests

## Acceptance Criteria

- [ ] Sale creates invoice + stock decrease + customer due (if credit) + account update + journal
- [ ] Purchase creates invoice + stock increase + supplier payable (if credit) + account update + journal
- [ ] Payment reduces due/payable + updates account
- [x] Expense reduces account
- [ ] All calculations server-side (integer paisa)
- [ ] No partial writes (MongoDB transaction, atomic)
- [ ] Insufficient stock rejected
- [ ] Duplicate finalize rejected (idempotent)
- [ ] Tests passing

## Testing
Run: `cd server && npm run typecheck && npm test`

## Expected Output
- Core transaction engine fully working
- Mobile sales/purchase/payment/expense/account screens
- Invoices generated and shareable

## Status
- [ ] Not started
- [x] In progress (05.01–05.06 VERIFIED; 05.07+ pending)
- [ ] Incomplete — Phase completed when all acceptance criteria pass
---

## Phase 05 Recovery Status (verified 2026-08-19)

Recovered after an interrupted implementation. Baseline re-verified: backend typecheck 0 errors, backend tests 123/123, mobile typecheck 0 errors.

| Task | Status | Evidence |
|---|---|---|
| 05.01 Security + Test Infrastructure | [x] VERIFIED | db/transactions.ts (replica-set aware), test/helpers/db.ts uses MongoMemoryReplSet, tenant middleware assertShopAccess enforces Shop.businessId === businessId (404) |
| 05.02 Money + Financial Config | [x] VERIFIED | utils/money.ts, config/accounts.ts, 11 money tests pass (paisa conversions, rounding, tax, discount, total, due) |
| 05.03 Account + Counter Foundation | [x] VERIFIED | Account model (unique businessId+shopId+name, currentBalance paisa), BusinessCounter atomic findOneAndUpdate+, account.service (client cannot set currentBalance,  balance guard), account routes + controller, 14 account tests + 5 counter concurrency tests pass. SECURITY FIX: account list route now requires assertShopAccess (was missing -> cross-tenant shop pairing returned 200; now 404). |
| 05.04 Journal Engine | [x] VERIFIED | JournalEntry + JournalLine models, journal.service (balanced-sum validation, transaction-safe write, symmetric reversal that never deletes the original), 16 journal tests pass (balanced accepted, unbalanced/zero/negative/both-sides rejected, multi-line, rollback, reversal, cross-tenant/cross-shop isolation) |
| 05.05 Payment Engine | [x] VERIFIED | Payment model/service/controller/routes/schemas mounted under /api/v1/payments. Owner/Admin/Manager/Accountant can record; Salesperson/Viewer 403 (route-level requireRole + service-level assertCanRecord). customer_payment requires customerId, supplier_payment requires supplierId, invalid combinations 400 (Zod superRefine + validateBody with actionable message). IdempotencyKey dedupes sequential + concurrent calls. True MongoDB transaction semantics: failed payment (bad account id) rolls back Payment + JournalEntry + JournalLine + customer due + account balance + audit atomically. Cross-tenant 404, cross-shop 404. validateBody now propagates the first field error into the HTTP message so API clients see the actionable reason. Fixed test typo (account vs accountId) that masked the Salesperson 403 assertion; refactored rollback test to exercise recordPayment's own transaction instead of a flawed nested withTransaction+dynamic-import structure that leaked a session (root cause of the npm test hang). 25 payment tests pass, full suite 164/164 pass, npm test terminates normally, typecheck 0 errors. |
| 05.06 Expense | [x] VERIFIED | Expense model/service/controller/routes/schemas mounted under /api/v1/expenses. Categories reuse the existing EXPENSE_CATEGORIES config — no second enum. Transactional createExpense: account lookup scoped to businessId+shopId → decrementBalance (existing never-negative guard) → Expense.create → balanced writeJournal (referenceType EXPENSE) → AuditLog EXPENSE_CREATED, all inside withTransaction. Journal is DEBIT expenseAccountName(category) with accountType EXPENSE / CREDIT journalAssetAccountFor(account.type); debit total === credit total asserted for both CASH and BANK payment accounts. RBAC at both layers: route requireRole(Owner, Admin, Manager, Accountant) and service assertCanRecord — Salesperson/Viewer 403 over HTTP, Viewer also rejected on a direct service call. Zod schema is .strict(): unknown fields (createdBy) rejected; zero, negative, 1500.75 and 1e16 amounts rejected; bad category, malformed ISO date and malformed receiptUrl rejected. Isolation: cross-tenant 404, cross-shop 404, foreign-business account 404, foreign-shop account 404 — and the foreign account balance is verified untouched. Insufficient balance 400 with zero side effects. Rollback proven by fault injection (note exceeding the model's 500-char limit fails Expense.create AFTER the balance decrement): balance restored, no Expense, no JournalEntry, no AuditLog. Listing business+shop scoped and paginated (page/limit/total/totalPages). 29 expense tests pass, full suite 193/193, npm test exits 0 and terminates normally, backend typecheck 0 errors, mobile typecheck 0 errors. |

Files added: server/test/account.test.ts, server/test/counter.test.ts, server/test/money.test.ts, server/test/journal.test.ts
Files created (05.04): server/src/models/JournalEntry.ts, server/src/models/JournalLine.ts, server/src/services/journal.service.ts
File modified: server/src/routes/account.routes.ts (added assertShopAccess to GET /)

### 05.06 Expense — file inventory (verified 2026-08-20)

Created:
- server/src/models/Expense.ts
- server/src/validation/expense.schemas.ts
- server/src/services/expense.service.ts
- server/src/controllers/expense.controller.ts
- server/src/routes/expense.routes.ts
- server/test/expense.test.ts (29 tests)

Modified:
- server/src/config/accounts.ts — added `journalAssetAccountFor(AccountType)`, the canonical
  physical-account-type → journal asset account mapping, so expenses journalize against the same
  chart of accounts as payments. (payment.service.ts keeps its own verified private copy of this
  switch; collapsing the two is a safe follow-up cleanup, deliberately not done here to avoid
  touching verified 05.05 code.)
- server/src/app.ts — mounted `/api/v1/expenses`

Verification: backend `npm run typecheck` 0 errors · `npm test` 193/193 pass, exit 0, terminates
normally · mobile `npx tsc --noEmit` 0 errors.
