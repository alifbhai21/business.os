# Phase 03 — Business & Shops

## Objective
Implement multi-tenant business and multi-shop management with business-type-based module activation and onboarding flow.

## Why This Phase Exists
The PRD requires multi-tenant isolation (User → Business → Shop), business types with module activation, and a short onboarding flow for non-technical owners.

## Dependencies
- Phase 02 — Authentication & Security

## Existing Implementation Status
- ZIP A: businesses, shops, memberships tables exist → **REFERENCE**
- ZIP B: businesses, shops tables exist → **REFERENCE**
- Server: → **COMPLETE & VERIFIED**

## Onboarding Architecture (Register → Business Setup → Shop Setup)

- Register (`POST /api/v1/auth/register`) creates the **account/auth foundation only**: User, session, device. It does **NOT** create a default Business (`businessId: null` in the response).
- Business Setup (`POST /api/v1/businesses`) creates the **user's real Business**; the server derives the user from the access token and auto-creates an **Owner** membership (no client-provided ownerId/role).
- Shop Setup (`POST /api/v1/shops`) creates the **first Shop** under the active Business.
- Existing users with businesses are untouched; no migration or data deletion involved.

## Tasks

### Database

- [x] Create Business model (name, type, currency, taxRate, fiscalYear, allowNegativeStock, logo, address, phone, email)
- [x] Create Shop model (name, branchCode, address, phone, isWarehouse, openingCash, manager)
- [x] Create Membership model (userId, businessId, shopId, role) — reused from Phase 02
- [x] Add indexes: Shop.businessId, Shop.businessId+branchCode (unique), Membership.userId+businessId

### Backend

- [x] Create business service
- [x] Create business controller
- [x] Create business routes (`/api/v1/businesses`)
- [x] Create shop service
- [x] Create shop controller
- [x] Create shop routes (`/api/v1/shops`)
- [x] Business type enum (PRD §8.2 — 10 types)
- [x] Module activation map (MODULES_BY_TYPE)
- [x] Business-scoped middleware (`requireBusiness`/membership-scoped services)
- [x] Shop-scoped middleware / tenant scoping in services
- [x] `assertOwnership`/membership check on all business/shop routes

### API

- [x] `GET/POST /api/v1/businesses`
- [x] `PUT /api/v1/businesses/:id`
- [x] `GET /api/v1/businesses/:id/modules`
- [x] `GET/POST /api/v1/shops`
- [x] `PUT /api/v1/shops/:id`
- [x] `GET /api/v1/shops/:id`

### Mobile

- [x] Create Business screen
- [x] Create Shop setup screen
- [x] Create Business type selection (10 types)
- [x] Create Multi-shop switching (shop selector in header)
- [x] Onboarding flow: Welcome → Register (account only) → Business Setup (explicit creation + Owner membership) → Shop Setup → Dashboard
- [x] Business settings screen (currency, tax, fiscal year)
- [x] Shop management screen
- [ ] Onboarding flow runtime verification (pending — no emulator/device available)

### Testing

- [x] Business CRUD tests
- [x] Shop CRUD tests
- [x] Multi-tenant isolation tests (user A cannot access user B's business)
- [x] Module activation tests
- [x] Shop scoping tests
- [x] Duplicate branch code → 409 conflict (was generic 500; minimal backend fix)
- [x] Onboarding chain test: register (no default business) → explicit business (Owner) → first shop
- [ ] Onboarding flow integration test (mobile runtime verification pending)

## Acceptance Criteria

- [x] Business creation works
- [x] Multiple shops per business
- [x] Business + shop scoping enforced on all routes
- [x] Module activation by business type works
- [x] Onboarding flow complete (mobile implementation complete; runtime verification pending)
- [x] Tests passing (42 total: 22 Phase 02 + 20 Phase 03 — includes register-no-default-business and onboarding chain tests)

## Testing
Run: `cd server && npm run typecheck && npm test`

**Verified:** `npm run typecheck` → 0 errors · `npm test` → 42/42 passing (22 Phase 02 + 20 Phase 03), 0 failures.

## Expected Output
- Multi-tenant business/shop API ✅
- Mobile onboarding flow ✅ (implementation complete — runtime verification pending)
- Shop switching in app ✅ (implementation complete — runtime verification pending)

## Status
- [x] Not started
- [x] In progress
- [ ] **PHASE 03 — MOBILE IMPLEMENTATION COMPLETE / RUNTIME VERIFICATION PENDING**
