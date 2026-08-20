# Phase 06 — Inventory, Returns & Transfers

## Objective
Implement the inventory movement ledger, sales/purchase returns, stock transfers between shops, adjustments, and low-stock detection.

## Why This Phase Exists
The PRD requires tracking all inventory movements (opening, purchases, sales, returns, transfers, adjustments, damaged) and supporting returns and multi-shop stock transfers.

## Dependencies
- Phase 05 — Sales, Purchases & Payments

## Existing Implementation Status
- ZIP A: inventory_movements + stock_transfers tables + API → **REFERENCE**
- ZIP B: inventory_movements table + API → **REFERENCE**
- Returns: → **NOT_IMPLEMENTED** in both

## Tasks

### Database

- [ ] Create StockMovement model (businessId, shopId, productId, type, quantityChange, previousStock, newStock, referenceId, referenceType, note)
- [ ] Create StockTransfer model (businessId, sourceShopId, destShopId, productId, quantity, status: PENDING/IN_TRANSIT/RECEIVED/CANCELLED, notes, createdBy)
- [ ] Add indexes: StockMovement.businessId+productId+createdAt
- [ ] Add unique index: { businessId, refType, refId }

### Backend

- [ ] Create inventory service (atomic stock engine)
- [ ] Create inventory controller
- [ ] Create inventory routes
- [ ] Sales return service (reverse sale: stock +, revenue reversed, customer balance adjusted, journal)
- [ ] Purchase return service (reverse purchase: stock -, supplier payable adjusted, journal)
- [ ] Stock transfer service (source: transfer_out, dest: transfer_in)
- [ ] Stock adjustment service (correction, damage)
- [ ] Low-stock detection service

### API

- [ ] `GET /api/v1/inventory/stock`
- [ ] `GET /api/v1/inventory/movements`
- [ ] `POST /api/v1/inventory/adjust`
- [ ] `POST /api/v1/inventory/opening`
- [ ] `POST /api/v1/sales/:id/return`
- [ ] `POST /api/v1/purchases/:id/return`
- [ ] `POST/GET /api/v1/transfers`
- [ ] `PUT /api/v1/transfers/:id/status`

### Mobile

- [ ] Inventory screen (stock list + low stock)
- [ ] Stock movements screen
- [ ] Adjust stock modal
- [ ] Opening stock modal
- [ ] Sales return screen
- [ ] Purchase return screen
- [ ] Stock transfer screen (source → dest → product → qty)

### Testing

- [ ] Sale stock decrease movement test
- [ ] Purchase stock increase movement test
- [ ] Sales return stock increase test
- [ ] Purchase return stock decrease test
- [ ] Transfer in/out movement records test
- [ ] Adjustment movement test
- [ ] Damaged stock test
- [ ] Low-stock detection test
- [ ] Atomic stock guard test (concurrent sales)
- [ ] Stock balanceAfter snapshot test

## Acceptance Criteria

- [ ] All stock movements tracked with previousStock/newStock snapshots
- [ ] Returns reverse stock + financials (customer/supplier balance + journal)
- [ ] Transfers between shops work (both sides)
- [ ] Adjustments work
- [ ] Low-stock alerts work
- [ ] Tests passing

## Testing
Run: `cd server && npm run typecheck && npm test`

## Expected Output
- Complete inventory ledger
- Returns and transfer flows
- Mobile inventory screens

## Status
- [x] Not started
- [ ] In progress
- [ ] Incomplete — Phase completed when all acceptance criteria pass