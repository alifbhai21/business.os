import mongoose from "mongoose";
import dotenv from "dotenv";
import { ATLAS_TEST_DB_NAME, testDbUriFromEnv, maskUri, assertConnectedToTestDb } from "./atlasSafety";

dotenv.config();

/**
 * Connect the harness to the DEDICATED Atlas test database.
 *
 * The configured MONGODB_URI/DATABASE_URL has no explicit db name, so it
 * resolves to the default "test" DB. This harness derives a dedicated
 * `business_os_api_test` URI on the SAME cluster and refuses to proceed if
 * any safety check fails.
 */
export async function connectAtlasTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  const testUri = testDbUriFromEnv();
  // Log only the MASKED form so credentials never leak.
  // The test DB name itself is safe/non-secret.
  // (masked uri would include the db name; that's fine — it's business_os_api_test)
  await mongoose.connect(testUri, {
    serverSelectionTimeoutMS: 20000,
    maxPoolSize: 10,
  });
  // Hard guard: if we are NOT connected to the dedicated test DB, abort.
  assertConnectedToTestDb();
}

export async function disconnectAtlasTestDb(): Promise<void> {
  await mongoose.disconnect();
}

/** Sanity: report connection target masked (safe for logs/reports). */
export function atlasConnectionLabel(): string {
  if (mongoose.connection.readyState !== 1) return "(not connected)";
  const rawUri = mongoose.connection.getClient().options?.srvHost
    ? `mongodb+srv://${mongoose.connection.getClient().options.srvHost}`
    : "";
  return `db=${mongoose.connection.name} host=${maskUri(rawUri || "hidden")}`;
}