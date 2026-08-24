import { getDb, type QueueStatus } from "./db";

/**
 * Phase 10 — the durable sync queue.
 *
 * Rows survive app restarts and crashes. `owner_user_id` scopes every row to
 * the account that created it, so a queued mutation can never be replayed
 * under another user's token after logout/login.
 */

export interface QueueRow {
  id: number;
  ownerId: string;
  businessId: string;
  shopId: string | null;
  localId: string;
  opType: string;
  endpoint: string;
  payload: string;
  status: QueueStatus;
  retryCount: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  serverRef: string | null;
  createdAt: number;
  updatedAt: number;
}

interface QueueRowRaw {
  id: number;
  owner_user_id: string;
  business_id: string;
  shop_id: string | null;
  local_id: string;
  op_type: string;
  endpoint: string;
  payload: string;
  status: QueueStatus;
  retry_count: number;
  next_attempt_at: number | null;
  last_error: string | null;
  server_ref: string | null;
  created_at: number;
  updated_at: number;
}

function mapRow(r: QueueRowRaw): QueueRow {
  return {
    id: r.id,
    ownerId: r.owner_user_id,
    businessId: r.business_id,
    shopId: r.shop_id,
    localId: r.local_id,
    opType: r.op_type,
    endpoint: r.endpoint,
    payload: r.payload,
    status: r.status,
    retryCount: r.retry_count,
    nextAttemptAt: r.next_attempt_at,
    lastError: r.last_error,
    serverRef: r.server_ref,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface EnqueueInput {
  ownerId: string;
  businessId: string;
  shopId?: string | null;
  localId: string;
  opType: string;
  endpoint: string;
  payload: unknown;
}

export async function enqueue(input: EnqueueInput): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT OR IGNORE INTO sync_queue
       (owner_user_id, business_id, shop_id, local_id, op_type, endpoint, payload,
        status, retry_count, next_attempt_at, last_error, server_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, NULL, NULL, NULL, ?, ?)`,
    [
      input.ownerId,
      input.businessId,
      input.shopId ?? null,
      input.localId,
      input.opType,
      input.endpoint,
      JSON.stringify(input.payload),
      now,
      now,
    ]
  );
}

/** Due rows for this user only: PENDING plus backoff-expired FAILED. */
export async function listDue(ownerId: string, now = Date.now()): Promise<QueueRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<QueueRowRaw>(
    `SELECT * FROM sync_queue
     WHERE owner_user_id = ?
       AND (
         status = 'PENDING'
         OR (status = 'FAILED' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
       )
     ORDER BY created_at ASC, id ASC`,
    [ownerId, now]
  );
  return rows.map(mapRow);
}

export async function countsByStatus(ownerId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ status: QueueStatus; n: number }>(
    "SELECT status, COUNT(*) as n FROM sync_queue WHERE owner_user_id = ? GROUP BY status",
    [ownerId]
  );
  const out: Record<string, number> = { PENDING: 0, SYNCING: 0, SYNCED: 0, FAILED: 0, CONFLICT: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export async function listByStatus(ownerId: string, statuses: QueueStatus[]): Promise<QueueRow[]> {
  const db = await getDb();
  const placeholders = statuses.map(() => "?").join(",");
  const rows = await db.getAllAsync<QueueRowRaw>(
    `SELECT * FROM sync_queue WHERE owner_user_id = ? AND status IN (${placeholders})
     ORDER BY created_at DESC LIMIT 200`,
    [ownerId, ...statuses]
  );
  return rows.map(mapRow);
}

export async function markSyncing(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sync_queue SET status = 'SYNCING', updated_at = ? WHERE id = ?", [
    Date.now(),
    id,
  ]);
}

export async function markSynced(id: number, serverRef: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'SYNCED', server_ref = ?, last_error = NULL, next_attempt_at = NULL, updated_at = ? WHERE id = ?",
    [serverRef, Date.now(), id]
  );
}

export async function markFailed(
  id: number,
  error: string,
  nextAttemptAt: number | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_queue
     SET status = 'FAILED', last_error = ?, retry_count = retry_count + 1, next_attempt_at = ?, updated_at = ?
     WHERE id = ?`,
    [error.slice(0, 500), nextAttemptAt, Date.now(), id]
  );
}

export async function markConflict(id: number, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'CONFLICT', last_error = ?, next_attempt_at = NULL, updated_at = ? WHERE id = ?",
    [error.slice(0, 500), Date.now(), id]
  );
}

/**
 * Crash recovery: a row stuck in SYNCING means the app died between marking
 * and result handling. The server's localId exactly-once guarantees make a
 * re-push harmless, so stale SYNCING rows simply return to PENDING.
 */
export async function resetStaleSyncing(olderThanMs = 5 * 60 * 1000): Promise<number> {
  const db = await getDb();
  const cutoff = Date.now() - olderThanMs;
  const res = await db.runAsync(
    "UPDATE sync_queue SET status = 'PENDING', updated_at = ? WHERE status = 'SYNCING' AND updated_at < ?",
    [Date.now(), cutoff]
  );
  return res.changes;
}

/** Crash recovery / session-expiry parking: put one row back to PENDING. */
export async function resetRow(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sync_queue SET status = 'PENDING', updated_at = ? WHERE id = ?", [
    Date.now(),
    id,
  ]);
}

export async function requeueAll(ownerId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'PENDING', next_attempt_at = NULL, updated_at = ? WHERE owner_user_id = ? AND status IN ('FAILED','CONFLICT')",
    [Date.now(), ownerId]
  );
}

/** User-initiated retry of one item (FAILED/CONFLICT -> PENDING). */
export async function requeueRow(ownerId: string, id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'PENDING', next_attempt_at = NULL, updated_at = ? WHERE owner_user_id = ? AND id = ?",
    [Date.now(), ownerId, id]
  );
}

/** User-initiated discard of a permanently conflicted item. */
export async function removeRow(ownerId: string, id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM sync_queue WHERE owner_user_id = ? AND id = ?", [ownerId, id]);
}

// ── sync_metadata ───────────────────────────────────────────────────────────

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_metadata WHERE key = ?",
    [key]
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO sync_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}
