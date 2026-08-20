# Business OS (ব্যবসা ওএস)

**Universal Business OS** — mobile-first, offline-capable business management system for small and medium businesses in Bangladesh. Sell, buy, track stock, manage customers, dues, expenses, and profit from one app — even without internet.

---

## Target Architecture

```
📱 React Native + Expo (Android-first)
        ↓
Local SQLite (offline-first)
        ↓
Sync Queue (push/pull)
        ↓
Node.js + Express API (TypeScript)
        ↓
MongoDB Atlas
```

## Canonical Repository Structure

```
d:/business-os/
├── mobile/     Expo React Native app (Android-first)
├── server/     Node.js + Express + Mongoose API
├── docs/       Audit reports, roadmap, tracker, phase plans
├── audit/      ZIP A/B extracted as reference (read-only)
└── business-os/ Legacy duplicate of root mobile/ + server/ (preserved as reference, git-excluded)
```

> ⚠️ The `business-os/` directory is a **legacy duplicate** of the root `mobile/` + `server/` directories. It is preserved on disk for reference but is **excluded from git** and should not be modified. The **root** `mobile/` and `server/` directories are canonical.

---

## Phase 1 (verified) — Foundation

- ✅ Server: Express + TypeScript + Mongoose scaffold
- ✅ Server: middleware stack (helmet, CORS, rate-limit, mongo-sanitize, error handler, Winston logging)
- ✅ Server: `/health` + `/ready` endpoints
- ✅ Server: Zod-validated env config
- ✅ Server: in-memory MongoDB fallback when no `DATABASE_URL` is set
- ✅ Server: test framework (`node:test` + `tsx` + `supertest` + `mongodb-memory-server`)
- ✅ Mobile: fixed broken imports (`src/api.ts`, `src/theme.ts`, `src/i18n/dictionaries.ts`)
- ✅ Mobile: TypeScript compiles clean (`tsc --noEmit`)
- ✅ Git: `.gitignore`, `.env.example`

### Phase 2 (verified) — Authentication & Security
- ✅ JWT access (15m) + refresh (30d) token rotation with reuse detection
- ✅ bcrypt hashing, account lockout (5 → LOCKED), Zod validation on every route
- ✅ RBAC (`requireRole`/`requirePermission`) + tenant isolation (`resolveBusiness`/`assertShopAccess`)
- ✅ Cross-tenant security test, auth rate limiting, audit logging
- ✅ SecureStore-backed mobile tokens, session restore, 401 → refresh → retry-once
- ✅ Backend tests 22/22 · Backend typecheck 0 · Mobile typecheck 0

#### Auth API (implemented)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Create user + initial business + Owner membership + device; returns access+refresh |
| POST | `/api/v1/auth/login` | Verify email+password, lockout check, issue token pair |
| POST | `/api/v1/auth/refresh` | Rotate refresh token; reuse of a revoked token revokes ALL sessions |
| POST | `/api/v1/auth/logout` | Revoke the presented refresh token |
| POST | `/api/v1/auth/logout-all` | Revoke all refresh sessions for the authenticated user |
| POST | `/api/v1/auth/forgot-password` | Issue a hashed, expiring reset token (single-use) |
| POST | `/api/v1/auth/reset-password` | Consume reset token, change password, invalidate sessions |
| GET  | `/api/v1/auth/me` | Current user + active memberships (Bearer token) |

#### Token model
- **Access token:** JWT, 15 min, claims `sub/userId · deviceId · sessionId` — stored in SecureStore.
- **Refresh token:** 30 days, **stored hashed (SHA-256)** only; rotated on every refresh; **reuse detection revokes all sessions**.
- **Logout / revocation:** refresh tokens are revoked server-side (never merely client-deleted).

#### Authorization model
- **RBAC:** roles Owner/Admin/Manager/Accountant/Salesperson/Inventory Manager/Viewer resolved from `BusinessMembership` — never from client input.
- **Tenant isolation:** `resolveTenant` + `assertShopAccess` scope every request by the authenticated membership; cross-business access returns 404 (no existence leak).

#### Auth environment variables (`server/.env.example`)
`JWT_ACCESS_SECRET` · `JWT_REFRESH_SECRET` · `JWT_ACCESS_EXPIRES_IN` (15m) · `JWT_REFRESH_EXPIRES_IN` (30d) · `AUTH_MAX_LOGIN_ATTEMPTS` (5) · `AUTH_LOCKOUT_MINUTES` (15)

#### Known limitations (deferred, not production-ready)
- **OTP delivery provider** — not integrated; forgot-password returns a hashed reset token (dev/test only).
- **Phone-auth contract** — the mobile UI shows a phone field but the backend authenticates by email (Phase 02 contract). A real phone-identifier flow is a future enhancement; not changed during finalization.
- **Runtime mobile verification** — emulator/device runtime test of the app auth flow is **pending** (no emulator in this environment).

## Server

```bash
cd server
cp .env.example .env   # optional — in-memory MongoDB works with zero config
npm install
npm run dev            # starts on :4000
```

Endpoints:

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness — always 200 when running |
| GET | `/ready` | Readiness — 200 when Mongo connected, else 503 |

Run tests:

```bash
cd server
npm run typecheck
npm test
```

## Mobile app

```bash
cd mobile
npm install
npm start              # press `a` for Android
```

- API base URL is configured in `src/api.ts` (Android emulator → `http://10.0.2.2:4000`, configurable via `EXPO_PUBLIC_API_URL`).

```bash
cd mobile
node node_modules/typescript/bin/tsc --noEmit   # typecheck
```

---

## Documentation

| File | Purpose |
|---|---|
| `docs/ZIP_COMPARISON.md` | ZIP A vs ZIP B full audit |
| `docs/PRD_GAP_ANALYSIS.md` | PRD requirement-by-requirement gap analysis |
| `docs/DEVELOPMENT_ROADMAP.md` | 15 development phases |
| `docs/PROJECT_TRACKER.md` | Master checkbox tracker |
| `docs/phases/phase-01.md` … `phase-15.md` | Individual phase plans |

## Roadmap

1. 🔄 **Phase 01 — Foundation** (in progress)
2. ⏳ Phase 02 — Authentication & Security
3. ⏳ Phase 03 — Business & Shops
4. ⏳ Phase 04 — Products, Customers & Suppliers
5. ⏳ Phase 05 — Sales, Purchases & Payments
6. ⏳ Phase 06 — Inventory, Returns & Transfers
7. ⏳ Phase 07 — Double-Entry Accounting
8. ⏳ Phase 08 — Dashboard & Reports
9. ⏳ Phase 09 — Employees, Roles & Devices
10. ⏳ Phase 10 — Offline SQLite & Sync
11. ⏳ Phase 11 — Backup & Restore
12. ⏳ Phase 12 — Enhancements
13. ⏳ Phase 13 — Testing, CI/CD & Deployment
14. ⏳ Phase 14 — Production Hardening
15. ⏳ Phase 15 — Future