import { z } from "zod";
import { EXPENSE_CATEGORIES } from "../config/accounts";

const expenseCategoryEnum = z.enum([...EXPENSE_CATEGORIES] as [string, ...string[]]);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId");

/**
 * `.strict()` — unknown keys are rejected rather than silently dropped, so a
 * client can never smuggle a field (e.g. createdBy) past validation.
 * `.safe()` on amount bounds it to Number.MAX_SAFE_INTEGER: paisa arithmetic
 * beyond that is not representable.
 */
export const expenseCreateSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    category: expenseCategoryEnum,
    amount: z
      .number()
      .int("amount must be integer paisa")
      .positive("amount must be > 0")
      .safe("amount exceeds the safe integer range"),
    paymentAccountId: objectId,
    note: z.string().trim().max(500).optional().nullable(),
    receiptUrl: z.string().trim().url("receiptUrl must be a valid URL").max(500).optional().nullable(),
    expenseDate: z.string().datetime("expenseDate must be an ISO 8601 date-time").optional().nullable(),
    localId: z.string().trim().max(80).optional().nullable(),
  })
  .strict();

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
