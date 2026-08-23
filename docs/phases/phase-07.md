# Phase 07 — Double-Entry Accounting Engine

## Objective
Implement the double-entry accounting engine: automatic journal entries for every transaction, plus General Ledger, Trial Balance, P&L, Balance Sheet, and Cash Flow.

## Why This Phase Exists
This is the PRD's core financial engine — every sale, purchase, payment, and expense automatically creates a balanced journal entry. The user never touches these manually for normal operations.

## Dependencies
- Phase 05 — Sales, Purchases & Payments
- Phase 06 — Inventory, Returns & Transfers

## Existing Implementation Status
- ZIP A: journal_entries + journal_lines tables + report query → **REFERENCE (basic)**
- ZIP B: Basic profit report using COGS, no journals → **REFERENCE (better profit calc)**
- Server: the journal WRITE engine already shipped as Phase 05/06 dependencies (`journal.service.ts`, JournalEntry/JournalLine models, per-transaction balanced journals asserted by 100+ tests). Recovery audit found the READ/reporting layer and the sale COGS leg genuinely missing → implemented this phase.

## Tasks

### Database

- [x] Create JournalEntry model (businessId, shopId, date, description, referenceType, referenceId) — *existed since Phase 05*
- [x] Create JournalEntryLine model (journalEntryId, accountName, accountType, debit, credit) — *existed (`JournalLine`)*
- [x] Create AccountChart model → **deliberate deviation:** the chart of accounts is the canonical constant map in `server/src/config/accounts.ts` (single source of truth; PRD §8.14 defers chart-of-accounts UI to P2). Extended with COGS / Sales Returns / Purchase Returns concepts.
- [x] Add indexes: JournalEntry.businessId+date, JournalEntry.referenceId — *existed* (+ new unique partial `{businessId, referenceType, localId}` for offline idempotency)

### Backend

- [x] Create accounting service — *write engine existed; read services added (`accounting.service.ts`)*
- [x] Create journaling engine (auto-entries per transaction type) — *existed*
- [x] Sale journaling: CustomerReceivable/Cash Dr + SalesRevenue Cr — *existed*
- [x] Customer payment journaling: Cash Dr + CustomerReceivable Cr — *existed*
- [x] Purchase journaling: Inventory Dr + SupplierPayable/Cash Cr — *existed*
- [x] Supplier payment journaling: SupplierPayable Dr + Cash Cr — *existed*
- [x] Expense journaling: Expense Dr + Cash Cr — *existed*
- [x] Sales return journaling: **SalesReturns Dr** (contra) + receivable/cash reversal + TaxPayable reversal + **Inventory Dr / COGS Cr EXACTLY Σ returnedQty×costPrice** (was generic proportional mirror)
- [x] Purchase return journaling: SupplierPayable/Cash Dr + Inventory/TaxReceivable Cr (perpetual inventory kept so GL never diverges from physical stock; documented deviation from a literal "PurchaseReturns" contra)
- [x] Cash transfer journaling: DestCash Dr + SourceCash Cr — **NEW** `POST /api/v1/accounts/transfer` (guarded decrement/increment inside `withTransaction`, localId idempotency anchored on JournalEntry unique index, RBAC Owner/Admin/Manager/Accountant at route+service, rollback-proven)
- [x] General ledger service (account filter, date range, running balance, pagination)
- [x] Trial balance service (debits = credits enforced — internal error if violated)
- [x] P&L service (revenue net of Sales Returns contra − COGS − operating expenses)
- [x] Balance Sheet service (assets = liabilities + equity; retained earnings balancing figure; unjournaled shop opening cash surfaced as explicit `unreconciledOpeningEquity`, never silently absorbed)
- [x] Cash Flow service (direct method over cash-asset lines; inter-account transfers reported separately so they never inflate operating flows)

### API

- [x] `GET /api/v1/accounting/ledger`
- [x] `GET /api/v1/accounting/trial-balance`
- [x] `GET /api/v1/accounting/profit-loss`
- [x] `GET /api/v1/accounting/balance-sheet`
- [x] `GET /api/v1/accounting/cash-flow`
- [x] `GET /api/v1/accounting/journal`
- [x] `POST /api/v1/accounts/transfer`

### Mobile

- [x] General ledger screen (account chips from trial balance, running context, pagination)
- [x] Trial balance screen
- [x] P&L screen
- [x] Balance Sheet screen
- [x] Cash Flow screen
- [x] Wired via Settings → "Accounting" overlay route (`mobile/screens/Accounting.tsx`; no new tab, existing navigation preserved)

### Testing

- [x] Journal balance test (debits = credits for every entry) — *Phase 05/06 suites*
- [x] Sale journal test incl. **COGS legs** (Dr COGS / Cr Inventory from cost snapshots; zero-cost sales omit legs)
- [x] Customer/Supplier payment journal tests — *existed*
- [x] Purchase journal test — *existed*
- [x] Expense journal test — *existed*
- [x] Sales return journal test — contra account + exact per-line COGS reversal (multi-margin case proves no blended-ratio drift)
- [x] Purchase return journal test — inventory asset release + balance
- [x] Cash transfer journal suite — happy path, insufficient-balance full rollback (DB-state assertions), RBAC route+service, cross-tenant 404, strict-schema rejections, sequential localId retry, concurrent duplicates exactly-once
- [x] General ledger calculation test (filter + monotone running balance)
- [x] Trial balance test
- [x] P&L test (avgCost-derived COGS; isolated-shop hand-computed figures; sales-return contra flow into P&L)
- [x] Balance Sheet test (hand-computed with blended avgCost; unreconciled-opening-equity visibility)
- [x] Cash Flow test (operating vs inter-account transfers separated; netCashFlow exact)
- [x] Property-based journal balance invariant — every new test asserts Σdebit === Σcredit on real persisted lines
- [x] Reports RBAC (Owner/Admin/Manager/Accountant 200; Viewer/Salesperson/Inventory Manager 403; foreign tenant 404)

## Acceptance Criteria

- [x] Every transaction auto-creates balanced journal entry
- [x] GL, Trial Balance, P&L, Balance Sheet, Cash Flow all correct
- [x] No manual journal entry needed for normal operations
- [x] Financial records voided/reversed, never physically deleted (*unchanged since 05.09*)
- [x] Tests passing (465/465; 21 new accounting tests)

## Security Model (this phase)
- All six report endpoints: `requireAuth` → `resolveBusiness` → `assertShopAccess` → `requireRole(Owner/Admin/Manager/Accountant)`; service re-resolves membership and pins shop-pinned users server-side.
- Cash transfer: same middleware chain + role matrix at ROUTE and SERVICE level; both accounts scoped by businessId+shopId in the query itself (foreign ids → 404); amount must be positive integer paisa; `.strict()` Zod rejects spoofed fields.
- deviceId rule untouched (transfers derive identity from the verified JWT like every other mutation).
- No client-supplied financial value is ever trusted: reports are pure journal aggregations.

## Idempotency Behavior
- JournalEntry gained a nullable `localId` behind a unique partial index `{businessId, referenceType, localId}` — the CASH_TRANSFER flow uses it for in-transaction pre-check plus duplicate-key recovery; retried/concurrent transfers resolve to the original entry with exactly one money movement (proven by tests).

## Known Limitations / Decisions
- Chart of accounts is config-driven constants (no AccountChart collection) until the P2 chart-management feature.
- Balance Sheet equity is contributed(0) + retained earnings balancing figure; unjournaled legacy opening balances (shop `openingCash` seeded pre-Phase-07) surface explicitly as `unreconciledOpeningEquity`.
- Cash-flow investing/financing sections are structurally present but empty until such flows exist (Phase 12+).
- Purchase returns release the Inventory asset directly (periodic-style "Purchase Returns" contra intentionally not used) — keeps GL inventory equal to physical stock value.
- Mobile runtime verification still pending (no emulator/device — same caveat as Phases 05/06).

## Final Verification (2026-08-23)
- Backend: `npm run typecheck` PASS (0 errors); `npm test` → **465/465 pass, 0 failed, 0 skipped**, exits normally.
- Mobile: `npx tsc --noEmit` PASS (0 errors).
- Security spot-audit: tenant/shop scoping on every new endpoint; service-level RBAC re-checks; strict schemas; real-transaction atomicity with fault-injected rollback proof; journal balance asserted on persisted lines in every new test.

## Status
- [ ] Not started
- [x] In progress → COMPLETE (all acceptance criteria verified 2026-08-23)
- [ ] Incomplete
