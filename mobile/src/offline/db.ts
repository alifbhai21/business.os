import * as SQLite from "expo-sqlite";

/**
 * Phase 10 — local SQLite storage (offline-first operational minimum).
 *
 * Design rules:
 * - The SERVER stays authoritative for every financial figure. Local tables
 *   are (a) a READ CACHE of master data pulled from /sync/pull and (b) the
 *   durable sync_queue that survives app restarts and crashes.
 * - Credentials/tokens NEVER live here (expo-secure-store owns those).
 * - Schema changes go through the ordered MIGRATIONS list; user_version is
 *   the migration watermark, so upgrades are incremental and idempotent.
 */

export type QueueStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED" | "CONFLICT";

let dbInstance: SQLite.SQLiteDatabase | null = null;

interface Migration {
  version: number;
  statements: string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_user_id TEXT NOT NULL,
        business_id TEXT NOT NULL,
        shop_id TEXT,
        local_id TEXT NOT NULL UNIQUE,
        op_type TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER,
        last_error TEXT,
        server_ref TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sync_queue_owner_status
        ON sync_queue (owner_user_id, status, next_attempt_at)`,
      `CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS local_products (
        server_id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sku TEXT,
        barcode TEXT,
        unit TEXT,
        purchase_price INTEGER,
        selling_price INTEGER,
        tax_rate REAL,
        current_stock INTEGER,
        min_stock INTEGER,
        avg_cost INTEGER,
        status TEXT,
        updated_at INTEGER,
        sync_status TEXT NOT NULL DEFAULT 'SYNCED'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_local_products_biz
        ON local_products (business_id, name)`,
      `CREATE TABLE IF NOT EXISTS local_customers (
        server_id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        customer_code TEXT,
        credit_limit INTEGER,
        current_due INTEGER,
        status TEXT,
        updated_at INTEGER,
        sync_status TEXT NOT NULL DEFAULT 'SYNCED'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_local_customers_biz
        ON local_customers (business_id, name)`,
      `CREATE TABLE IF NOT EXISTS local_suppliers (
        server_id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        company TEXT,
        address TEXT,
        current_payable INTEGER,
        status TEXT,
        updated_at INTEGER,
        sync_status TEXT NOT NULL DEFAULT 'SYNCED'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_local_suppliers_biz
        ON local_suppliers (business_id, name)`,
    ],
  },
  {
    // Phase 11 — accounts cache, so a restored device can record payments /
    // expenses offline against real account ids (server stays authoritative).
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS local_accounts (
        server_id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        shop_id TEXT,
        name TEXT NOT NULL,
        type TEXT,
        current_balance INTEGER,
        status TEXT,
        updated_at INTEGER,
        sync_status TEXT NOT NULL DEFAULT 'SYNCED'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_local_accounts_biz
        ON local_accounts (business_id, shop_id)`,
    ],
  },
];

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  const db = await SQLite.openDatabaseAsync("business-os.db");
  await db.execAsync("PRAGMA journal_mode = WAL");
  await db.execAsync("PRAGMA foreign_keys = ON");

  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
    });
    current = migration.version;
  }
  await db.execAsync(`PRAGMA user_version = ${current}`);

  dbInstance = db;
  return db;
}

/** Test/dev helper: wipe cached data but keep the schema. Never called with tokens. */
export async function clearCaches(): Promise<void> {
  const db = await getDb();
  await db.execAsync(
    "DELETE FROM local_products; DELETE FROM local_customers; DELETE FROM local_suppliers; DELETE FROM local_accounts;"
  );
}

/** True when this device has never completed a pull/restore for any business. */
export async function isFirstRestoreOnDevice(): Promise<boolean> {
  const db = await getDb();
  const cursor = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_metadata WHERE key = 'lastPullCursor'"
  );
  return !cursor?.value;
}
