# Phase 14 — Production Hardening & Monitoring

## Objective
Implement production-grade monitoring (Sentry, Winston), performance optimization for low-end Android devices, and security hardening.

## Why This Phase Exists
The PRD requires crash reporting, error monitoring, audit logs, sync event logs, p95 < 500ms for core reads, smooth operation on 2-3GB RAM devices, and low mobile-data usage.

## Dependencies
- Phase 13 — Testing, CI/CD & Deployment

---

## Phase 14 REPORT (2026-08-24) — IMPLEMENTATION COMPLETE

> **Recovery audit first.** No prior Phase 14 code existed. The audit found
> substantial infrastructure ALREADY satisfying several requirements and
> preserved it: SyncEvent ledger with indexed KPI-ready data (Phase 10),
> `GET /audit` review endpoint with action/date/shop filters + RBAC
> (Phase 09), cursor-based delta sync + event-driven battery-friendly sync
> engine (30s→15min exponential backoff, NO polling — Phase 10), FlatList
> virtualization across 40 mobile screens, comprehensive compound indexes on
> every tenant-scoped hot path (verified model-by-model). Baseline gate was
> re-proven before any change: 638/638 backend, 39/39 real-Atlas, typecheck
> 0, lint 0, secret scan clean. No concurrent agents were active.

### Requirement matrix (audit result)

| Requirement | Status | Action taken |
|---|---|---|
| Sentry server | MISSING (activation needs DSN) | Wired conditionally via `SENTRY_DSN`; activation BLOCKED |
| Sentry mobile | MISSING/BLOCKED | Requires EAS native build to verify — DEFERRED, documented |
| Winston structured logging (no secrets/PII) | PARTIAL | JSON production format + pure `redactText()` (URIs/bearers/JWTs/emails/hex) |
| API latency monitoring p95<500ms | PARTIAL | `latencyTracker` middleware + bounded histogram + `GET /api/v1/ops/metrics` |
| Sync success rate monitoring | PARTIAL (data existed) | New `GET /api/v1/sync/stats` KPI aggregation over SyncEvent |
| Crash reporting | PARTIAL | `uncaughtException`/`unhandledRejection` handlers → structured log + Sentry capture; mobile crash reporting BLOCKED (EAS) |
| Audit log review workflow | EXISTING (verified) | None — Phase 09 endpoint + tests already cover filters/RBAC |
| Product search 5,000+ products | MISSING (300 only) | New 5k-catalog search suite in the perf lane |
| Low-end device optimization | EXISTING (verified) | Documented: 40× FlatList windowing, no heavy libs, SQLite batched reads |
| Low mobile-data usage | PARTIAL | `compression` gzip middleware added; delta sync already cursor-based |
| Battery optimization | EXISTING (verified) | Documented: event-driven triggers (connectivity/foreground), no polling |
| Database index review | PARTIAL | Full model-by-model review + regression test pinning 13 critical indexes |
| Query optimization | PARTIAL | Measured at 5k scale first (p50 ≈ 60–90ms); no blind changes needed |
| Full security audit | PARTIAL | Extended automated lane (see §Security); summarized in docs |
| Penetration testing | PARTIAL | Automated injection/JWT/isolation probes; external pentest BLOCKED |
| Data encryption review | PARTIAL | Reviewed + documented (TLS/bcrypt/SHA-256/secure-store/SQLite) |
| Compliance review | PARTIAL | Documented (exports permission-gated, tenant isolation proven) |
| Environment variable audit | PARTIAL | Complete inventory table in docs/deployment.md §6 |

### Implementation details

**Structured logging** (`src/utils/logger.ts`): production emits one-line
JSON (`ts`, `level`, `msg`, `meta`) after passing through the PURE
`redactText()` transform — MongoDB/Postgres credentials masked, Bearer
tokens and JWT-shaped strings replaced, emails reduced to `x***@domain`,
long hex secrets collapsed. Dev keeps the pretty colorized format;
`LOG_FORMAT=json` forces structure anywhere.

**Latency monitoring** (`src/middleware/metrics.ts`): every request is timed
into a per-route-key histogram (bounded 500-sample ring — memory-safe).
Route keys normalize ids to `:id` so cardinality cannot explode.
CRITICAL LESSON encoded in the code: Express REBASES `req.path` while
routing descends into routers, so the path must be captured synchronously
from immutable `req.originalUrl` BEFORE the response finishes — reading it
in the `finish` handler yields router-relative fragments (`/register`).
`GET /api/v1/ops/metrics` (Owner/Admin of ANY business, enforced service-side
because the view is process-global) returns uptime, RSS/heap, DB state,
Sentry config status and p50/p95/p99 per route + overall. `/health`,
`/ready` are exempt from tracking.

**Sync KPI** (`GET /api/v1/sync/stats`): windowed aggregation over the
Phase 10 SyncEvent ledger — per-direction (PUSH/PULL/RESTORE) event counts
by status, op-level mutation success ratio (ok/(ok+conflict+failed)),
overall rate, and the 5 most recent FAILED/PARTIAL events with errors.
RBAC mirrors the reports matrix at route AND service level; outsiders get
plain 404. Uses the existing `{businessId, createdAt:-1}` index.

**Sentry**: `@sentry/node` installed; initialized ONLY when `SENTRY_DSN`
is set (lazy dynamic import → zero overhead without credentials, which are
BLOCKED externally). Global crash handlers log structured traces and
forward to Sentry when configured.

**Compression**: `compression` middleware mounted after helmet — gzip for
JSON reports/delta-sync payloads (PRD low-data requirement).

### Performance findings (measured, not guessed)

- 5,000-product catalog: name/SKU/no-match searches, deep pagination and
  low-stock filter all hold **p50 ≈ 60–90ms** against the local replica set
  — comfortably inside the 500ms budget thanks to the reviewed indexes.
- Engineering fix applied to the GATE itself: latency budgets are now a
  dedicated sequential lane (`npm run test:perf`, wired into CI after the
  parallel suite) because running them beside ~20 parallel mongod instances
  produced CPU-contention tail spikes (p95 648–735ms with p50 still ~65ms)
  that measure machine load, not application latency.

### Tests (+24 new; none weakened)

| File | Coverage |
|---|---|
| `test/monitoring.test.ts` (10) | redaction units (Mongo/PG creds, Bearer, JWT-shape, email, hex); route-key normalization bounds; ops metrics 401/403(plain user)/403(Salesperson membership)/200 Owner shape; traffic appears with count+errors+p95; `/health` proven exempt |
| `test/sync-stats.test.ts` (6) | deterministic KPI math (per-direction events/status/op-ratios/overall rate); since-window exclusion via raw-collection backdate (createdAt is immutable through Mongoose — documented); Viewer 403; outsider 404 no-leakage; malformed `since` 400; unauth 401 |
| `test/indexes.test.ts` (6) | pins 13 critical compound/unique indexes across SyncEvent, JournalEntry, Product, StockMovement, Sale, Purchase, Payment, Expense, AuditLog, BusinessMembership |
| `test/performance/core-reads.check.ts` (1) | 8 core reads × 30 samples @300 products, p95<500ms |
| `test/performance/catalog-search-5k.check.ts` (1) | 5,000-product catalog: list/deep-page/name-prefix/brand+kind/SKU/no-match/lowStock ×15 samples, p95<500ms |

Final gates: **backend 660/660** (638 baseline + 22 suite tests + perf moved
to its own lane) · **perf lane 2/2** · **Atlas 39/39** · **mobile tsc 0**
· **lint 0 errors** · **secret scan clean** · **npm audit high-level pass**.

### Security posture (Phase 14 additions)

- Logs can no longer leak credentials/PII (enforced by transform + tests).
- Ops surface is Owner/Admin-gated and exposes counters only — no tenant data.
- Sync KPI follows the established tenant-isolation contract (outsider 404).
- Env var inventory documented; production boot gate from Phase 13 unchanged.
- Encryption review: TLS everywhere in transit (Atlas TLS-only default,
  Render HTTPS + app-level redirect), bcrypt password hashing, refresh/reset
  tokens stored as SHA-256 hashes, mobile tokens in expo-secure-store,
  integer-paisa money, immutable audit trail. Local SQLite remains
  device-encrypted-at-rest by OS defaults — full at-rest encryption of the
  local DB is an OPTIONAL future hardening.
- External penetration test: BLOCKED (vendor engagement) — automated
  coverage: JWT attacks, RBAC matrix, tenant/shop isolation, $operator
  sanitization, regex-injection escaping, malformed ids, strict schemas,
  idempotency races, rollback proofs.

### Acceptance criteria status

- [ ] Monitoring active in production — **BLOCKED**: requires Render deploy
      (external account) + Sentry DSN; all wiring complete and tested locally.
- [x] Performance targets met (p95 < 500ms verified incl. 5,000-product search)
- [x] Security audit passed (automated lanes; external pentest BLOCKED)
- [ ] Crash-free rate ≥ 99% — **BLOCKED**: measurable only after real-device rollout (EAS build external)

## Status
- [ ] Not started
- [x] In progress → implementation complete; production observability activates on deploy
- [ ] Incomplete — remaining items are external-account dependencies
