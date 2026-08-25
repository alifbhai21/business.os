# Business OS — Playwright E2E Audit Report

**Generated:** 25 Aug 2026 · **Mode:** REAL end-to-end testing via Playwright (headed Chromium) on the local PC against the real Business OS app, real backend, and real MongoDB Atlas.

---

## 1. Test Environment

| Item | Value |
|------|-------|
| OS | Windows (win32), local machine |
| Frontend | Expo React Native Web (`mobile/App.tsx`) – live at `http://localhost:8083` |
| Backend | Express + Mongoose (`server/src/index.ts`) – live at `http://localhost:4000` |
| Backend runtime mode | `NODE_ENV=test`, `RATE_LIMIT_MAX=100000` (restarted for the suite; see §13/§15) |
| Database | MongoDB Atlas (`cluster12.ebqvhhb.mongodb.net`) – live app DB **`test`** |
| API base URL (frontend) | `http://localhost:4000` (`mobile/src/api.ts`) |
| Credentials | Runtime-generated **isolated** E2E account, created through the real registration flow (random password, never printed/committed) |
| Postman collection | `docs/api/postman/business-os-api.postman_collection.json` (referenced; not required for these tests) |

## 2. Browser Used

- **Chromium** via Playwright (`@playwright/test ^1.62.1`), **headed** (visible window on this PC).
- Viewport `1280×860`, `slowMo: 220ms` so actions are observable.
- `video`, `trace`, `screenshot` captured on failure (in `e2e/test-results/`).
- A final **visible-browser hold** session (`e2e/final-visual.mjs`) opened the app, logged in through the real UI and kept the Dashboard open for inspection; screenshot saved to `e2e/artifacts/final-dashboard.png`.

## 3. Frontend URL

`http://localhost:8083` (Expo Web dev server; returned 200 throughout)

## 4. Backend URL

`http://localhost:4000` (`/health` and `/ready` → 200)

## 5. Playwright Version

`@playwright/test 1.62.1` (installed in `D:\business-os\e2e\node_modules\@playwright\test`; Chromium cached in `%LOCALAPPDATA%\ms-playwright`).

## 6. Tests Executed (13/13 PASS)

| # | Spec | Test | Result |
|---|-----|------|--------|
| 1 | 01-register | register page opens from welcome | ✅ PASS |
| 2 | 01-register | register via UI → API 201 → MongoDB user/device/token/audit verified | ✅ PASS |
| 3 | 01-register | business setup via UI → API 201 → MongoDB business+membership verified | ✅ PASS |
| 4 | 01-register | shop setup via UI → API 201 → MongoDB shop verified → Dashboard loads | ✅ PASS |
| 5 | 01-register | logout via Settings clears local session and revokes refresh token | ✅ PASS |
| 6 | 02-login | login page renders with phone+password fields | ✅ PASS |
| 7 | 02-login | wrong password is rejected with HTTP 401 and UI error | ✅ PASS |
| 8 | 02-login | real login → HTTP 200 → tokens stored → Dashboard rendered | ✅ PASS |
| 9 | 03-auth | dashboard loads server-authoritative figures (GET /dashboard 200) | ✅ PASS |
| 10 | 03-auth | create product via UI → POST /products → MongoDB products verified | ✅ PASS |
| 11 | 03-auth | create customer via UI → POST /customers → MongoDB customers verified | ✅ PASS |
| 12 | 03-auth | suppliers read-only list loads via authenticated API | ✅ PASS |
| 13 | 04-logout | logout → refresh token revoked in MongoDB → protected state enforced | ✅ PASS |
## 7. Browser Actions Observed

1. Chromium window opened → `http://localhost:8083`
2. Welcome screen rendered (app name visible)
3. Register flow: filled Name/Phone/Password → clicked Register → Business Setup screen
4. Business Setup: filled business name → created business → Shop Setup
5. Shop Setup: filled shop name + branch code → created shop → **Home/Dashboard rendered**
6. Login flow (from Welcome): filled phone + password → clicked Login → authenticated → Dashboard
7. Wrong-password control: filled phone + wrong password → HTTP 401 + UI error banner
8. Products tab → modal form → filled name/prices/stock → saved → product row visible in list
9. Parties/Customers tab → modal form → filled name → saved → customer row visible
10. Logout via Settings → returned to Welcome → **reload stays logged out** (protected route enforced)

## 8. API Requests Observed (sample of the real network capture)

| Method | Path | Status | Auth | Notes |
|--------|------|--------|------|-------|
| POST | /api/v1/auth/register | 201 | absent | created user+device+session |
| POST | /api/v1/auth/login | 200 | absent | correct creds |
| POST | /api/v1/auth/login | 401 | absent | wrong password (negative) |
| POST | /api/v1/businesses | 201 | present | business + Owner membership |
| GET | /api/v1/businesses | 200 | present | tenant list |
| GET | /api/v1/shops | 200 | present | shop list |
| GET | /api/v1/sync/restore, /api/v1/sync/pull | 200 | present | offline sync |
| GET | /api/v1/businesses/:id/modules | 200 | present | modules per business |
| GET | /api/v1/dashboard | 200 | present | dashboard totals (called repeatedly by UI polling) |
| GET | /api/v1/units, /api/v1/categories | 200 | present | catalog context |
| GET | /api/v1/products | 200 | present | product list |
| POST | /api/v1/products | 201 | present | product created via UI |
| GET | /api/v1/suppliers | 200 | present | suppliers list |
| GET | /api/v1/customers | 200 | present | customer list |
| POST | /api/v1/customers | 201 | present | customer created via UI |
| POST | /api/v1/auth/logout | 200 | absent | revokes current session |

(Full per-run capture in the terminal; the final regression log shows 11–26 API records per test file. Tokens were never logged.)

## 9. HTTP Results

1. `POST /auth/login` → **200** (correct creds; ~450–560ms) and **401** (wrong password)
2. `POST /auth/register` → **201**
3. `POST /businesses`, `POST /shops`, `POST /products`, `POST /customers` → **201**
4. All authenticated `GET` routes → **200** with `Authorization: Bearer` present
5. `POST /auth/logout` → **200**
6. No `5xx` errors observed for the app during the final regression.
## 10. MongoDB Verification Results (live app DB `test` via `server/.env`)

| Collection | Verification | Result |
|-----------|--------------|--------|
| users | register created ACTIVE user; login updated `lastLoginAt` and reset `failedLoginAttempts` | ✅ |
| devices | 1 device linked at signup; device re-linked on each login | ✅ |
| refreshtokens | active session per login; logout **revokes the presented session**; issuance matches device | ✅ |
| auditlogs | `REGISTER`, `DEVICE_REGISTERED`, `LOGIN_SUCCESS`, `LOGIN_FAILED` (wrong pw), `LOGOUT` all recorded | ✅ |
| businesses | created with correct name | ✅ |
| businessmemberships | exactly 1 membership → role `Owner`, status `ACTIVE` | ✅ |
| shops | 1 shop created with branch code | ✅ |
| products | 1 product created via UI present | ✅ |
| customers | 1 customer created via UI present | ✅ |

Final relationship chain (from `e2e/helpers/final-verify.mjs`) for the seeded E2E account:
`user(ACTIVE) → businessmembership(role=Owner,status=ACTIVE) → business (E2E Test Business …) with shops=1, products=1, customers=1`, plus refreshtokens=11 (2 revoked) and audit trail `…LOGIN_SUCCESS, DEVICE_REGISTERED, LOGOUT…`.

> **MCP note:** the MongoDB Atlas MCP is connected to database **`business_os_api_test`** (the repo’s dedicated Atlas *test-harness* DB), while the running app uses database **`test`** (from `server/.env` MONGODB_URI). MCP therefore cannot directly observe the live-flow documents. The e2e `mongo.ts` helper uses the **same URI as the app** and was the authoritative live-DB check for every step. See §19.

## 11. Failed Tests During the Audit (root causes)

All failures were **test-harness issues** — not application defects. Each was diagnosed via the Phase-9 failure-investigation order (browser → console → network → HTTP → payload → backend → DB → env).

| Failure | Root cause | Classification |
|--------|-----------|----------------|
| `getByRole('button')` timeouts (register/login/save) | react-native-web renders `Pressable` as a `<div>` with **no `role=button`** | test issue (locator strategy) |
| Register POST never observed after click | `waitForRequest` attached **after** the click → race | test issue |
| Business role expected `OWNER`, DB has `Owner` | data model uses title-case roles (`BusinessMembership.Roles`) | test assertion bug |
| Dashboard record `status=undefined` after visible | Dashboard card text renders before API response; synchronous assert | test timing bug |
| JWT `expect.toMatch(/^ey\./)` failed | real JWTs start `eyJ…` | test assertion bug |
| Product price field strict-mode violated | `getByPlaceholder("ক্রয় মূল্য")` is a substring of `বিক্রয় মূল্য` | test locator bug |
| Logout expected all tokens revoked | `POST /logout` revokes **only the presented session** (by design; `logoutAll` revokes all) | test assertion bug |
| Full-suite collection error on `state.json` | `02/03` read `.runtime/state.json` at module load; Playwright imports all files before `01` writes it | test harness structure |
| Wrong-password 401 flaky in full suite | worker-scoped `records` array polluted by prior test files | test harness pollution |
| Login `429` in full suite | **anti-brute-force auth limiter** (30 req/15 min in `development`) exceeded by accumulated test logins; also global limiter 100/min hit by dashboard polling | environment/config (rate limit for CI-style runs) |