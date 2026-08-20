# Phase 10 — Offline SQLite & Sync Engine

## Objective
Implement offline-first capability: local SQLite storage for all core operations, a sync queue with retry/backoff, idempotent push/pull API, and conflict handling.

## Why This Phase Exists
This is a **PRD CORE requirement** — "the app must never block a sale because the internet is down." 100% of daily operations must work with zero connectivity.

## Dependencies
- Phase 05 — Sales, Purchases & Payments

## Existing Implementation Status
- ZIP A: sync push/pull API (basic, idempotent by localId) → **REFERENCE**
- Mobile: → **NOT_IMPLEMENTED** (no SQLite)
- Server: → **NOT_IMPLEMENTED**

## Tasks

### Database

- [ ] Set up expo-sqlite in mobile app
- [ ] Create local schema (business, shop, products, customers, suppliers, sales, sale_items, purchases, purchase_items, payments, expenses, inventory)
- [ ] Add local migrations system
- [ ] Create sync_queue table
- [ ] Create sync_metadata table

### Offline

- [ ] Offline products (local copy with sync_status)
- [ ] Offline customers
- [ ] Offline suppliers
- [ ] Offline sales (create offline with local_id)
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
- [ ] Sync events table/logging

### Mobile Sync

- [ ] Sync queue manager
- [ ] Retry with backoff
- [ ] Connectivity change listener
- [ ] Sync on app foreground
- [ ] Manual sync now button
- [ ] Sync status UI (counts, last sync time)
- [ ] Conflict resolution UI (notify user)

### Testing

- [ ] Offline create sale test
- [ ] Offline create purchase test
- [ ] Offline create customer/payment/expense tests
- [ ] Sync push idempotency test
- [ ] Sync pull delta test
- [ ] Retry with backoff test
- [ ] Conflict detection test
- [ ] Duplicate prevention test (double sync)
- [ ] Sync status transition test (PENDING → SYNCING → SYNCED)
- [ ] Offline recovery test (crash during sync)

## Acceptance Criteria

- [ ] App fully functional offline (sale, purchase, customer, payment, expense, product)
- [ ] All offline ops queued and synced automatically
- [ ] No duplicate records after sync
- [ ] Retry works with exponential backoff
- [ ] Conflicts detected and logged
- [ ] Sync success rate ≥ 99.5% in tests
- [ ] Tests passing

## Testing
Run: `cd server && npm run typecheck && npm test`

## Expected Output
- Offline-first mobile app
- Working sync engine with queue, retry, conflict handling
- Sync status visible in UI

## Status
- [x] Not started
- [ ] In progress
- [ ] Incomplete — Phase completed when all acceptance criteria pass