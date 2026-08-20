import mongoose, { ClientSession } from "mongoose";
import { logger } from "../utils/logger";

/**
 * True when the connected MongoDB topology supports multi-document
 * transactions (replica set or mongos/sharded cluster).
 */
export function supportsTransactions(): boolean {
  // Mongoose 8 exposes the underlying MongoDB driver client via getClient().
  // The driver's Topology is not part of the public Connection typings,
  // so access it through a narrow cast on the MongoClient.
  let type = "";
  try {
    const client = mongoose.connection.getClient() as unknown as {
      topology?: { description?: { type?: string } } | null;
    };
    type = String(client?.topology?.description?.type ?? "").toLowerCase();
  } catch {
    type = "";
  }
  return type.includes("replicaset") || type.includes("sharded") || type.includes("loadbalanced");
}

/**
 * Run `fn` inside a multi-document transaction when the deployment supports
 * it. On a standalone mongod (local dev in-memory fallback) transactions are
 * impossible — the function runs non-transactionally and a warning is logged.
 *
 * `fn` receives the ClientSession (or null in fallback mode) and MUST pass it
 * through to every mongoose operation it performs.
 */
export async function withTransaction<T>(
  fn: (session: ClientSession | null) => Promise<T>
): Promise<T> {
  if (!supportsTransactions()) {
    logger.warn(
      "withTransaction: connection is not a replica set — running WITHOUT a transaction (non-atomic)"
    );
    return fn(null);
  }
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}