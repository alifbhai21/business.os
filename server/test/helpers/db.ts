import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongo: MongoMemoryReplSet | null = null;

/**
 * Windows reserves several TCP ranges (see
 * `netsh interface ipv4 show excludedportrange protocol=tcp`, e.g.
 * 49671-49970 and 50000-50059 on this machine). mongodb-memory-server picks a
 * random port and only retries on EADDRINUSE — an EACCES pick inside a
 * reserved range aborts the whole test file. Re-drawing the port a few times
 * makes startup deterministic without pinning a port (which would race across
 * the test files node:test runs in parallel).
 */
async function startReplSet(attempts = 6): Promise<MongoMemoryReplSet> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string }).code;
      if (code !== "EACCES" && code !== "EADDRINUSE") throw err;
    }
  }
  throw lastErr;
}

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
  mongo = await startReplSet();
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