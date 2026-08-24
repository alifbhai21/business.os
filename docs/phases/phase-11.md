# Phase 11 — Backup & Restore

## Objective
Implement cloud backup strategy, restore on new device, and data export.

## Why This Phase Exists
The PRD requires continuous automatic cloud backup (MongoDB Atlas as backup source), restore on login to a new device, and data export.

## Dependencies
- Phase 10 — Offline SQLite & Sync Engine

## Status

> **Phase 11 VERIFIED (2026-08-23):** Recovery audit found NO pre-existing
> Phase 11 code — every requirement was genuinely missing (the only
> "backup|restore|export" hits were void-stock restores and TS keywords).
> Baseline re-proven first: 553/553 tests, backend typecheck 0 errors,
> mobile typecheck 0 errors, real-Atlas 29/29 on `business_os_api_test`.
> The extensive uncommitted work in the tree belongs to the VERIFIED
> Phases 09–10 (tracker-confirmed) and was preserved untouched.
>
> **Strategy.** MongoDB Atlas is the system of record: every business
> mutation is already durably persisted inside a transaction with an
> AuditLog row (Phases 05–10), so Atlas continuous backups/snapshots are
> the disaster-recovery layer. Phase 11 adds the application surface:
>
> **Server.**
> - `GET /api/v1/backup/status` — persistence-health snapshot for any ACTIVE
>   member: per-collection counts (shops→auditLogs), newest server write,
>   last audit row, last sync event, connection state, `healthy` flag.
> - `GET /api/v1/sync/restore?businessId=&limit=` — FULL dataset pull for a
>   new device: business profile, shops, categories, accounts, products,
>   customers, suppliers, sales (+items), purchases (+items), payments,
>   expenses and stock movements, oldest-first with a per-collection cap
>   (default 1000, hard cap 2000). Read-only against business data; writes
>   exactly ONE `SyncEvent(direction:"RESTORE")` observability row whose
>   deviceId comes from the VERIFIED JWT claims (05.13 invariant). Shop-
>   pinned members receive their own shop's transactions/accounts only;
>   master data stays business-wide (same scoping as /sync/pull). Available
>   to any active member — a Salesperson with a new phone must resume work.
> - `GET /api/v1/export/data` — complete JSON archive as an attachment
>   (`Content-Disposition`), adding journalEntries + journalLines (resolved
>   through entry ids because JournalLine carries no businessId) + auditLogs.
> - `GET /api/v1/export/csv?type=products|customers|suppliers|accounts|
>   sales|purchases|payments|expenses` — RFC-4180 CSV attachment per entity.
>   New util `utils/csv.ts` escapes commas/quotes/newlines; money stays raw
>   integer paisa.
> - RBAC: new `data:export` permission added to the Phase 09 matrix and
>   granted to Owner/Admin/Manager/Accountant; enforced by route middleware
>   AND re-checked in the service (a service-level hole in exportData was
>   caught BY the new tests and fixed). Every successful export writes a
>   `DATA_EXPORTED` AuditLog row; refused exports write nothing.
>
> **Mobile.**
> - SQLite migration v2 adds `local_accounts` so a restored device can
>   record payments/expenses offline against real account ids.
> - `syncEngine.restoreAll()` pulls the restore payload and upserts
>   products/customers/suppliers/accounts caches transactionally, records
>   `lastRestoreAt`, then seeds the pull cursor so the delta engine does not
>   re-pull everything. Engine start() auto-restores on a FRESH device
>   (no prior pull cursor); offline failures are swallowed safely.
> - Settings → Backup & Export screen: cloud-backup status card (health,
>   last server write, record counts), Restore-now action with result
>   summary, full JSON export and eight CSV exports via the OS share sheet.
> - Sync center gains a compact "Cloud backup" indicator row plus a jump to
>   the backup screen. `api.ts` gained an additive `rawText` option so CSV
>   bodies survive the JSON-first client. bn/en parity asserted (404/404);
>   fixed a pre-existing mis-indented `businessPosition` en key found during
>   the parity check. Mobile runtime verification remains pending (no
>   emulator/device available) — TypeScript + HTTP-contract verified only.
>
> **Verification.** 24 new backend tests (test/backup.test.ts) over REAL
> HTTP: dataset completeness vs DB, read-only behaviour + exactly-one
> RESTORE event, deviceId-from-JWT proof (spoofed device never appears),
> auth/RBAC matrices (restore any-member; export data:export at route AND
> service level), shop-pin narrowing, tenant isolation 404s, strict limit
> validation, concurrent restores, DATA_EXPORTED audit rows, debits===credits
> on exported journals, exported totals reconciled with raw documents,
> RFC-4180 escaping round-trip (customer name containing comma+quotes), CSV
> header exactness and per-type row counts. Real Atlas (`business_os_api_test`,
> masked URIs): 34/34 — five new tests prove status counts equal raw Atlas
> collection counts, new-device restore returns the full live dataset,
> cross-tenant restore/status/export all 404 against live data, JSON export
> reconciles with raw Atlas documents (balanced journals), CSV row count
> equals the Atlas document count. Full suite 577/577 (553 baseline
> preserved); npm test exits 0; backend/mobile typechecks 0 errors.

## Tasks

### Backend

- [x] Backup strategy (Atlas as backup source) — documented strategy + `GET /backup/status` visibility endpoint
- [x] Restore API (full data push for new device) — `GET /sync/restore`
- [x] Data export endpoint (JSON) — `GET /export/data`
- [x] Data export endpoint (CSV) — `GET /export/csv?type=…`

### Mobile

- [x] Restore on login to new device (pull all data) — engine auto-restore + manual restore
- [x] Backup status indicator — Sync center card + Backup & Export screen
- [x] Data export screen — Settings → Backup & Export (JSON + CSV share)

### Testing

- [x] Backup test — status counts/timestamps match real documents
- [x] Restore test (new device gets full data) — unit suite + real-Atlas new-device scenario
- [x] Export test (JSON + CSV) — archive completeness, balance invariant, escaping, RBAC, isolation

## Acceptance Criteria

- [x] New device restore works (HTTP contract + real-Atlas proven; mobile runtime pending)
- [x] Data export works
- [x] Tests passing (577/577 + 34/34 real-Atlas)

## API Endpoints Added

| Method | Path | Auth | RBAC | Notes |
|---|---|---|---|---|
| GET | `/api/v1/backup/status` | requireAuth + resolveBusiness + assertShopAccess | any active member | counts + last-write timestamps only |
| GET | `/api/v1/sync/restore` | requireAuth | any active member | one SyncEvent(RESTORE); shop-pin honoured |
| GET | `/api/v1/export/data` | requireAuth + resolveBusiness + assertShopAccess | `data:export` (Owner/Admin/Manager/Accountant) | attachment; audited |
| GET | `/api/v1/export/csv?type=` | requireAuth + resolveBusiness + assertShopAccess | `data:export` | attachment; audited |

## Database Changes

- `SyncEvent.direction` enum extended additively: `"PUSH" | "PULL" → +"RESTORE"` (no index/migration impact)
- Mobile SQLite migration v2: `local_accounts` cache table
- No new MongoDB collections or indexes required (read-only features)

## Known Limitations / Deferred

- Mobile runtime verification pending (no emulator/device available in this environment).
- Restore payload is bounded per collection (default 1000, max 2000); businesses beyond the cap page through repeated calls (limit param) rather than one unbounded response.
- Exports include integer-paisa values only (server-authoritative); taka formatting is intentionally left to consumers.
- Atlas cluster snapshots (M10+ automated backups) are configured at the cluster level, not via app API; M0 free tier has no snapshot policy — documented operational consideration.
- CSV is single-entity-per-call by design (flat format); a combined workbook-style export remains Phase 12 scope.

## Testing

Run: `cd server && npm run typecheck && npm test && npm run test:atlas`

## Status
- [ ] Not started
- [ ] In progress
- [x] Incomplete — Phase completed when all acceptance criteria pass
