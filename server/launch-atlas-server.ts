/**
 * Launch the REAL Express server against the DEDICATED Atlas test database
 * (`business_os_api_test`). Never uses the default "test" db of the cluster.
 *
 * Usage:
 *   npx tsx launch-atlas-server.ts [port]
 *
 * Safety: derived via test/atlas/helpers/atlasSafety.testDbUriFromEnv so the
 * connection is hard-asserted to be the dedicated test DB before boot.
 */
import "dotenv/config";
import { testDbUriFromEnv, ATLAS_TEST_DB_NAME } from "./test/atlas/helpers/atlasSafety";

const uri = testDbUriFromEnv(); // throws unless MONGODB_URI points to Atlas
// Override for the app so it connects only to the dedicated test DB.
process.env.DATABASE_URL = uri;
process.env.NODE_ENV = "development";
process.env.RATE_LIMIT_MAX = "100000";

// eslint-disable-next-line no-console
console.log(`[audit-server] booting against verified Atlas test db: ${ATLAS_TEST_DB_NAME}`);

// Load the real app AFTER env override so loadEnv sees the test URI.
import("./src/index").catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[audit-server] boot failed:", err);
  process.exit(1);
});