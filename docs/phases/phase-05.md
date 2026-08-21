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
- [x] Create Purchase model (businessId, shopId, invoiceNo, supplierId, items[], totals, payments[], status, createdBy)
- [x] Create Payment model (businessId, shopId, type, customerId/supplierId, saleId/purchaseId, amount, method, account, note, idempotencyKey)
- [x] Create Expense model (businessId, shopId, category, amount, paymentAccount, note, receiptUrl)
- [x] Create Account model (businessId, shopId, name, type: cash/bank/bkash/nagad/rocket/card/other, accountNumber, currentBalance)
- [ ] Add indexes: Sale.businessId+createdAt, Purchase.businessId+createdAt, Payment.businessId+createdAt

### Backend

- [ ] Create money utility (string → integer paisa, BigInt-safe) — reference ZIP A currency.ts
- [x] Create sale service (MongoDB transaction: sale + stock decrement + customer due + account + journal + audit)
- [x] Create sale controller
- [x] Create sale routes
- [x] Create purchase service (MongoDB transaction: purchase + stock increment + avgCost recalc + supplier payable + account + journal + audit)
- [x] Create purchase controller
- [x] Create purchase routes
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
- [x] Average cost recalculation on purchase
- [x] Payment status derived: UNPAID/PARTIAL/PAID
- [ ] Zod validation on all routes

### API

- [x] `POST/GET /api/v1/sales`
- [x] `POST /api/v1/sales/:id/finalize`
- [x] `POST /api/v1/sales/:id/void` (void — never delete)
- [x] `GET /api/v1/sales/:id`
- [ ] `POST /api/v1/sales/:id/payments`, `GET /api/v1/sales/:id/payments`
- [x] `POST/GET /api/v1/purchases`
- [x] `POST /api/v1/purchases/:id/finalize`
- [x] `POST /api/v1/purchases/:id/void` (void)
- [x] `GET /api/v1/purchases/:id`
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
- [x] Purchase stock increase test
- [x] Purchase average cost recalculation test
- [ ] Customer payment due reduction test
- [ ] Supplier payment payable reduction test
- [x] Expense cash deduction test
- [x] Cancel/void sale test (reverses)
- [x] Cross-business isolation test
- [x] Unauthorized rejection test
- [x] Zod validation tests

## Acceptance Criteria

- [x] Sale creates invoice + stock decrease + customer due (if credit) + account update + journal
- [x] Purchase creates invoice + stock increase + supplier payable (if credit) + account update + journal
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
- [x] In progress (05.01–05.13 VERIFIED; 412/412 tests)
- [ ] Incomplete — Phase completed when all acceptance criteria pass
---

### 05.12 Mobile screens — file inventory (verified 2026-08-21)

Recovery audit found NO pre-existing 05.12 mobile work: the mobile app had only the Phase 01–04
screens (Welcome/Login/Register/BusinessSetup/ShopSetup/Home/Dashboard/Products/Parties/Settings/
BusinessSwitcher/ShopSwitcher/BusinessSettings/ShopManagement). The Phase 05 transaction screens
were entirely missing.

Created (all follow the established `authRequest` + `useAuth` + `useI18n` + `formatTaka` patterns):
- mobile/screens/Transactions.tsx — hub with Sales/Purchases/Payments/Accounts/Expenses sections
- mobile/screens/Sales.tsx — sale list + new-sale cart flow (product search → cart → customer/walk-in → paidAmount → account)
- mobile/screens/Purchases.tsx — purchase list + new-purchase cart flow (product → cart → supplier → paidAmount → account)
- mobile/screens/Payments.tsx — customer/supplier payment list + record flow (type toggle, party, amount, method, account)
- mobile/screens/Accounts.tsx — account list + create (name/type/accountNumber; balance is server-authoritative)
- mobile/screens/Expenses.tsx — expense list + create (category, amount, payment account, note)
- mobile/src/localId.ts — `newLocalId(prefix)` client-side idempotency key generator

Modified:
- mobile/screens/Home.tsx — added a "Transactions" tab wired to TransactionsScreen
- mobile/src/i18n/dictionaries.ts — added bn/en strings for all Phase 05 features

Mobile safety (STEP 7): every screen uses type-safe `authRequest` calls, loading/error/empty/success
states, validation before submit, and never sends server-owned financial values (balance, due,
payable, totals, invoice numbers). The client only proposes productId/qty/unitPrice/paidAmount/
accountId; the server recomputes all totals. Every create sends a `localId` so an offline retry is
idempotent (duplicate:true returns the original record).

### 05.13 Offline sync + device identity — file inventory (verified 2026-08-21)

Recovery audit found the interrupted session had already completed the Expense model/service/
controller idempotency work (unique partial index on {businessId, localId}, in-transaction
deduplication, duplicate-key recovery, `{expense, duplicate}` return, deviceId-from-JWT). The
interruption left three real gaps that this session closed:

1. **DeviceId security (STEP 3):** `sale.controller.ts`, `purchase.controller.ts`,
   `payment.controller.ts` passed `req.body` directly to services, so a client could impersonate
   any deviceId. Fixed to derive `deviceId` from `req.user.deviceId` (verified JWT claims) exactly
   like the Expense controller. `payment.service.ts` and `purchase.service.ts` now persist
   `deviceId` (the models already had the field). `settlement.service.ts` forwards it.
2. **Expense offline-sync tests (STEP 4):** added 8 tests to expense.test.ts covering first
   localId request, duplicate retry, concurrent duplicate, different localId, conflicting payload,
   business-scoped uniqueness, deviceId-from-token (spoof rejected), and retry-after-failure.
3. **DeviceId security tests:** added one test each to sale.test.ts and purchase.test.ts verifying
   a client-supplied deviceId is rejected (Zod .strict()) and the real JWT device is persisted.

Offline-sync audit matrix (STEP 5) — ONE offline request = ONE financial effect; ONE retry = ZERO
additional effect:

| Aspect | Expense | Sale | Purchase | Payment |
|---|---|---|---|---|
| localId | ✅ | ✅ | ✅ | ✅ (localId + idempotencyKey) |
| uniqueness | ✅ unique partial {businessId, localId} | ✅ same | ✅ same | ✅ unique {businessId, idempotencyKey} |
| tenant scope | ✅ | ✅ | ✅ | ✅ |
| shop scope | ✅ | ✅ | ✅ | ✅ |
| device identity | ✅ JWT-derived | ✅ JWT-derived | ✅ JWT-derived | ✅ JWT-derived |
| duplicate behavior | ✅ duplicate:true | ✅ duplicate:true | ✅ duplicate:true | ✅ duplicate:true |
| concurrent duplicate | ✅ unique index | ✅ unique index | ✅ unique index | ✅ unique index |
| transaction atomicity | ✅ withTransaction | ✅ withTransaction | ✅ withTransaction | ✅ withTransaction |
| duplicate-key recovery | ✅ | ✅ | ✅ | ✅ |
| financial side effects | ✅ exactly once | ✅ exactly once | ✅ exactly once | ✅ exactly once |
| journal side effects | ✅ exactly once | ✅ exactly once | ✅ exactly once | ✅ exactly once |
| stock side effects | n/a | ✅ exactly once | ✅ exactly once | n/a |
| audit side effects | ✅ exactly once | ✅ exactly once | ✅ exactly once | ✅ exactly once |

Verification: backend `npm run typecheck` 0 errors · `npm test` 412/412 pass, exit 0, terminates
normally (no `--test-force-exit`) · mobile `npx tsc --noEmit` 0 errors.

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
| 05.08 Purchase | [x] VERIFIED | Purchase model (embedded PurchaseItem) + purchase.service/controller/routes/schemas mounted under `/api/v1/purchases` (POST /, GET /, GET /:id, POST /:id/finalize). Reuses the 05.07 StockMovement model (`purchase` type / `PURCHASE` refType) unchanged. DRAFT purchases carry server-computed totals with zero stock/financial effect; finalization is ONE withTransaction covering purchase-number allocation (atomic BusinessCounter key `PURCHASE`, never countDocuments()+1), stock increment, weighted-average cost recalculation, StockMovement, supplier payable, guarded account decrement, Purchase completion, balanced JournalEntry/JournalLine and AuditLog. avgCost = (oldStock × oldAvgCost + line costAmount) / (oldStock + qty), rounded once to integer paisa; zero previous stock collapses to the purchase's own unit cost, and a fully-offset negative stock falls back to it too. Header discounts are allocated pro-rata into each line's `costAmount` (last line absorbs the remainder) and `discountAmount` is then derived from Σ costAmount, so the Inventory debit balances the journal by construction. Journal: DEBIT Inventory (cost basis) + Tax Receivable (new ASSET concept, the mirror of 05.07's TAX_PAYABLE) / CREDIT cash/bank (paid portion) + Supplier Payable (credit portion); debit total === credit total asserted for cash, BANK, partial and fully-credit purchases. Supplier.currentPayable increases by dueAmount only — no duplicate Payment document is created for money paid at purchase time (mirrors decision 2 of 05.07). Zod `.strict()`: 19 spoof/malformed payloads rejected including total, taxAmount, dueAmount, paymentStatus, status, invoiceNo, createdBy, per-line lineTotal/netUnitCost, duplicate productId, both discount modes, malformed ISO date, negative and fractional money. RBAC Owner/Admin/Manager/Inventory Manager at route AND service level; Viewer and Salesperson 403 over HTTP and on a direct service call. Isolation: cross-tenant supplier/product/request 404, cross-shop 404, foreign-business account 404, foreign-shop account 404 — foreign balances verified untouched. Idempotency on three axes: duplicate finalize returns the purchase untouched (draft→finalize→finalize and inline-COMPLETED→finalize), concurrent finalize via Promise.allSettled applies effects exactly once, and a repeated localId returns the first purchase. Three rollback proofs by fault injection: (a) insufficient account balance, (b) a two-line finalize whose second product went INACTIVE — the first line's stock, avgCost and StockMovement are all gone, (c) a squatted invoiceNo collides on the unique {businessId, invoiceNo} index at `purchase.save()`, i.e. AFTER the account decrement, and the balance is still restored. Concurrent finalization produces distinct numbers; two shops in one business both start at sequence 1 without colliding. 46 purchase tests pass, full suite 276/276, npm test exits 0 and terminates normally, backend typecheck 0 errors, mobile typecheck 0 errors. || 05.09 Void / Reversal | [x] VERIFIED | New void.service.ts exposing `voidSale` + `voidPurchase`, wired as `POST /api/v1/sales/:id/void` and `POST /api/v1/purchases/:id/void` through the existing middleware chain (requireAuth → resolveBusiness → assertShopAccess → requireRole → validateBody). Only COMPLETED → VOIDED is legal: DRAFT is refused 400, and a second void is a no-op reporting `duplicate: true`. Nothing is ever deleted — the sale/purchase keeps its invoiceNo, totals, original journal and original AuditLog, and every reversal is a NEW row. Sale void: stock back up with a `sale_void`/`SALE_VOID` StockMovement, customer due decremented under a `currentDue >= dueAmount` guard, the paid amount debited out of the SAME account via the existing `decrementBalance` guard, symmetric journal reversal, `SALE_VOIDED` audit. Purchase void: stock back down under the same `allowNegativeStock` policy Sale finalization uses, avgCost recomputed from inventory VALUE (never an inverse-formula un-blend), supplier payable decremented under a `currentPayable >= dueAmount` guard, the paid amount refunded into the SAME account, symmetric journal reversal, `PURCHASE_VOIDED` audit. The reversal journal reuses the verified 05.04 `reverseJournal` unchanged — `referenceType: REVERSAL`, `isReversal: true`, `reversesEntryId` linking back, debit/credit mirrored; both entries are asserted balanced and the original's lines asserted byte-identical after the void. Documents with settlement Payments (`Payment.saleId`/`Payment.purchaseId`) are refused 400 rather than double-refunded, and a due/payable already settled below the document's own figure is refused 400 rather than driven negative. RBAC Owner/Admin/Manager at route AND service level: Salesperson, Accountant, Inventory Manager and Viewer all 403 — notably Inventory Manager may RECORD a purchase (05.08) but not unwind one. Cross-tenant, cross-shop and foreign-document void attempts all 404 with zero side effects. Four fault-injection rollback proofs, all real MongoDB transaction aborts with no compensating writes: (a) sale void where the till no longer holds the cash — stock and due restored, (b) sale void where the customer due was settled below the sale's due, (c) purchase void whose second line was already sold on — line 1's stock AND avgCost rewrite rolled back, (d) purchase void with the original journal entry removed, aborting at the LAST step before commit with stock, avgCost, payable and the account refund all restored. Additive model changes only: `sale_void`/`purchase_void` types + `SALE_VOID`/`PURCHASE_VOID` refTypes on StockMovement (kept distinct from Phase 06 returns), and a nullable `paymentAccountId` snapshot on Sale/Purchase so the reversal always hits the original account. 44 void tests pass, full suite 320/320, npm test exits 0 and terminates normally, backend typecheck 0 errors, mobile typecheck 0 errors. |
Files added: server/test/account.test.ts, server/test/counter.test.ts, server/test/money.test.ts, server/test/journal.test.ts
Files created (05.04): server/src/models/JournalEntry.ts, server/src/models/JournalLine.ts, server/src/services/journal.service.ts
File modified: server/src/routes/account.routes.ts (added assertShopAccess to GET /)

### 05.09 Void / Reversal — file inventory (verified 2026-08-20)

Recovery audit found NO pre-existing 05.09 work: 05.08 was committed (`017b99b`), the tree was clean,
and the only reversal machinery in the repo was the 05.04 journal engine plus the `VOIDED` enum value
that 05.07/05.08 already reserved. Baseline re-verified before writing code: typecheck 0 errors,
276/276 tests, mobile 0 errors.

Supersedes the "void/reversal is 05.09 — no void route exists" limitation recorded in the 05.07 and
05.08 inventories below.

Created:
- server/src/services/void.service.ts (`voidSale`, `voidPurchase`, `calcAvgCostAfterVoid`)
- server/test/void.test.ts (44 tests)

Modified (all additive — no verified behaviour changed):
- server/src/models/StockMovement.ts — added `sale_void`/`purchase_void` types and
  `SALE_VOID`/`PURCHASE_VOID` refTypes.
- server/src/models/Sale.ts, server/src/models/Purchase.ts — added nullable `paymentAccountId`.
- server/src/services/sale.service.ts, server/src/services/purchase.service.ts — snapshot
  `paymentAccountId` at finalization, expose it in the public shape, and re-export their serializer
  as `toPublicSale`/`toPublicPurchase` so void.service maps documents without duplicating it.
- server/src/validation/sale.schemas.ts, purchase.schemas.ts — `saleVoidSchema`/`purchaseVoidSchema`.
- server/src/controllers/sale.controller.ts, purchase.controller.ts — `voidSale`/`voidPurchase`.
- server/src/routes/sale.routes.ts, purchase.routes.ts — `POST /:id/void`.

Reused unchanged: journal.service `reverseJournal` (05.04), account.service
`incrementBalance`/`decrementBalance` (05.03), db/transactions `withTransaction` (05.01),
StockMovement (05.07), Payment (05.05). The journal engine was NOT rewritten.

Routes (established middleware order):
`POST /api/v1/sales/:id/void` and `POST /api/v1/purchases/:id/void` —
requireAuth → resolveBusiness → assertShopAccess → requireRole(Owner, Admin, Manager) →
validateBody → controller → service. The body carries only `businessId`, `shopId` and an optional
`reason`; `.strict()` rejects everything else, so a client cannot steer the reversal.

State machine: `COMPLETED → VOIDED` only. DRAFT is 400 ("Only a completed sale can be voided"),
`VOIDED → VOIDED` is an idempotent no-op with `duplicate: true`, and `VOIDED → COMPLETED` is
impossible because finalize already refuses a VOIDED document (05.07/05.08).

Sale void pipeline (one `withTransaction`): RBAC + tenant/shop scope → load sale → status guard →
settlement-payment guard → per line: `$inc currentStock +qty` (pre-image) + `sale_void` StockMovement
→ customer due `$inc -dueAmount` under a `currentDue >= dueAmount` filter → `decrementBalance` on the
snapshotted `paymentAccountId` → `reverseJournal` of the original SALE entry → status VOIDED →
`SALE_VOIDED` AuditLog.

Purchase void pipeline (one `withTransaction`): RBAC + tenant/shop scope → load purchase → status
guard → settlement-payment guard → per line: guarded `$inc currentStock -qty` (respecting
`Business.allowNegativeStock`) + avgCost recomputation + `purchase_void` StockMovement → supplier
payable `$inc -dueAmount` under a `currentPayable >= dueAmount` filter → `incrementBalance` on the
snapshotted `paymentAccountId` → `reverseJournal` of the original PURCHASE entry → status VOIDED →
`PURCHASE_VOIDED` AuditLog.

Design decisions worth reviewing:
1. **avgCost is reversed from inventory VALUE, not by inverting the purchase formula.**
   `remainingValue = currentStock × currentAvgCost − line.costAmount`, divided by
   `currentStock − qty`. The inverse-formula un-blend is only correct when nothing has happened
   since; the value-based derivation stays correct after later purchases and sales AND keeps the
   Product cache in step with the Inventory account, because the reversal journal credits Inventory
   by exactly the same `costAmount`. It also absorbs paisa drift: a purchase voided while it is still
   the latest receipt round-trips to the original avgCost exactly (tested with a 1-paisa drift case).
   When no stock or no value remains the average is undefined and collapses to 0 — the same
   degradation Sale already handles by falling back to `Product.purchasePrice` for its cost snapshot.
2. **A nullable `paymentAccountId` snapshot was added to Sale and Purchase.** Neither model stored
   which physical Account took the money at finalization — the journal only records the canonical
   account NAME (Cash/Bank/…). Without the snapshot the reversal could not honour "refund the same
   account", and asking the client for an accountId would have handed it control of the reversal.
   The field is nullable and defaults to null, so it changes nothing for credit-only documents.
3. **`sale_void`/`purchase_void` are new StockMovement types, deliberately NOT `sale_return`/
   `purchase_return`.** Reusing the return types would (a) collide on the
   `{businessId, refType, refId, productId}` unique index if the refType were left as SALE/PURCHASE,
   and (b) pollute the Phase 06 returns reporting the 05.07 inventory explicitly reserved those
   values for. The distinct refType doubles as a second idempotency guard behind the status check.
4. **Voids with settlement Payments attached are refused, not auto-refunded.** `Payment` documents
   have their own journals, balance effects and idempotency keys; unwinding them is a separate
   operation. A document with any `Payment.saleId`/`Payment.purchaseId` pointing at it gets a 400
   telling the caller to reverse the payments first — the only way to guarantee no double refund.
5. **Due/payable reversals are guarded, never clamped.** If an unlinked general payment already
   settled the balance below the document's own due, the void is refused with an actionable 400
   instead of silently clamping at zero (which would lose money) or going negative.
6. **The journal is reversed, never rewritten.** `referenceType` stays `REVERSAL` (the 05.04
   convention) rather than a new `SALE_VOID` journal type; the link back to the source document is
   `referenceId` (unchanged from the original) plus `reversesEntryId`, and `isReversal: true` keeps
   the 05.04 reversal-of-reversal guard meaningful.
7. **Voided documents keep their amounts.** `total`, `paidAmount`, `dueAmount`, `paymentStatus` and
   `invoiceNo` are left exactly as posted; `status: VOIDED` plus the reversal rows are the record of
   the unwind. Zeroing them would destroy the audit trail.

Known limitations (deliberately out of 05.09 scope):
- No refund of settlement Payments (refused instead, see decision 4) and no `POST /payments/:id/void`.
- No partial void: a void unwinds the whole document. Line-level returns are Phase 06.
- Voiding a purchase whose goods were already sold is refused under the default stock policy; with
  `allowNegativeStock: true` it proceeds and leaves stock negative with avgCost 0 (tested).
- `SaleItem.costPrice` snapshots are not re-derived when a purchase void changes `avgCost` — past
  sales keep the cost they were posted with, per the 05.07 snapshot design.
- No void reason taxonomy (free-text `reason` only) and no re-open/un-void path.
- No mobile screens (05.12).

Verification: backend `npm run typecheck` 0 errors · `npm test` 320/320 pass, exit 0, terminates
normally (no `--test-force-exit`) · mobile `npx tsc --noEmit` 0 errors.

### 05.08 Purchase — file inventory (verified 2026-08-20)

Recovered after an interrupted session: every 05.08 file already existed on disk and the baseline was
green at 268/268 once re-run. No 05.08 code was rewritten; the gap was test coverage, so 8 tests were
added (38 → 46).

Created:
- server/src/models/Purchase.ts (embedded PurchaseItem, DRAFT/COMPLETED/VOIDED, UNPAID/PARTIAL/PAID)
- server/src/validation/purchase.schemas.ts
- server/src/services/purchase.service.ts
- server/src/controllers/purchase.controller.ts
- server/src/routes/purchase.routes.ts
- server/test/purchase.test.ts (46 tests)

Modified:
- server/src/config/accounts.ts — added `TAX_RECEIVABLE: "Tax Receivable"` (ASSET) to
  JOURNAL_ACCOUNTS/JOURNAL_ACCOUNT_TYPES. Additive only; the mirror of 05.07's TAX_PAYABLE so
  recoverable input tax is not capitalised into inventory.
- server/src/app.ts — mounted `/api/v1/purchases`

Reused unchanged: StockMovement (05.07), BusinessCounter + counter.service (05.03),
journal.service (05.04), account.service `decrementBalance` (05.03), utils/invoice.ts,
utils/money.ts, db/transactions.ts `withTransaction`. `derivePaymentStatus` is imported from
sale.service rather than duplicated.

Finalization pipeline (one `withTransaction`, in order):
membership + service RBAC → localId idempotency check → business → supplier (tenant-scoped) →
products + server-side line build → header-discount allocation → Purchase.create (DRAFT) →
`nextSequence(business, shop, "PURCHASE")` + `PUR-<fiscalYear>-<branchCode>-<sequence>` →
per line: `$inc currentStock` (pre-image) → avgCost → StockMovement → Supplier payable (`dueAmount`
only) → `decrementBalance` (paid portion, never-negative guard) → purchase.save(COMPLETED) →
balanced writeJournal(referenceType `PURCHASE`, referenceId purchase._id) → AuditLog
`PURCHASE_FINALIZED`.

Design decisions worth reviewing:
1. **Purchase numbers are `PUR-<fiscalYear>-<branchCode>-<sequence>`** with counter key `PURCHASE` —
   the same shop-scoped convention 05.07 was forced into, on a separate counter key so sale and
   purchase sequences are independent. 05.03 counter semantics were not touched.
2. **avgCost is computed from `costAmount`, not `netAmount`.** Tax is excluded (it is journalized as
   recoverable Tax Receivable) and the header discount is already netted out, so the stored average
   cost always equals the Inventory debit ÷ units received. The division happens ONCE on the line
   total, so per-unit rounding never compounds.
3. **`discountAmount` is derived from Σ costAmount, not from the requested discount.** The header
   discount is allocated pro-rata with the last line absorbing the rounding remainder; deriving the
   header figure back out of the allocation makes `Σ costAmount + taxAmount === total` exact, which
   is what keeps the journal balanced regardless of rounding.
4. **Tax Receivable is an ASSET.** Input tax paid to a supplier is recoverable and must not inflate
   inventory cost. This is the only chart-of-accounts change, and it is purely additive.
5. **No Payment document for the amount paid at purchase time** — consistent with 05.07 decision 2.
   `Supplier.currentPayable` moves by `dueAmount` only, so `currentPayable = Σ purchase dues −
   Σ supplier payments` holds. Settling the remaining due later still goes through
   `recordPayment` (`Payment.purchaseId`).
6. **The header discount does not retroactively reduce per-line tax** — same settlement-discount
   policy as 05.07.
7. **Stock increase is unguarded** (unlike Sale's `currentStock >= qty` filter): receiving stock can
   never make it insufficient. `calcNewAvgCost` still handles `oldStock + qty <= 0` by falling back
   to this purchase's own unit cost, so a business that previously sold into negative stock cannot
   produce a nonsensical average.

Known limitations (deliberately out of 05.08 scope):
- Void/reversal is 05.09: the model supports VOIDED and finalize refuses it, but no void route
  exists, so `purchase_return` / `PURCHASE_RETURN` StockMovement types stay unused.
- No `POST /api/v1/purchases/:id/payments` sub-resource; supplier settlement uses `/api/v1/payments`.
- No goods-received-vs-billed split, landed-cost apportionment (freight/duty) or supplier credit
  limit.
- Duplicate productIds in one purchase are rejected rather than merged, preserving the
  {businessId, refType, refId, productId} StockMovement idempotency key.
- Purchase does not relieve/re-cost historical Sale lines: `SaleItem.costPrice` remains the snapshot
  taken at sale time.
- No mobile screens (05.12).

Test coverage added during recovery (8 tests): inactive product rejected; multi-line rollback via a
line-2 INACTIVE product; rollback after the account decrement via an invoiceNo unique-index
collision; concurrent finalization number uniqueness; inline-COMPLETED re-finalize; fully-credit
journal shape (2 lines, no tax/cash leg); avgCost rounding through real purchases; a 19-case Zod
strictness table plus the finalize payload.

Verification: backend `npm run typecheck` 0 errors · `npm test` 276/276 pass, exit 0, terminates
normally (no `--test-force-exit`) · mobile `npx tsc --noEmit` 0 errors.

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
