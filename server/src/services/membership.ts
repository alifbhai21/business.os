import { Types } from "mongoose";
import { BusinessMembership } from "../models/BusinessMembership";

/** Active membership = the tenant authorization gate. Never trust client-supplied ids alone. */
export async function membershipFor(userId: string, businessId: string) {
  return BusinessMembership.findOne({
    userId: new Types.ObjectId(userId),
    businessId: new Types.ObjectId(businessId),
    status: "ACTIVE",
  });
}

export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === 11000
  );
}

/** Case-insensitive regex escape — prevents ReDoS / regex injection in searches. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
