# Phase 13 — Testing, CI/CD & Deployment

## Objective
Establish comprehensive automated testing, CI/CD pipeline, and deployment to staging/production.

## Why This Phase Exists
The PRD requires `npm ci`, typecheck, lint, test, and `npm audit --audit-level=high` on every PR. Zero high/critical vulnerabilities before every release.

## Dependencies
- All phases (testing is integrated from Phase 02 onward)
- Deployment after Phase 05 at minimum

---

## Phase 13 REPORT (2026-08-24) — IMPLEMENTATION COMPLETE

> **Recovery audit first.** The repository had ZERO CI/deployment
> infrastructure: no `.github/workflows`, no Dependabot, no render/railway/
> EAS configs, no linter, no graceful shutdown, no HTTPS enforcement, and
> production boot accepted well-known dev JWT secrets. What ALREADY existed
> and was preserved unchanged: the 600-test suite covering every endpoint,
> security coverage spread across all suites (401/RBAC/isolation/strict-
> schema/idempotency/rollback), the safety-guarded real-Atlas harness
> (`business_os_api_test`, masked URIs, no destructive ops), `/health` +
> `/ready` with truthful DB semantics, Zod env validation, connection
> singleton + URI masking, CORS allowlist/helmet/sanitize/rate-limit.
> No concurrent agents were active; working tree started clean at `a4d6954`.

### Baseline gate (before any change)

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm test` | 600/600 pass, 0 failed, 0 skipped, normal exit |
| `npm run test:atlas` | 39/39 pass |
| mobile `npx tsc --noEmit` | 0 errors |

### Real bugs found & fixed (regression tests included)

1. **Injection robustness** — `GET /api/v1/products?search[$ne]=` reached
   `escapeRegExp()` with a non-string after mongoSanitize stripped `$`
   keys → **500**. Fixed by string-coercion guard in
   `product.service.listProducts`; covered by
   `security-audit.test.ts` ($operator probe).
2. **Malformed ObjectId → 500** — `GET /products/:id` with a non-hex id
   surfaced a Mongoose CastError as INTERNAL_ERROR instead of the 404
   contract used everywhere else. Added the same
   `Types.ObjectId.isValid` guard used by `getPurchase`; covered in
   `security-audit.test.ts`.
3. **Dead shop-pin variable** — `inventory.service.listStock` computed an
   `effectiveShopId` pin that was never applied (products are
   business-scoped by design). Removed dead code, kept the membership
   404 guard, documented the invariant.

### Testing added (+38 tests, none weakened)

| New file | Coverage |
|---|---|
| `test/security-audit.test.ts` (17) | consolidated SECURITY lane: expired/tampered/wrong-secret/malformed JWTs → 401 without leakage; full **7-role matrix** against three distinct route gates driven from the route matrices; tenant isolation 404 probes across products/customers/sales/accounts; foreign-document 404 with zero data echo; cross-shop sale invisibility; client `deviceId` rejected by strict schema; client-supplied `total`/`taxAmount`/`costPrice` rejected; fractional paisa rejected; `$operator` sanitization; regex-metacharacter search safety; malformed ObjectId → 4xx never 500 |
| `test/journal-property.test.ts` (1) | PROPERTY-BASED ledger balance: seeded mulberry32 PRNG drives 12 reproducible randomized scenarios (sales/purchases/payments/expenses through real HTTP); after EVERY applied op every journal entry must satisfy Σdebit===Σcredit; final trial-balance must agree (balanced=true, debits===credits) |
| `test/performance.test.ts` (1) | p95 < 500ms budget on 8 core reads over a seeded 300-product catalog (30 samples each) — products list/search/lowStock, dashboard, sales/inventory/receivables reports, trial balance |
| `test/env-security.test.ts` (8) | production env gate: missing Mongo URI, dev-default secrets, secret reuse, wildcard CORS each rejected; complete config passes |
| `test/https.test.ts` (7) | HTTPS redirect middleware: 308 preserving path+query+method, comma-separated X-Forwarded-Proto, /health + /ready exempt, direct traffic untouched |

Final suite: **638/638 pass, 0 failed, 0 skipped, normal process
termination** (600 baseline preserved + 38 added).

### Server hardening

- **Production env gate** (`config/env.ts`): `productionEnvIssues()` pure
  function + `loadEnv()` enforcement (§ deployment below). Dev/test
  behavior unchanged.
- **Graceful shutdown** (`index.ts`): SIGTERM/SIGINT → stop accepting
  connections → drain (10s force-exit budget) → disconnect MongoDB →
  exit 0. Required for zero-downtime Render deploys.
- **HTTPS enforcement** (`middleware/https.ts`, mounted only when
  `NODE_ENV=production`): trust proxy + 308 http→https redirect behind
  Render's TLS edge; `/health` + `/ready` always exempt.

### CI/CD

`.github/workflows/ci.yml` (Node 22, npm cache):

```
backend:        npm ci → typecheck → lint → npm test → npm audit --audit-level=high
atlas:          needs backend · guards MONGODB_URI presence (FAILS CLEARLY if unset,
                never silently skips) → npm run test:atlas (business_os_api_test only,
                masked URIs, no destructive operations)
mobile:         npm ci → npx tsc --noEmit
security-scan:  node scripts/security-scan.mjs
```

- `.github/dependabot.yml`: weekly npm updates for `/server` + `/mobile`,
  weekly github-actions updates.
- `npm audit --audit-level=high`: **PASSES** today (0 high/critical;
  2 moderate via exceljs→uuid — no non-breaking fix exists).
- Lint gate adopted per PRD: ESLint 9 flat config (`server/eslint.config.mjs`)
  = typescript-eslint recommended core tuned for this codebase
  (**0 errors**; unused-var warnings tolerated in tests only).
  `npm run lint` wired into CI.

### Secret scanning

`scripts/security-scan.mjs` (zero-dependency): scans git-tracked files for
Mongo/Postgres credential URIs, AWS/GitHub/Slack/Stripe/Google key shapes,
private-key blocks; verifies no `.env` is tracked; NEVER prints matched
values. Current result: **clean (411 files)**. Known scope note: third-party
zip snapshots under `audit/` are excluded (reference-only, never deployed).

### Deployment scaffolding

- **`render.yaml`** (Render Blueprint): staging + production web services
  from one file — `rootDir/server`, `npm ci && npm run build`, `npm start`,
  healthCheckPath `/ready`, autoDeploy on for staging / manual promotion
  for production, generated-per-service JWT secrets, `sync: false` for all
  credentials. ONE deployment system deliberately (Render).
- **Atlas**: separate `business_os_staging` / `business_os` databases with
  least-privilege restricted users; IP allowlist steps; transactions
  supported on Atlas replica sets; test harness stays hard-locked to
  `business_os_api_test`.
- **Mobile/EAS**: `mobile/eas.json` (development / preview=APK internal /
  production=AAB), app identifiers `com.universalbusinessos.mobile`,
  API base URL via `EXPO_PUBLIC_API_URL` (empty placeholder = loud failure,
  documented).

### BLOCKED external dependencies (exact requirements)

| Item | Blocked on |
|---|---|
| Actual staging deploy | Render account; apply blueprint; provide staging `MONGODB_URI` + `CORS_ORIGIN` |
| Actual production deploy | Same + production Atlas database/user + IP allowlist entries |
| CI atlas lane green | Repo secret `MONGODB_URI` (workflow fails loudly until set) |
| EAS Android build / Play Store | Expo account (`eas init`) + real API URL per profile; keystore generated by EAS |

### Acceptance criteria status

- [x] All tests passing locally (CI requires GitHub remote runs — workflow committed)
- [x] `npm audit` clean at high level (zero high/critical)
- [x] Typecheck passes (server + mobile)
- [x] Lint passes (ESLint, 0 errors)
- [ ] Deployed to staging — **BLOCKED** (Render account)
- [ ] Deployed to production — **BLOCKED** (Render account)
- [x] Android APK build configuration ready — actual build **BLOCKED** (Expo account)

## Status
- [ ] Not started
- [x] In progress → code/config COMPLETE; deploys blocked on external accounts
- [ ] Incomplete — Phase completed when all acceptance criteria pass
