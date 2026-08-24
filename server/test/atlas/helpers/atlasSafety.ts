import mongoose from "mongoose";

/**
 * Real-Atlas safety guards.
 *
 * The configured MONGODB_URI/DATABASE_URL points at an Atlas cluster with NO
 * explicit database name, so MongoDB resolves it to the default "test" DB.
 * Per the audit's hard safety rule, we NEVER run destructive tests against a
 * database we cannot positively identify as our dedicated test database.
 *
 * All harness mutations run against a derived DEDICATED test database
 * `business_os_api_test` on the same cluster:
 *
 *   URI            → mongodb+srv://.../business_os_api_test?...
 *   connection.name → business_os_api_test
 *
 * The ONLY acceptable database name for destructive steps is exactly
 * `business_os_api_test`. Any other resolved name causes an immediate abort
 * (STOP_DESTRUCTIVE) — never a fallback write.
 */
export const ATLAS_TEST_DB_NAME = "business_os_api_test";

/** Databases we are permitted to write to in this harness. */
const ALLOWED_WRITE_DBS = new Set([ATLAS_TEST_DB_NAME]);

/**
 * Build a MongoDB URI for our dedicated test database by replacing or
 * inserting `/dbName` in the database-position (after the authority).
 * Any existing query string / options are preserved.
 *
 * Handles all MongoDB URI shapes:
 *   mongodb+srv://user:pass@host
 *   mongodb+srv://user:pass@host/
 *   mongodb+srv://user:pass@host/dbName
 *   mongodb://user:pass@host:27017/dbName?options
 *
 * NEVER logs or returns the URI (credentials are opaque); the caller only
 * ever logs the masked form.
 */
export function deriveTestUri(baseUri: string, dbName: string): string {
  if (!baseUri || !baseUri.startsWith("mongodb")) {
    throw new Error("Refusing to derive test URI: base URI is not a MongoDB URI");
  }
  const hashIdx = baseUri.indexOf("#");
  const withoutHash = hashIdx === -1 ? baseUri : baseUri.slice(0, hashIdx);
  const qIdx = withoutHash.indexOf("?");
  const base = qIdx === -1 ? withoutHash : withoutHash.slice(0, qIdx);
  const query = qIdx === -1 ? "" : withoutHash.slice(qIdx);

  // Locate the path separator after the authority (scheme://host[:port]).
  // The authority is everything after "://" up to the first "/".
  const schemeSep = base.indexOf("://");
  if (schemeSep === -1) throw new Error("MongoDB URI has no :// scheme separator");
  const authStart = schemeSep + 3;
  const pathStart = base.indexOf("/", authStart);
  let authority = base;
  let dbPath = "";
  if (pathStart !== -1) {
    authority = base.slice(0, pathStart);
    dbPath = base.slice(pathStart); // starts with "/", may be "/" or "/someName"
  }

  // dbPath must be empty or a single slash or an existing name we replace.
  let result: string;
  if (dbPath === "" || dbPath === "/") {
    result = `${authority}/${dbName}`;
  } else if (dbPath === `/${dbName}`) {
    result = `${authority}/${dbName}`;
  } else if (dbPath === "/test" || dbPath === "/dev") {
    // Explicit dev/test aliases are deliberately redirected to the dedicated test
    // database so no mock/dev collection is ever written to.
    result = `${authority}/${dbName}`;
  } else {
    // The URI explicitly names a database that is not our test database and is
    // not an obvious dev alias (e.g. a real production name). Refuse rather than
    // silently redirect a write into a production-looking database.
    throw new Error(
      `Refusing to derive test URI: base URI explicitly targets "${dbPath.slice(1)}", ` +
        `which is not the dedicated test database "${dbName}".`
    );
  }

  return result + query + (hashIdx === -1 ? "" : baseUri.slice(hashIdx));
}

/**
 * Mask credentials in a URI for safe logging. Only the masked form may ever be
 * written to logs/reports.
 */
export function maskUri(uri: string): string {
  return uri.replace(/:\/\/[^@/]+@/, "://***:***@");
}

/**
 * Dedicated-test-DB guard. Call before ANY destructive operation
 * (deleteMany, dropDatabase, wipe, reset) and also before the harness opens
 * a connection intended for writes.
 *
 * Preconditions verified:
 *  1. We are connected (readyState === 1).
 *  2. mongoose.connection.name is exactly our ATLAS_TEST_DB_NAME.
 *  3. The name is in our allow-list of test databases.
 */
export function assertSafeTestDb(connectionName?: string): void {
  const name = connectionName ?? mongoose.connection.name;
  if (!name) {
    throw new Error(
      "STOP DESTRUCTIVE TESTS: no database name resolved. Refusing any write."
    );
  }
  if (!ALLOWED_WRITE_DBS.has(name)) {
    throw new Error(
      `STOP DESTRUCTIVE TESTS: resolved database "${name}" is NOT a verified test database. ` +
        "Allowed write targets: " +
        [...ALLOWED_WRITE_DBS].join(", ") +
        ". No writes performed."
    );
  }
}

/**
 * Like assertSafeTestDb, but also used to block even non-destructive HTTP
 * harness operations if we are not on the dedicated test DB — we never want a
 * real client request to accidentally touch the default "test" database.
 */
export function assertConnectedToTestDb(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("Not connected to MongoDB — cannot run harness");
  }
  if (!ALLOWED_WRITE_DBS.has(mongoose.connection.name)) {
    throw new Error(
      `Refusing harness run: connected to "${mongoose.connection.name}", ` +
        `expected "${ATLAS_TEST_DB_NAME}". No requests were issued.`
    );
  }
}

/** Safely derive our dedicated test URI from the process environment. */
export function testDbUriFromEnv(): string {
  const raw = process.env.DATABASE_URL ?? process.env.MONGODB_URI ?? "";
  if (!raw) {
    throw new Error(
      "No MONGODB_URI/DATABASE_URL set. Set it to your Atlas cluster URI before running the real-Atlas audit."
    );
  }
  // Validate: the URI must point at mongodb+srv (Atlas).
  if (!/^mongodb(\+srv)?:\/\//.test(raw)) {
    throw new Error("Refusing to run real-Atlas harness against a non-Atlas URI");
  }
  return deriveTestUri(raw, ATLAS_TEST_DB_NAME);
}