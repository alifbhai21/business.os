# REAL ATLAS API INTEGRATION AUDIT — HARNESS

Completely **isolated** from the existing unit/integration suite (`server/test/**/*.test.ts` which uses `MongoMemoryReplSet`). This harness connects to the application's **real MongoDB Atlas** deployment.

## Safety model

- The configured `MONGODB_URI`/`DATABASE_URL` (`.env`) has **no explicit database** — MongoDB would normally resolve it to the default `test` database.
- This harness **derives** a dedicated test database URI: `business_os_api_test` on the **same cluster** (see `helpers/atlasSafety.ts`).
- `assertSafeTestDb()` / `assertConnectedToTestDb()` **abort immediately** if `mongoose.connection.name !== "business_os_api_test"`.
- **No `dropDatabase`, no `deleteMany`, no `drop()` anywhere.** The harness only **inserts** records tagged with a unique per-run ident so re-runs are collision-safe.
- Credentials are **never logged.** Only the masked form (in `atlasConn.atlasConnectionLabel()`) is ever printed.

## Run

```bash
cd server
npm run test:atlas
```

Requires `MONGODB_URI` (or `DATABASE_URL`) present in `.env`/env. If unset or not an Atlas URI, the harness refuses to run.

> The existing suite (`npm test`) is **not** affected: `npm test` globs `test/**/*.test.ts`, while this harness lives in `test/atlas/**` with the `.atlas.ts` suffix and is invoked via the dedicated `test:atlas` script.

## What it verifies

| Area | Test |
|------|------|
| Real connection | `/health` + `/ready` report connected to real Atlas |
| Auth | register → `/auth/me` returns memberships |
| Sale | HTTP POST → Sale doc + StockMovement + Product stock + Account balance + balanced Journal + AuditLog |
| Purchase | HTTP POST → Purchase + avgCost + StockMovement + Supplier payable + balanced Journal |
| Expense | HTTP POST → Account decrement + journal Debit Expense / Credit Cash + AuditLog |
| Money integrity | Integer paisa (float rejected) + spoofed `total` rejected |
| Idempotency | Double-send same `localId` → one effect; concurrent `Promise.all` → one effect |
| Tenant isolation | A cannot read/write B (404s) incl. foreign customer/account usage |
| Device ID | Client-supplied `deviceId` rejected (400); persisted `deviceId` references verified JWT Device |
| Rollback | Oversized note → expense fails after account decrement → balance/journal/audit unchanged |
| Indexes | Unique indexes (businessId,localId / invoiceNo / idempotencyKey) present in Atlas |
| Integrity | No orphan JournalLines |

## Files

- `helpers/atlasSafety.ts` — dedicated-test-DB guard + masked URI derivation
- `helpers/atlasConn.ts` — connect/disconnect (dedicated test DB only)
- `factories/factories.ts` — deterministic unique factories used by integration tests
- `integration.atlas.ts` — the real-Atlas test file