import { z } from "zod";

/**
 * Phase 10 — sync push/pull contracts.
 *
 * SECURITY (05.13 invariant preserved): the body carries NO deviceId.
 * Device identity is snapshotted from the verified JWT claims by the
 * controller; a client-supplied deviceId is rejected by .strict().
 *
 * Each op's payload is re-validated by the EXACT Zod schema of the target
 * endpoint inside the dispatcher, so offline ops obey the same contracts
 * (and reject the same spoofed server-owned fields) as online requests.
 */

const localId = z
  .string()
  .trim()
  .min(6, "localId must be at least 6 characters")
  .max(80, "localId too long");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId");

export const SYNC_OP_TYPES = [
  "sale",
  "purchase",
  "payment",
  "expense",
  "customer",
  "supplier",
  "product",
  // Phase 12 — offline inventory movements (exactly-once via movement localId).
  "inventory_adjust",
  "inventory_opening",
] as const;

export type SyncOpType = (typeof SYNC_OP_TYPES)[number];

export const syncPushSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    /** Shop scope for the batch; per-op shopId may override for its own op. */
    shopId: objectId.optional(),
    ops: z
      .array(
        z
          .object({
            localId,
            type: z.enum(SYNC_OP_TYPES),
            shopId: objectId.optional(),
            payload: z.record(z.unknown()),
          })
          .strict()
      )
      .min(1, "ops must contain at least one operation")
      .max(50, "at most 50 operations per push"),
  })
  .strict();

export const syncPullQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  /** ISO timestamp cursor from the previous pull (delta since). */
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

/** Phase 14 — sync success-rate KPI window. */
export const syncStatsQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  /** ISO timestamp — start of the aggregation window (default: last 7 days). */
  since: z.string().datetime({ offset: true }).optional(),
});
