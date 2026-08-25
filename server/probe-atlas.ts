import "dotenv/config";
import mongoose from "mongoose";
import {
  deriveTestUri,
  maskUri,
  ATLAS_TEST_DB_NAME,
} from "./test/atlas/helpers/atlasSafety";

function assertSafeTestName(name: string | undefined): void {
  if (!name || name !== ATLAS_TEST_DB_NAME) {
    throw new Error(`PROBE: connected to "${name}", not the dedicated test db — aborting`);
  }
}

async function main(): Promise<void> {
  const raw = process.env.DATABASE_URL ?? process.env.MONGODB_URI ?? "";
  if (!raw) {
    console.log("PROBE: no MONGODB_URI/DATABASE_URL set");
    process.exit(2);
  }
  const uri = deriveTestUri(raw, ATLAS_TEST_DB_NAME);
  console.log(`PROBE: connecting to db=${ATLAS_TEST_DB_NAME} host=${maskUri(uri)}`);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 12000, maxPoolSize: 5 });
  } catch (err) {
    console.log(`PROBE: CONNECT FAILED: ${(err as Error).message}`);
    process.exit(1);
  }
  assertSafeTestName(mongoose.connection.name);
  console.log(`PROBE: connected to verified test db: ${mongoose.connection.name}`);
  const db = mongoose.connection.db;
  try {
    const cols = await db!.listCollections();
    const names = cols.map((c) => c.name);
    console.log(`PROBE: collections [${names.length}]:`);
    for (const n of names) console.log(`  - ${n}`);
  } catch (err) {
    console.log(`PROBE: listCollections failed: ${(err as Error).message}`);
  }
  await mongoose.disconnect();
  console.log("PROBE: DONE");
}

main().catch((err) => {
  console.log(`PROBE: FATAL ${(err as Error).message}`);
  process.exit(1);
});