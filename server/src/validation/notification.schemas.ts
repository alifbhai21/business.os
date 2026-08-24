import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId");

export const notificationListQuerySchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  /** "unread" filters to unacknowledged rows only. */
  filter: z.enum(["all", "unread"]).optional(),
});

export const notificationReadParamsSchema = z
  .object({ id: objectId })
  .strict();

export const markAllReadSchema = z
  .object({ businessId: z.string().min(1, "businessId is required") })
  .strict();

export const preferenceUpdateSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    lowStock: z.boolean().optional(),
    customerDue: z.boolean().optional(),
    supplierDue: z.boolean().optional(),
    syncFailure: z.boolean().optional(),
  })
  .strict();
