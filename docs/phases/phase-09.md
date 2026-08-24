# Phase 09 — Employees, Roles & Devices

## Objective
Implement employee management, role-based access control (RBAC), device registration/revocation, and complete audit logging.

## Why This Phase Exists
The PRD requires multiple users per business with granular permissions, device management with remote revocation, and a complete audit trail.

## Dependencies
- Phase 03 — Business & Shops

## Existing Implementation Status
- ZIP A: devices + audit_logs tables → **REFERENCE**
- ZIP B: role enums → **REFERENCE**
- Server: → **NOT_IMPLEMENTED**

## Status

> **Phase 09 VERIFIED (2026-08-23):** Recovery audit found an interrupted
> Codex session's uncommitted Phase 09 work-in-progress (17 untracked files +
> 4 modified). Baseline recorded first with those tests quarantined:
> 510/510 legacy pass, typechecks 0 errors, real-Atlas 18/18 — matching the
> verified Phase 08 state exactly. The orphan work was then audited, fixed
> and completed rather than rewritten.
>
> **Real bugs found and fixed in the application:**
> 1. `Employee` unique partial index used `$ne`, which MongoDB does NOT
>    support in `partialFilterExpression` — the index silently never built,
>    so duplicate employee phones were accepted (201 instead of 409).
>    Replaced with `$in` of live statuses; index existence + duplicate→409
>    now proven against REAL Atlas (`Employee.syncIndexes` + raw index dump +
>    HTTP 409 assertion).
> 2. `assignRole` wrote the audit row AFTER mutating `employee.role`, so the
>    trail logged `previousRole === newRole`. Fixed by snapshotting before
>    mutation; asserted via ROLE_ASSIGNED details in Atlas.
> 3. Business creation/update wrote no audit rows at all. Added additive
>    `BUSINESS_CREATED` / `BUSINESS_UPDATED` audit writes (spec: "audit log
>    covers all sensitive actions").
>
> **Bugs fixed in the recovered tests** (application was correct): helpers
> read `staff.phone` from the register response whose verified Phase 02
> contract nests profile under `data.user` → flattened helper return;
> unknown-phone invites write `EMPLOYEE_INVITED` (not CREATED) so filter/
> pagination assertions updated; signup already registers the caller's
> Device row, so POST /devices is the idempotent business-link (200 +
> `duplicate:true`) — revoke test strengthened to require ≥1 live refresh
> token BEFORE revocation (real session kill, previously vacuous ≥0).
>
> Backend: Employee model (businessId/shopId/userId/name/phone/role/status,
> soft-REMOVED history behind a partial unique {businessId,phone}), role &
> permission matrix config (`config/roles.ts`, 7 PRD roles × 17 permissions),
> employee service (invite-by-phone links existing accounts + syncs
> BusinessMembership; Manager manages staff but only Owner/Admin assign
> roles/suspend/remove; Owner immutable; shop-pinned members locked to their
> shop), device service (register = own-device only, userId from token;
> Owner/Admin/Manager list/revoke; revoke terminates ALL live refresh tokens
> for that device doc; owner-only sync heartbeat), audit read service
> (Owner/Admin/Manager/Accountant; action/from/to filters + pagination +
> actor-name join; shop pinning enforced). Routes mounted with requireAuth +
> resolveBusiness + route-level requireRole AND service-level re-checks;
> `.strict()` Zod schemas reject spoofed server-owned fields (userId etc.);
> malformed ids 404; cross-tenant 404 with zero side effects.
>
> Mobile: new Team hub (Settings → Team) with Employees (list/add/edit/
> remove, role+shop pickers, status badges, load-more pagination), Roles
> (server-authoritative matrix + assign flow), Devices (status, lastSync,
> revoke, own-device sync heartbeat), Audit (action filter + pagination +
> actor names). bn/en i18n added for every string (parity maintained);
> mobile typecheck 0 errors; no client-computed business values.
>
> Real Atlas verification (`business_os_api_test` only, masked URIs,
> assertOnTestDb guard): 24/24 pass — 18 baseline preserved + 6 new Phase 09
> tests covering index existence ($in filter dumped from Atlas), invite →
> ACTIVE + membership-with-expanded-permissions + EMPLOYEE_CREATED audit,
> INVITED path with zero membership side effects, duplicate-phone 409 ON
> REAL MONGODB, same phone OK in another business (business-scoped
> uniqueness), Manager blocked / Owner assigns / membership follows /
> extra permission persisted / ROLE_ASSIGNED previousRole≠newRole, device
> register-link + revoke killing live refresh tokens + idempotent re-revoke
> + DEVICE_REVOKED audit + non-owner/revoked sync both 403, and GET /audit
> over real rows (pagination envelope, action filter, Salesperson 403,
> foreign-owner 404, shop-pinned Manager cannot widen scope, invalid date
> 400, BUSINESS_CREATED present).
>
> Full suite 540/540 (510 baseline preserved + 30 Phase 09 unit/integration
> tests), npm test exits 0 (~49 s, normal termination), backend typecheck
> 0 errors, mobile typecheck 0 errors.
> Known limitations: no per-permission UI gating beyond server enforcement
> (server remains authoritative), device "sync" heartbeat is manual until
> Phase 10 wires automatic sync, OTP-based invites out of scope (phone
> linking happens on registration match).

## Tasks

### Database

- [x] Create Employee model (businessId, shopId, userId, name, phone, role, status)
- [x] Create Role/Permission model → deliberate deviation: server-authoritative matrix in `config/roles.ts`; custom grants persist on BusinessMembership.permissions (matches existing membership architecture)
- [x] Update Device model (businessId, shopId, deviceName, deviceId, userPhone→via user join, appVersion, lastSyncAt, status)
- [x] Update AuditLog model (businessId, shopId, action, userPhone→actor join, details, recordId)

### Backend

- [x] Employee service (CRUD + invite)
- [x] Role/permission service
- [x] Device service (register, revoke, list, lastSync)
- [x] Audit service (log sensitive actions)
- [x] RBAC middleware on all routes (+ service-level re-checks)
- [x] Shop-level permission enforcement

### API

- [x] `GET/POST/PUT/DELETE /api/v1/employees`
- [x] `GET/POST /api/v1/roles`
- [x] `GET/POST /api/v1/devices`
- [x] `PUT /api/v1/devices/:id/revoke`
- [x] `GET /api/v1/audit`
- [x] bonus: `PUT /api/v1/devices/:id/sync` (sync heartbeat, Phase 10 groundwork)

### Mobile

- [x] Employee list + add/edit screens
- [x] Role assignment screen
- [x] Device list screen
- [x] Revoke device action
- [x] Audit log screen
- [x] Sync status per device

### Testing

- [x] Employee CRUD tests
- [x] Role permission tests
- [x] Device register/revoke tests
- [x] Audit log coverage tests
- [x] RBAC enforcement tests (Salesperson cannot view profit — covered by Phase 07/08 suites; Salesperson/Viewer denied employees/devices/audit here)

## Acceptance Criteria

- [x] Employees can be added with roles
- [x] RBAC permissions enforced on all routes
- [x] Devices registered and revocable remotely
- [x] Audit log covers all sensitive actions
- [x] Financial records voided, never deleted (Phase 05–07 engines untouched)
- [x] Tests passing (540/540 + 24/24 real-Atlas)

## Status
- [ ] Not started
- [ ] In progress
- [x] Incomplete — Phase completed when all acceptance criteria pass
