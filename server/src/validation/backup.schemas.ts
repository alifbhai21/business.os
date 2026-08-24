import { z } from "zod";

/**
 * Phase 11 — backup / restore / export contracts.
 *
 * SECURITY: no deviceId anywhere — device identity comes from the verified
 * JWT claims only (05.13 invariant). Restore and status are read-only for
 * any ACTIVE member; exports additionally require the `data:export`
 * permission (Owner/Admin/Manager/Accountant), enforced at route AND
 * service level.
 */

/** GET /api/v1/sync/restore — full dataset pull for a (new) device. */
export const restoreQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  /** Per-collection cap. Defaults to 1000, hard-capped so a huge business
   *  cannot exhaust server memory in one request. */
  limit: z.coerce.number().int().positive().max(2000).optional(),
});

/** GET /api/v1/backup/status — Atlas persistence health snapshot. */
export const backupStatusQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
});

export const EXPORT_CSV_TYPES = [
  "products",
  "customers",
  "suppliers",
  "accounts",
  "sales",
  "purchases",
  "payments",
  "expenses",
] as const;

export type ExportCsvType = (typeof EXPORT_CSV_TYPES)[number];

/** GET /api/v1/export/csv?type=… */
export const exportCsvQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  type: z.enum(EXPORT_CSV_TYPES),
});

/** GET /api/v1/export/data — full JSON archive. */
export const exportDataQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
});
