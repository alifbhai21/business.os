import { Types, ClientSession } from "mongoose";
import { BusinessCounter } from "../models/BusinessCounter";

export const COUNTER_KEYS = {
  SALE: "SALE",
  PURCHASE: "PURCHASE",
  PAYMENT: "PAYMENT",
  EXPENSE: "EXPENSE",
} as const;
export type CounterKey = (typeof COUNTER_KEYS)[keyof typeof COUNTER_KEYS];

/**
 * Atomically reserve the next sequence number for (business, shop, key).
 *
 * Uses findOneAndUpdate with $inc + upsert so the increment is atomic —
 * concurrent finalizers can never receive the same number. MUST be called
 * inside the same MongoDB transaction as the document being numbered.
 */
export async function nextSequence(
  businessId: string,
  shopId: string,
  key: CounterKey,
  session?: ClientSession | null
): Promise<number> {
  const counter = await BusinessCounter.findOneAndUpdate(
    { businessId: new Types.ObjectId(businessId), shopId: new Types.ObjectId(shopId), key },
    { $inc: { sequence: 1 } },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      ...(session ? { session } : {}),
    }
  );
  if (!counter) {
    throw new Error(`Failed to reserve sequence for counter (${businessId}, ${shopId}, ${key})`);
  }
  return counter.sequence;
}
