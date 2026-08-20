import { z } from "zod";
import { PAYMENT_METHODS } from "../config/accounts";

const paymentMethodEnum = z.enum([...PAYMENT_METHODS] as [string, ...string[]]);
const paymentTypeEnum = z.enum(["customer_payment", "supplier_payment"]);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId");

export const paymentCreateSchema = z
  .object({
    businessId: z.string().min(1, "businessId is required"),
    shopId: z.string().min(1, "shopId is required"),
    type: paymentTypeEnum,
    customerId: objectId.optional().nullable(),
    supplierId: objectId.optional().nullable(),
    saleId: objectId.optional().nullable(),
    purchaseId: objectId.optional().nullable(),
    amount: z.number().int("amount must be integer paisa").positive("amount must be > 0"),
    method: paymentMethodEnum,
    accountId: objectId,
    note: z.string().trim().max(500).optional().nullable(),
    idempotencyKey: z.string().trim().min(1).max(120),
    paymentDate: z.string().datetime().optional().nullable(),
    localId: z.string().trim().max(80).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "customer_payment") {
      if (!data.customerId) {
        ctx.addIssue({ code: "custom", path: ["customerId"], message: "customerId is required for customer_payment" });
      }
      if (data.supplierId) {
        ctx.addIssue({ code: "custom", path: ["supplierId"], message: "customer_payment must not have a supplierId" });
      }
    }
    if (data.type === "supplier_payment") {
      if (!data.supplierId) {
        ctx.addIssue({ code: "custom", path: ["supplierId"], message: "supplierId is required for supplier_payment" });
      }
      if (data.customerId) {
        ctx.addIssue({ code: "custom", path: ["customerId"], message: "supplier_payment must not have a customerId" });
      }
    }
  });

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
