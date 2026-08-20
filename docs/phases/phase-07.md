# Phase 07 — Double-Entry Accounting Engine

## Objective
Implement the double-entry accounting engine: automatic journal entries for every transaction, plus General Ledger, Trial Balance, P&L, Balance Sheet, and Cash Flow.

## Why This Phase Exists
This is the PRD's core financial engine — every sale, purchase, payment, and expense automatically creates a balanced journal entry. The user never touches these manually for normal operations.

## Dependencies
- Phase 05 — Sales, Purchases & Payments

## Existing Implementation Status
- ZIP A: journal_entries + journal_lines tables + report query → **REFERENCE (basic)**
- ZIP B: Basic profit report using COGS, no journals → **REFERENCE (better profit calc)**
- Server: → **NOT_IMPLEMENTED**

## Tasks

### Database

- [ ] Create JournalEntry model (businessId, shopId, date, description, referenceType, referenceId)
- [ ] Create JournalEntryLine model (journalEntryId, accountName, accountType, debit, credit)
- [ ] Create AccountChart model (businessId, code, name, type, parent)
- [ ] Add indexes: JournalEntry.businessId+date, JournalEntry.referenceId

### Backend

- [ ] Create accounting service
- [ ] Create journaling engine (auto-entries per transaction type)
- [ ] Sale journaling: CustomerReceivable/Cash Dr + SalesRevenue Cr
- [ ] Customer payment journaling: Cash Dr + CustomerReceivable Cr
- [ ] Purchase journaling: Inventory Dr + SupplierPayable/Cash Cr
- [ ] Supplier payment journaling: SupplierPayable Dr + Cash Cr
- [ ] Expense journaling: Expense Dr + Cash Cr
- [ ] Sales return journaling: SalesReturns Dr + CustomerReceivable Cr
- [ ] Purchase return journaling: SupplierPayable Dr + PurchaseReturns Cr
- [ ] Cash transfer journaling: DestCash Dr + SourceCash Cr
- [ ] General ledger service (all entries per account)
- [ ] Trial balance service (debits = credits)
- [ ] P&L service (revenue − COGS − expenses)
- [ ] Balance Sheet service (assets = liabilities + equity)
- [ ] Cash Flow service (operating/investing/financing)

### API

- [ ] `GET /api/v1/accounting/ledger`
- [ ] `GET /api/v1/accounting/trial-balance`
- [ ] `GET /api/v1/accounting/profit-loss`
- [ ] `GET /api/v1/accounting/balance-sheet`
- [ ] `GET /api/v1/accounting/cash-flow`
- [ ] `GET /api/v1/accounting/journal`

### Mobile

- [ ] General ledger screen
- [ ] Trial balance screen
- [ ] P&L screen
- [ ] Balance Sheet screen
- [ ] Cash Flow screen

### Testing

- [ ] Journal balance test (debits = credits for every entry)
- [ ] Sale journal test
- [ ] Customer payment journal test
- [ ] Purchase journal test
- [ ] Supplier payment journal test
- [ ] Expense journal test
- [ ] Sales return journal test
- [ ] Purchase return journal test
- [ ] Cash transfer journal test
- [ ] General ledger calculation test
- [ ] Trial balance test
- [ ] P&L test (using avgCost for COGS)
- [ ] Balance Sheet test
- [ ] Cash Flow test
- [ ] Property-based journal balance test

## Acceptance Criteria

- [ ] Every transaction auto-creates balanced journal entry
- [ ] GL, Trial Balance, P&L, Balance Sheet, Cash Flow all correct
- [ ] No manual journal entry needed for normal operations
- [ ] Financial records voided/reversed, never physically deleted
- [ ] Tests passing

## Testing
Run: `cd server && npm run typecheck && npm test`

## Expected Output
- Full double-entry accounting engine
- Financial reports API + mobile screens

## Status
- [x] Not started
- [ ] In progress
- [ ] Incomplete — Phase completed when all acceptance criteria pass