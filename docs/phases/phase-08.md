# Phase 08 — Dashboard & Reports

## Objective
Implement the owner dashboard with today's key metrics and full sales/purchase/inventory/financial reports.

## Why This Phase Exists
The PRD requires a dashboard showing today's sales, purchases, expenses, profit, stock value, receivables, payables, cash balance, and low-stock list, plus comprehensive reports.

## Dependencies
- Phase 05 — Sales, Purchases & Payments
- Phase 07 — Double-Entry Accounting Engine

## Existing Implementation Status
- ZIP A: summary report (estimated 22% profit) → **REFERENCE**
- ZIP B: full reports (profit with COGS, sales, inventory, receivables, payables) → **REFERENCE (better)**
- Mobile Dashboard.tsx: counts only → **PARTIAL (broken imports)**

## Tasks

### Backend

- [ ] Create dashboard service (today's sales/purchases/expenses/profit, stock value, receivables, payables, cash, low stock, recent transactions)
- [ ] Create report service
- [ ] Sales report: daily/monthly, product-wise, customer-wise
- [ ] Purchase report: date-wise, supplier-wise, product-wise
- [ ] Inventory report: current stock, valuation, low stock
- [ ] Financial report: P&L summary, receivables, payables, expenses by category

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

- [ ] Dashboard screen (today's sales/purchases/expenses/profit, stock value, receivables/payables, cash, low stock, recent transactions)
- [ ] Sales report screen
- [ ] Purchase report screen
- [ ] Inventory report screen
- [ ] Financial report screen
- [ ] Quick actions (+Sale +Purchase +CustomerPayment +SupplierPayment +Expense +StockTransfer)
- [ ] Global search (products, customers, suppliers, invoices, transactions, SKU, barcode, phone)

### Testing

- [ ] Dashboard aggregation tests
- [ ] Sales report tests
- [ ] Purchase report tests
- [ ] Inventory report tests
- [ ] Receivables/payables tests
- [ ] Expense report tests
- [ ] Quick action tests

## Acceptance Criteria

- [ ] Dashboard shows all key metrics
- [ ] Reports generate correctly
- [ ] Quick actions work
- [ ] Global search works
- [ ] Tests passing

## Testing
Run: `cd server && npm run typecheck && npm test`

## Expected Output
- Full dashboard + reports
- Mobile screens for all reports

## Status
- [x] Not started
- [ ] In progress
- [ ] Incomplete — Phase completed when all acceptance criteria pass