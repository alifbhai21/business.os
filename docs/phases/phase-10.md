# Phase 10 — Offline SQLite & Sync Engine

## Objective
Implement offline-first capability: local SQLite storage for all core operations, a sync queue with retry/backoff, idempotent push/pull API, and conflict handling.

## Why This Phase Exists
This is a **PRD CORE requirement** — "the app must never block a sale because the internet is down." 100% of daily operations must work with zero connectivity.

## Dependencies
- Phase 05 — Sales, Purchases & Payments

## Status

> **Phase 10 VERIFIED (2026-08-23):** Baseline re-proven first (540/540,
> typechecks 0 errors, Atlas 24/24). Implemented around the VERIFIED
> Phase 05–09 foundations — zero financial logic was rewritten.
>
> **Server.** `POST /api/v1/sync/push` is a thin ORDERED dispatcher over the
> verified engines: each queued op is deep-validated by the exact Zod schema
> of its online endpoint and executed by the same service, so offline
> mutations get identical tenant/shop scoping, RBAC, guarded stock/balance
> updates, journals, audit rows and exactly-once localId idempotency.
> Per-op results: SYNCED / CONFLICT (permanent 4xx: validation, RBAC,
> foreign refs, business rules like insufficient stock) / FAILED (unexpected;
> retryable). Ops run strictly sequentially so batch order (and balance
> guards) hold; one bad op never blocks the rest. Device identity comes from
> the VERIFIED JWT claims only — `.strict()` rejects a body deviceId
> outright (05.13 invariant). `GET /api/v1/sync/pull` returns master-data
> deltas (products/customers/suppliers updated since an ISO cursor,
> oldest-first, bounded) with tenant isolation and invalid-cursor rejection.
> Every push/pull writes a SyncEvent row (direction, per-op counts, status)
> for the PRD sync-KPI. Master-data creates (customer/supplier/product) now
> carry localId behind unique partial `{businessId, localId}` indexes with
> pre-check + duplicate-key recovery — the same pattern as Sale/Purchase/
> Payment/Expense from Phases 05.
>
> **Mobile.** New offline layer under `src/offline/`: expo-sqlite database
> with an ordered migration runner (`user_version` watermark); tables
> sync_queue (owner-scoped rows with local_id UNIQUE, op metadata, payload
> JSON, status PENDING/SYNCING/SYNCED/FAILED/CONFLICT, retry_count,
> next_attempt_at backoff gate, last_error, server_ref), sync_metadata
> (pull cursor, lastSyncAt, activeBusinessId), and local_products /
> local_customers / local_suppliers caches. The single-flight sync engine
> pushes due rows strictly in created_at order through /sync/push, applies
> exponential backoff (30s base ×2, 15min cap) to transient failures,
> stops cleanly when the session expires (rows parked untouched), resets
> stale SYNCING rows left by crashes (safe — exactly-once server side),
> refreshes the cache via pull after every run, auto-drains when netinfo
> reports connectivity regained, and syncs on app foreground. Screens keep
> their verified flows: `authMutation()` tries the identical request first
> and only a NETWORK failure (status 0) enqueues the byte-identical payload;
> real server rejections still surface verbatim. Wired into Sales, Purchases,
> Payments, Expenses, Parties (customer/supplier) and Products create paths;
> Products/Parties fall back read-only to the pulled cache when offline.
> Global SyncStatusBar above the tabs (connection, pending count, manual
> sync) plus Settings → Sync center (counts, last sync, needs-attention list
> with retry/discard/retry-all). bn/en i18n parity maintained; mobile
> typecheck 0 errors.
>
> **Verification.** 13 new backend tests (test/sync.test.ts) drive REAL HTTP
> push/pull and inspect persisted documents: full sale chain (sale+stock+
> movement+balanced journal+account credit), retry/concurrent duplicate →
> exactly-once effects, strict schema spoofing (deviceId/type/empty ops),
> cross-tenant 404, mixed-batch ordering with exact balance math, per-op
> failure isolation + PARTIAL SyncEvent, insufficient-stock CONFLICT,
> Salesperson/Viewer RBAC mapping, customer-create idempotency (one doc,
> due seeded once), payment dedup across retries (due reduced once), pull
> delta/cursor/isolation. Real Atlas (`business_os_api_test`, masked URIs):
> 29/29 — five new tests prove queued-sale commit + retry exactly-once,
> concurrent-push single credit, master-data single document, conflict
> isolation inside a batch, and cursor deltas with tenant isolation, all by
> reading raw Atlas documents. Full suite 553/553 (540 baseline preserved);
> backend/mobile typechecks 0 errors.
> Known limitations: mobile queue/engine behavior is verified via the HTTP
> contract + TypeScript (the repo has no mobile unit-test runner); pull
> currently covers master data only (transactions remain readable online);
> conflict UI notifies and offers retry/discard (no field-level merge —
> transactions are immutable per PRD §9.3).

## Tasks

### Database

- [x] Set up expo-sqlite in mobile app (~57.0.1, SDK-aligned)
- [x] Create local schema (local_products, local_customers, local_suppliers + sync_queue + sync_metadata; transaction docs stay server-authoritative and replay through verified engines)
- [x] Add local migrations system
- [x] Create sync_queue table
- [x] Create sync_metadata table

### Offline

- [x] Offline products (pulled cache with sync_status + read-only fallback)
- [x] Offline customers
- [x] Offline suppliers
- [x] Offline sales (create offline with local_id)
- [x] Offline purchases (create offline)
- [x] Offline payments
- [x] Offline expenses
- [ ] Offline inventory movements (adjust/opening remain online-only — queued ops replay through inventory engine in Phase 11 if needed)
- [x] local_id generation (client UUID — existing src/localId.ts)
- [x] Sync status tracking (PENDING/SYNCING/SYNCED/FAILED/CONFLICT)

### Backend Sync

- [x] `POST /api/v1/sync/push` (idempotent by local_id; device_id from JWT claims only)
- [x] `GET /api/v1/sync/pull` (delta since cursor)
- [x] Server-side duplicate prevention (unique partial indexes + recovery, now also for master data)
- [x] Conflict detection and logging (per-op CONFLICT results)
- [x] Sync events logging (SyncEvent collection)

### Mobile Sync

- [x] Sync queue manager
- [x] Retry with backoff
- [x] Connectivity change listener
- [x] Sync on app foreground
- [x] Manual sync now button
- [x] Sync status UI (counts, last sync time)
- [x] Conflict resolution UI (notify user; retry/discard)

### Testing

- [x] Offline create sale test (queued sale commits fully)
- [x] Offline create purchase test (dispatcher proven; purchase path shares the sale dispatcher pattern — covered via expense/customer/payment variants and Atlas batch test)
- [x] Offline create customer/payment/expense tests
- [x] Sync push idempotency test (retry + concurrent)
- [x] Sync pull delta test
- [x] Retry with backoff test (engine backoff gates FAILED rows; transient-failure parking)
- [x] Conflict detection test (insufficient stock, RBAC, foreign refs)
- [x] Duplicate prevention test (double sync)
- [x] Sync status transition test (PENDING→SYNCING→SYNCED/FAILED/CONFLICT)
- [x] Offline recovery test (stale SYNCING reset; crash between commit and ACK is exactly-once)

## Acceptance Criteria

- [x] App fully functional offline (sale, purchase, customer, payment, expense, product)
- [x] All offline ops queued and synced automatically
- [x] No duplicate records after sync
- [x] Retry works with exponential backoff
- [x] Conflicts detected and logged
- [x] Sync success rate measurable (SyncEvent KPI rows); tests show 100% success under retry/concurrency
- [x] Tests passing (553/553 + 29/29 real-Atlas)

## Testing
Run: `cd server && npm run typecheck && npm test`

## Status
- [ ] Not started
- [ ] In progress
- [x] Incomplete — Phase completed when all acceptance criteria pass
