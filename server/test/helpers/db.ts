import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongo: MongoMemoryReplSet | null = null;

/**
 * Connect the test suite to a single-node MongoDB replica set.
 * A replica set is required for multi-document transactions
 * (session.withTransaction), which the Phase 05 financial engine depends on.
 *
 * mongodb-memory-server v9: standalone servers are "Single" topology and
 * CANNOT run transactions. Use MongoMemoryReplSet so session.withTransaction
 * works during tests.
 */
export async function connectTestDb(dbName = "business-os-test"): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });
  await mongoose.connect(mongo.getUri(dbName));
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (mongo) {
    await mongo.stop();
    mongo = null;
  }
}

export function getTestMongo(): MongoMemoryReplSet | null {
  return mongo;
}