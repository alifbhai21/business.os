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

## Tasks

### Database

- [ ] Create Employee model (businessId, shopId, userId, name, phone, role, status)
- [ ] Create Role/Permission model (businessId, role, permissions[])
- [ ] Update Device model (businessId, shopId, deviceName, deviceId, userPhone, appVersion, lastSyncAt, status)
- [ ] Update AuditLog model (businessId, shopId, action, userPhone, details, recordId, branch)

### Backend

- [ ] Employee service (CRUD + invite)
- [ ] Role/permission service
- [ ] Device service (register, revoke, list, lastSync)
- [ ] Audit service (log sensitive actions)
- [ ] RBAC middleware on all routes
- [ ] Shop-level permission enforcement

### API

- [ ] `GET/POST/PUT/DELETE /api/v1/employees`
- [ ] `GET/POST /api/v1/roles`
- [ ] `GET/POST /api/v1/devices`
- [ ] `PUT /api/v1/devices/:id/revoke`
- [ ] `GET /api/v1/audit`

### Mobile

- [ ] Employee list + add/edit screens
- [ ] Role assignment screen
- [ ] Device list screen
- [ ] Revoke device action
- [ ] Audit log screen
- [ ] Sync status per device

### Testing

- [ ] Employee CRUD tests
- [ ] Role permission tests
- [ ] Device register/revoke tests
- [ ] Audit log coverage tests
- [ ] RBAC enforcement tests (Salesperson cannot view profit, etc.)

## Acceptance Criteria

- [ ] Employees can be added with roles
- [ ] RBAC permissions enforced on all routes
- [ ] Devices registered and revocable remotely
- [ ] Audit log covers all sensitive actions
- [ ] Financial records voided, never deleted
- [ ] Tests passing

## Status
- [x] Not started
- [ ] In progress
- [ ] Incomplete — Phase completed when all acceptance criteria pass