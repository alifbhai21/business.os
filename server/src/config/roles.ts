/**
 * Phase 09 — Role & permission matrix (PRD §roles).
 *
 * The seven PRD roles live on BusinessMembership.role; this config is the
 * server-authoritative definition of what each role may do. `GET /roles`
 * serves this matrix; `requirePermission` in middleware/rbac.ts consults it
 * so a membership's custom `permissions[]` can only ever GRANT permissions
 * that exist here — never invent new ones.
 *
 * Permission naming: "<module>:<action>".
 */
export const PERMISSIONS = [
  "sales:create",
  "sales:void",
  "purchases:create",
  "purchases:void",
  "payments:create",
  "expenses:create",
  "inventory:manage",
  "transfers:manage",
  "returns:manage",
  "accounting:view",
  "accounting:transfer",
  "reports:view",
  "employees:manage",
  "roles:assign",
  "devices:manage",
  "audit:view",
  "data:export",
  "settings:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  "Owner",
  "Admin",
  "Manager",
  "Accountant",
  "Salesperson",
  "Inventory Manager",
  "Viewer",
] as const;

export type Role = (typeof ROLES)[number];

/** Owner/Admin implicitly hold every permission (enforced in requirePermission). */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  Owner: [...PERMISSIONS],
  Admin: [...PERMISSIONS],
  Manager: [
    "sales:create",
    "sales:void",
    "purchases:create",
    "purchases:void",
    "payments:create",
    "expenses:create",
    "inventory:manage",
    "transfers:manage",
    "returns:manage",
    "accounting:view",
    "accounting:transfer",
    "reports:view",
    "employees:manage",
    "devices:manage",
    "audit:view",
    "data:export",
  ],
  Accountant: [
    "payments:create",
    "expenses:create",
    "accounting:view",
    "accounting:transfer",
    "reports:view",
    "audit:view",
    "data:export",
  ],
  Salesperson: ["sales:create", "payments:create"],
  "Inventory Manager": ["inventory:manage", "transfers:manage", "returns:manage", "purchases:create"],
  Viewer: ["reports:view"],
};

export function permissionsForRole(role: string): readonly Permission[] {
  return (ROLE_PERMISSIONS as Record<string, readonly Permission[]>)[role] ?? [];
}

export function isValidRole(role: string): role is Role {
  return (ROLES as readonly string[]).includes(role);
}

export function isValidPermission(permission: string): permission is Permission {
  return (PERMISSIONS as readonly string[]).includes(permission);
}