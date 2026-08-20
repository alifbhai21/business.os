import { z } from "zod";
import { ACCOUNT_TYPES } from "../config/accounts";

const accountTypeEnum = z.enum([...ACCOUNT_TYPES] as [string, ...string[]]);

export const accountCreateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  shopId: z.string().min(1, "shopId is required"),
  name: z.string().trim().min(1, "Account name is required").max(80),
  type: accountTypeEnum,
  accountNumber: z.string().trim().max(60).optional().nullable(),
});

export const accountUpdateSchema = z.object({
  businessId: z.string().min(1, "businessId is required"),
  shopId: z.string().min(1, "shopId is required"),
  name: z.string().trim().min(1).max(80).optional(),
  type: accountTypeEnum.optional(),
  accountNumber: z.string().trim().max(60).optional().nullable(),
});