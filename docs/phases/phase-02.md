# Phase 02 — Authentication & Security

## Objective
Implement full authentication (register, login, refresh token rotation, logout, OTP, forgot password) with JWT-based security, RBAC, rate limiting, and validation.

## Why This Phase Exists
The PRD requires secure authentication with JWT access (15min) + refresh (30d, rotated) tokens, bcrypt hashing, account lockout, device auth, and Zod validation on every route. No auth existed in any codebase.

## Dependencies
- Phase 01 — Foundation & Project Setup

## Existing Implementation Status
- `mobile/src/auth.tsx` — auth context exists but referenced missing API → **FIXED (secure-store backed)**
- `mobile/screens/Login.tsx` — login UI exists → **FIXED (email auth)**
- `mobile/screens/Register.tsx` — register UI exists → **FIXED (email synthesized from phone)**
- Server auth → **COMPLETE & VERIFIED**
- ZIP A has jwt/bcrypt libs but no real auth → **REFERENCE ONLY**

## Tasks

### Database
- [x] Create User model (name, phone, email, passwordHash, status, failedAttempts, lockoutUntil) — `server/src/models/User.ts`
- [x] Create RefreshToken model (userId, tokenHash, expiresAt, revokedAt, replacedByTokenHash) — `server/src/models/RefreshToken.ts`
- [x] Create Device model — `server/src/models/Device.ts`
- [x] Create BusinessMembership model — `server/src/models/BusinessMembership.ts`
- [x] Create AuditLog model — `server/src/models/AuditLog.ts`
- [x] Add indexes: User.email/phone unique, RefreshToken.tokenHash + userId + expiresAt

### Backend
- [x] Create auth service (`server/src/services/auth.service.ts`)
- [x] Create auth controller (`server/src/controllers/auth.controller.ts`)
- [x] Create auth routes (`server/src/routes/auth.routes.ts`)
- [x] Register: create user + session/device foundation (business is created explicitly during onboarding — POST /api/v1/businesses auto-creates the Owner membership server-side)
- [x] Login: verify credentials, check lockout, issue tokens
- [x] Refresh: rotate refresh token, reuse detection (revoke all on reuse)
- [x] Logout: revoke refresh token (server-side)
- [x] Logout-all server endpoint — implemented (`POST /api/v1/auth/logout-all`, `requireAuth`)
- [ ] Per-device logout-all UI in mobile — deferred (client-side clear only)
- [x] Forgot password: generate secure hashed token (single-use, 30-min expiry)
- [x] Reset password: consume hashed token, update hash, invalidate sessions
- [x] Password hashing with bcrypt (cost ≥ 10)
- [x] JWT access token (15 min)
- [x] Refresh token (30 days) stored hashed (SHA-256)
- [x] Account lockout: 5 failed attempts → lock
- [x] Zod validation on all auth routes
- [x] Error responses hide PII

### API
- [x] `POST /api/v1/auth/register`
- [x] `POST /api/v1/auth/login`
- [x] `POST /api/v1/auth/refresh`
- [x] `POST /api/v1/auth/logout`
- [x] `POST /api/v1/auth/forgot-password`
- [x] `POST /api/v1/auth/reset-password`
- [x] `GET /api/v1/auth/me`
- [x] `POST /api/v1/auth/logout-all` — served at `/api/v1/auth/logout-all`

### Mobile
- [x] Secure token storage (expo-secure-store)
- [x] `src/api.ts` — secure-store-backed access/refresh; 401 → refresh → retry-once; clear-on-failure
- [x] `src/auth.tsx` — session restore, login/register/logout wired to `/api/v1/auth/*`
- [x] App routing honors `state === "initializing"` (loading)
- [x] Login screen wired to API
- [x] Register screen wired to API
- [x] Logout clears secure storage
- [ ] Forgot-password screen (API only)
- [ ] OTP verification screen (future)

### Security
- [x] JWT middleware (`requireAuth`)
- [x] RBAC middleware (`requireRole` / `requirePermission`)
- [x] Tenant isolation (`resolveBusiness`, `assertShopAccess` — memberships-only, 404 on denial)
- [x] Rate limiting: strict on auth routes + global limiter
- [x] Audit login/register/refresh/failed/lockout
- [x] Tokens in secure-store only
- [x] No PII in logs

### Testing
- [x] Register unit tests (valid/duplicate/invalid/missing)
- [x] Login tests (valid/wrong/unknown/lockout/reset)
- [x] Refresh token rotation + reuse detection
- [x] Logout revocation
- [x] Access token (valid/missing/invalid/expired)
- [x] Cross-tenant isolation (User A → Business B denied)
- [x] RBAC behavioral test
- [x] Zod validation tests
- [ ] Mobile automated auth test — requires device (manual verification pending)

## Acceptance Criteria
- [x] Register creates user + session/device foundation (NO auto-created default Business — onboarding creates it explicitly)
- [x] Explicit Business creation (POST /api/v1/businesses) grants the authenticated user Owner membership automatically
- [x] Login returns access + refresh tokens
- [x] Refresh rotates token; reuse revokes all sessions
- [x] Lockout after 5 failed attempts
- [x] All auth routes validated with Zod
- [x] Rate limiting active
- [x] Tokens in secure-store only
- [x] Tests passing (42: 22 Phase 02 + 20 Phase 03 — register no longer creates a default Business)

## Verification
```
server: npm run typecheck (0 errors) · npm test (42 passed)
mobile: tsc --noEmit (0 errors)
live boot: REGISTER → ME → REFRESH → LOGOUT → REFRESH(401) — all verified
```

## Known Limitations
- **OTP delivery provider:** not integrated — dev/test returns reset token
- **Per-device logout-all mobile UI:** not wired (client only clears local session)
- **Mobile automated auth test:** manual verification required (no device in CI)
- **Rate limiter:** relaxed to 10k/15min when running under `npm test` (test suites share one IP); production/development keep the strict 30/15min limit

## Status

### Verified Complete
- [x] Backend authentication (register/login/refresh/logout/forgot/reset/me)
- [x] JWT access + refresh tokens
- [x] Refresh rotation + reuse detection
- [x] Logout / logout-all (server revokes refresh sessions)
- [x] Password hashing (bcrypt) + account lockout
- [x] RBAC (`requireRole` / `requirePermission`)
- [x] Tenant isolation (`resolveBusiness` / `assertShopAccess`)
- [x] Cross-tenant security test
- [x] Zod validation + auth rate limiting + audit logging
- [x] SecureStore mobile tokens + session restoration + 401→refresh→retry-once
- [x] Backend tests (22/22) · Backend typecheck (0) · Mobile typecheck (0)
- [x] Live backend probe: REGISTER → ME → REFRESH → LOGOUT → REFRESH(401) PASS

### Pending Manual Verification
- [ ] Expo device/emulator runtime verification (no emulator in this environment)

### Deferred (do not mark complete)
- [ ] OTP delivery provider (forgot-password returns hashed reset token; dev/test only)
- [ ] Forgot-password / reset-password mobile UI
- [ ] Real phone-identifier auth flow (mobile UI shows phone field; backend contract is email)

**Phase 02 status: `[ ] IMPLEMENTATION COMPLETE — RUNTIME VERIFICATION PENDING`**
</content>
