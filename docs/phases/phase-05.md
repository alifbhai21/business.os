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

- [x] Create Sale model (businessId, shopId, invoiceNo, customerId, items[], totals, payments[], status, createdBy)
- [ ] Create Purchase model (businessId, shopId, invoiceNo, supplierId, items[], totals, payments[], status, createdBy)
- [x] Create Payment model (businessId, shopId, type, customerId/supplierId, saleId/purchaseId, amount, method, account, note, idempotencyKey)
- [x] Create Expense model (businessId, shopId, category, amount, paymentAccount, note, receiptUrl)
- [x] Create Account model (businessId, shopId, name, type: cash/bank/bkash/nagad/rocket/card/other, accountNumber, currentBalance)
- [ ] Add indexes: Sale.businessId+createdAt, Purchase.businessId+createdAt, Payment.businessId+createdAt

### Backend

- [ ] Create money utility (string → integer paisa, BigInt-safe) — reference ZIP A currency.ts
- [x] Create sale service (MongoDB transaction: sale + stock decrement + customer due + account + journal + audit)
- [x] Create sale controller
- [x] Create sale routes
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
- [x] Stock guard: atomic `$inc` with a `currentStock: {$gte: qty}` filter guard (reject insufficient stock)
- [x] Negative stock rejected unless `Business.allowNegativeStock`
- [x] Idempotency: unique stock-movement key { businessId, refType, refId, productId } — duplicate finalize fails
- [x] Server-side total recalculation (never trust client totals)
- [ ] Average cost recalculation on purchase
- [x] Payment status derived: UNPAID/PARTIAL/PAID
- [ ] Zod validation on all routes

### API

- [x] `POST/GET /api/v1/sales`
- [x] `POST /api/v1/sales/:id/finalize`
- [ ] `POST /api/v1/sales/:id/cancel` (void — never delete)
- [x] `GET /api/v1/sales/:id`
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

- [x] Cash sale test (stock decreases, revenue recorded, cash increases, journal balanced)
- [x] Credit sale test (customer due increases)
- [x] Partial payment sale test (UNPAID/PARTIAL/PAID statuses)
- [x] Insufficient stock rejection test
- [x] Negative stock blocked (allowNegativeStock=false) test
- [x] Duplicate finalize idempotency test (no double stock movement)
- [ ] Purchase stock increase test
- [ ] Purchase average cost recalculation test
- [ ] Customer payment due reduction test
- [ ] Supplier payment payable reduction test
- [x] Expense cash deduction test
- [ ] Cancel/void sale test (reverses)
- [x] Cross-business isolation test
- [x] Unauthorized rejection test
- [x] Zod validation tests

## Acceptance Criteria

- [x] Sale creates invoice + stock decrease + customer due (if credit) + account update + journal
- [ ] Purchase creates invoice + stock increase + supplier payable (if credit) + account update + journal
- [ ] Payment reduces due/payable + updates account
- [x] Expense reduces account
- [x] All calculations server-side (integer paisa)
- [x] No partial writes (MongoDB transaction, atomic)
- [x] Insufficient stock rejected
- [x] Duplicate finalize rejected (idempotent)
- [x] Tests passing

## Testing
Run: `cd server && npm run typecheck && npm test`

## Expected Output
- Core transaction engine fully working
- Mobile sales/purchase/payment/expense/account screens
- Invoices generated and shareable

## Status
- [ ] Not started
- [x] In progress (05.01–05.07 VERIFIED; 05.08+ pending)
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
| 05.07 Sale | [x] VERIFIED | Sale + StockMovement models, sale.service/controller/routes/schemas mounted under /api/v1/sales (POST /, GET /, GET /:id, POST /:id/finalize). DRAFT sales carry server-computed totals with zero stock/financial effect; finalization is one withTransaction covering invoice-number allocation (atomic BusinessCounter, never countDocuments()+1), guarded stock decrement, StockMovement, customer due, account credit, Sale completion, balanced JournalEntry/JournalLine and AuditLog. Totals are recomputed server-side from the Product record; the Zod schema is .strict() so a client sending total/taxAmount/costPrice gets a 400. Tax is per-line from product.taxRate rounded per line; discounts support per-line amounts plus a header amount OR percent. Journal: DEBIT cash/bank (paid) + Customer Receivable (due) / CREDIT Sales Revenue (net of discount) + Tax Payable (new LIABILITY account concept); debit total === credit total asserted. Stock guard is an atomic $inc with a currentStock >= qty filter, bypassed only when Business.allowNegativeStock is true (verified going to -4). Walk-in sales (customerId null) are supported and a walk-in with a due is rejected. Overpayment rejected. Idempotency on two axes: duplicate finalize returns the sale untouched, and a repeated localId returns the first sale (unique partial index + duplicate-key recovery). Rollback proven with a two-line sale whose second line lacks stock — the first line's decrement, its StockMovement, the Sale, the journal, the audit, the customer due and the account credit are all absent afterwards. RBAC Owner/Admin/Manager/Salesperson at route AND service level; Viewer 403, Accountant 403. Cross-tenant 404, cross-shop 404, foreign-business product 404, foreign-business customer 404, inactive product 400. List is business+shop scoped with pagination plus status/paymentStatus/customerId/date-range filters. Invoice numbers are scoped by branchCode (see file inventory, decision 1). 37 sale tests pass, full suite 230/230, npm test exits 0 and terminates normally, backend typecheck 0 errors, mobile typecheck 0 errors. |

Files added: server/test/account.test.ts, server/test/counter.test.ts, server/test/money.test.ts, server/test/journal.test.ts
Files created (05.04): server/src/models/JournalEntry.ts, server/src/models/JournalLine.ts, server/src/services/journal.service.ts
File modified: server/src/routes/account.routes.ts (added assertShopAccess to GET /)

### 05.07 Sale — file inventory (verified 2026-08-20)

Created:
- server/src/models/Sale.ts (embedded SaleItem, DRAFT/COMPLETED/VOIDED, UNPAID/PARTIAL/PAID)
- server/src/models/StockMovement.ts (full 8-type enum for Phase 06; Sale writes `sale`)
- server/src/utils/invoice.ts (`fiscalYearStartMonth`, `fiscalYearOf`, `formatDocumentNo`)
- server/src/validation/sale.schemas.ts
- server/src/services/sale.service.ts
- server/src/controllers/sale.controller.ts
- server/src/routes/sale.routes.ts
- server/test/sale.test.ts (37 tests)

Modified:
- server/src/config/accounts.ts — added `TAX_PAYABLE: "Tax Payable"` (LIABILITY) to
  JOURNAL_ACCOUNTS/JOURNAL_ACCOUNT_TYPES so collected tax is journalized as a liability
  instead of being folded into revenue.
- server/src/app.ts — mounted `/api/v1/sales`
- server/test/helpers/db.ts — bounded port re-draw around `MongoMemoryReplSet.create` (see
  "Test infrastructure note" below). No assertions changed.

Design decisions worth reviewing:
1. **Invoice number format is `INV-<fiscalYear>-<branchCode>-<sequence>`**, not the illustrative
   `INV-2026-0001`. The BusinessCounter (05.03, unchanged) is keyed by (business, shop, key), so two
   shops in one business both reach sequence 1 — which violates the required unique
   {businessId, invoiceNo} index. The shop's branchCode (already unique per business) scopes the
   number. A caught duplicate-key failure during implementation proved this was necessary.
   Consequence: the sequence does not reset per fiscal year (the counter key stays "SALE").
2. **The paid-at-sale amount is journalized inside the sale entry; no Payment document is created.**
   `recordPayment` (05.05) requires a customerId, so routing walk-in cash sales through it is
   impossible. Payment records remain the mechanism for settling outstanding due after the sale
   (`Payment.saleId`). Customer.currentDue is therefore incremented by `dueAmount` only.
3. **The header discount does not retroactively reduce per-line tax.** Tax is computed per line on
   (line subtotal − line discount) and rounded per line, per the money.ts policy; a header discount
   behaves as a settlement discount applied after tax.

Known limitations (deliberately out of 05.07 scope):
- No COGS/Inventory journal leg. `costPrice` is snapshotted per line, so Phase 07 can derive profit,
  but the ledger's Inventory asset is not yet relieved on sale. JOURNAL_ACCOUNTS has no
  "Cost of Goods Sold" concept and inventing one was avoided.
- `Customer.creditLimit` is not enforced on credit sales.
- Duplicate productIds in one sale are rejected rather than merged (keeps the
  {businessId, refType, refId, productId} stock-movement idempotency key meaningful).
- Void/reversal is 05.09: the model supports VOIDED and finalize refuses it, but no void route exists.
- No mobile screens (05.12).

Test infrastructure note: the first baseline run of this session failed in `repro-hang.test.ts` with
`listen EACCES 0.0.0.0:49932`. Root cause is environmental, not a regression — Windows reserves TCP
49671-49970 / 50000-50059 / 61455-61554 / 62462-62561 / 64494-64593 on this machine
(`netsh interface ipv4 show excludedportrange protocol=tcp`), and mongodb-memory-server retries only
EADDRINUSE, not EACCES, so any port drawn inside a reserved range aborts the file. `connectTestDb`
now re-draws the port up to 6 times.

Verification: backend `npm run typecheck` 0 errors · `npm test` 230/230 pass, exit 0, terminates
normally · mobile `npx tsc --noEmit` 0 errors.

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
