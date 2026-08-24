import { AppState, Platform } from "react-native";
import * as Network from "@react-native-community/netinfo";
import { authRequest } from "../api";
import {
  countsByStatus,
  getMeta,
  listDue,
  markConflict,
  markFailed,
  markSynced,
  markSyncing,
  resetRow,
  resetStaleSyncing,
  setMeta,
} from "./queue";
import { getDb, isFirstRestoreOnDevice } from "./db";

/**
 * Phase 10 — client sync engine.
 *
 * Guarantees:
 * - SINGLE-FLIGHT: concurrent syncNow() calls share one running worker.
 * - ORDERED: due rows are pushed strictly by created_at.
 * - EXACTLY-ONCE: every op carries its localId; the server's verified
 *   idempotency turns retries/concurrent pushes into duplicate:true with
 *   zero extra financial effect. A crash between server commit and local
 *   ACK leaves a stale SYNCING row that is safely reset and re-pushed.
 * - BACKOFF: transient failures retry with exponential backoff (30s base,
 *   x2 per attempt, 15 min cap). Conflicts never auto-retry.
 * - AUTH: 401 is handled by authRequest's refresh; if the session truly
 *   expired the run STOPS immediately so rows wait for re-login untouched.
 */

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 15 * 60_000;

export interface SyncRunSummary {
  attempted: number;
  synced: number;
  conflicts: number;
  failed: number;
}

type Listener = () => void;

class SyncEngine {
  private running: Promise<SyncRunSummary> | null = null;
  private netUnsub: (() => void) | null = null;
  private appStateSub: { remove: () => void } | null = null;
  private listeners = new Set<Listener>();
  private activeUserId: string | null = null;

  online = true;
  syncing = false;
  lastSyncAt: string | null = null;
  lastRestoreAt: string | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  /** Idempotent boot — called by SyncProvider on authentication. */
  async start(userId: string): Promise<void> {
    await getDb();
    this.activeUserId = userId;
    this.lastSyncAt = await getMeta("lastSyncAt");
    this.lastRestoreAt = await getMeta("lastRestoreAt");

    // Crash recovery before anything else runs.
    await resetStaleSyncing();

    if (!this.netUnsub) {
      // netinfo v12 returns the unsubscribe function directly.
      this.netUnsub = Network.addEventListener((state) => {
        const wasOffline = !this.online;
        this.online = Boolean(state.isConnected && state.isInternetReachable !== false);
        this.notify();
        // Connectivity regained -> drain the queue automatically.
        if (wasOffline && this.online) void this.syncNow();
      });
    }
    if (!this.appStateSub && Platform.OS !== "web") {
      this.appStateSub = AppState.addEventListener("change", (state) => {
        if (state === "active") void this.syncNow();
      });
    }

    // Initial drain attempt (e.g. queued while offline, now back online).
    // On a FRESH device (never pulled before) run the Phase 11 full restore
    // first so master data + accounts are available offline immediately.
    if (await isFirstRestoreOnDevice()) {
      try {
        await this.restoreAll();
      } catch {
        // Offline / no business yet — the normal pull cycle will fill in.
      }
    }
    void this.syncNow();
  }

  stop(): void {
    this.activeUserId = null;
    this.syncing = false;
    this.running = null;
    this.notify();
  }

  setOnline(online: boolean): void {
    this.online = online;
    this.notify();
  }

  /** Single-flight entry point — always safe to call. */
  syncNow(): Promise<SyncRunSummary> {
    if (!this.activeUserId || this.running) {
      return this.running ?? Promise.resolve({ attempted: 0, synced: 0, conflicts: 0, failed: 0 });
    }
    this.running = this.run().finally(() => {
      this.running = null;
      this.syncing = false;
      this.notify();
    });
    this.syncing = true;
    this.notify();
    return this.running;
  }

  private backoffFor(retryCount: number): number {
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** retryCount, BACKOFF_CAP_MS);
    return Date.now() + delay;
  }

  private async run(): Promise<SyncRunSummary> {
    const userId = this.activeUserId;
    if (!userId) return { attempted: 0, synced: 0, conflicts: 0, failed: 0 };

    const summary: SyncRunSummary = { attempted: 0, synced: 0, conflicts: 0, failed: 0 };
    let rows = await listDue(userId);
    if (rows.length === 0) {
      // Nothing to push — still refresh the master-data cache opportunistically.
      try {
        await this.pull();
      } catch {
        // Offline pull is fine; caches stay as-is.
      }
      return summary;
    }

    for (const row of rows) {
      // Session may have been logged out mid-run.
      if (this.activeUserId !== userId) break;

      summary.attempted += 1;
      await markSyncing(row.id);

      // The stored payload IS the exact body the screen would have sent
      // (businessId/shopId at top level). Re-shape into the push contract.
      const body = JSON.parse(row.payload) as Record<string, unknown>;
      const opPayload = { ...body };
      delete opPayload.businessId;
      delete opPayload.shopId;

      try {
        const res = await authRequest<{
          data: {
            results: { localId: string; status: string; serverId?: string | null; error?: string | null }[];
          };
        }>("/api/v1/sync/push", {
          method: "POST",
          body: {
            businessId: row.businessId,
            ...(row.shopId ? { shopId: row.shopId } : {}),
            ops: [{ localId: row.localId, type: row.opType, payload: opPayload }],
          },
        });
        const result = res.data.results[0];
        if (result.status === "SYNCED") {
          await markSynced(row.id, result.serverId ?? null);
          summary.synced += 1;
        } else if (result.status === "CONFLICT") {
          await markConflict(row.id, result.error ?? "Rejected by server");
          summary.conflicts += 1;
        } else {
          await markFailed(row.id, result.error ?? "Unknown error", this.backoffFor(row.retryCount));
          summary.failed += 1;
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401) {
          // Refresh already failed inside authRequest -> session expired.
          // Park the row untouched as PENDING and stop the whole run; the
          // user logs back in and a foreground-sync drains the rest.
          await resetRow(row.id);
          summary.failed += rows.length - summary.attempted + 1;
          break;
        }
        // Network / timeout / 5xx / rate-limit: transient -> backoff.
        const message = err instanceof Error ? err.message : "Network error";
        await markFailed(row.id, message, this.backoffFor(row.retryCount));
        summary.failed += 1;
        if (status === undefined || status === 0) {
          // Still offline: stop hammering; next attempt on connectivity regain.
          break;
        }
      }
    }

    try {
      await this.pull();
    } catch {
      // Pull is best-effort; push results are what matter here.
    }

    this.lastSyncAt = new Date().toISOString();
    await setMeta("lastSyncAt", this.lastSyncAt);
    this.notify();
    return summary;
  }

  /** Delta pull of master data into the local cache tables. */
  async pull(): Promise<void> {
    const businessId = await getMeta("activeBusinessId");
    if (!businessId) return;
    const cursor = await getMeta("lastPullCursor");
    const res = await authRequest<{
      data: {
        cursor: string;
        products: Array<Record<string, unknown>>;
        customers: Array<Record<string, unknown>>;
        suppliers: Array<Record<string, unknown>>;
      };
    }>(
      `/api/v1/sync/pull?businessId=${encodeURIComponent(businessId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
    );
    const db = await getDb();
    const d = res.data;

    await db.withTransactionAsync(async () => {
      for (const p of d.products) {
        await db.runAsync(
          `INSERT INTO local_products
             (server_id, business_id, name, sku, barcode, unit, purchase_price, selling_price,
              tax_rate, current_stock, min_stock, avg_cost, status, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
           ON CONFLICT(server_id) DO UPDATE SET
             name=excluded.name, sku=excluded.sku, barcode=excluded.barcode, unit=excluded.unit,
             purchase_price=excluded.purchase_price, selling_price=excluded.selling_price,
             tax_rate=excluded.tax_rate, current_stock=excluded.current_stock,
             min_stock=excluded.min_stock, avg_cost=excluded.avg_cost, status=excluded.status,
             updated_at=excluded.updated_at`,
          [
            String(p.id),
            businessId,
            String(p.name),
            (p.sku as string | null) ?? null,
            (p.barcode as string | null) ?? null,
            String(p.unit),
            Number(p.purchasePrice ?? 0),
            Number(p.sellingPrice ?? 0),
            Number(p.taxRate ?? 0),
            Number(p.currentStock ?? 0),
            Number(p.minStock ?? 0),
            Number(p.avgCost ?? 0),
            String(p.status),
            Date.parse(String(p.updatedAt)) || Date.now(),
          ]
        );
      }
      for (const c of d.customers) {
        await db.runAsync(
          `INSERT INTO local_customers
             (server_id, business_id, name, phone, address, customer_code, credit_limit,
              current_due, status, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
           ON CONFLICT(server_id) DO UPDATE SET
             name=excluded.name, phone=excluded.phone, address=excluded.address,
             customer_code=excluded.customer_code, credit_limit=excluded.credit_limit,
             current_due=excluded.current_due, status=excluded.status, updated_at=excluded.updated_at`,
          [
            String(c.id),
            businessId,
            String(c.name),
            (c.phone as string | null) ?? null,
            (c.address as string | null) ?? null,
            (c.customerCode as string | null) ?? null,
            Number(c.creditLimit ?? 0),
            Number(c.currentDue ?? 0),
            String(c.status),
            Date.parse(String(c.updatedAt)) || Date.now(),
          ]
        );
      }
      for (const s of d.suppliers) {
        await db.runAsync(
          `INSERT INTO local_suppliers
             (server_id, business_id, name, phone, company, address, current_payable,
              status, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
           ON CONFLICT(server_id) DO UPDATE SET
             name=excluded.name, phone=excluded.phone, company=excluded.company,
             address=excluded.address, current_payable=excluded.current_payable,
             status=excluded.status, updated_at=excluded.updated_at`,
          [
            String(s.id),
            businessId,
            String(s.name),
            (s.phone as string | null) ?? null,
            (s.company as string | null) ?? null,
            (s.address as string | null) ?? null,
            Number(s.currentPayable ?? 0),
            String(s.status),
            Date.parse(String(s.updatedAt)) || Date.now(),
          ]
        );
      }
    });

    await setMeta("lastPullCursor", d.cursor);
  }

  async counts(): Promise<{ pending: number; failed: number; conflicts: number; synced: number }> {
    if (!this.activeUserId) return { pending: 0, failed: 0, conflicts: 0, synced: 0 };
    const c = await countsByStatus(this.activeUserId);
    return {
      pending: c.PENDING + c.SYNCING,
      failed: c.FAILED,
      conflicts: c.CONFLICT,
      synced: c.SYNCED,
    };
  }

  /**
   * Phase 11 — full restore for a NEW device.
   *
   * Pulls the complete operational dataset from GET /api/v1/sync/restore
   * (master data + accounts for the local cache; the full transactional
   * history remains server-authoritative and readable online) and records
   * lastRestoreAt. Read-only against business data — safe to re-run.
   */
  async restoreAll(): Promise<{ counts: Record<string, number>; restoredAt: string } | null> {
    const businessId = await getMeta("activeBusinessId");
    if (!businessId || !this.activeUserId) return null;

    interface RestoreResponse {
      data: {
        restoredAt: string;
        counts: Record<string, number>;
        data: {
          products?: Array<Record<string, unknown>>;
          customers?: Array<Record<string, unknown>>;
          suppliers?: Array<Record<string, unknown>>;
          accounts?: Array<Record<string, unknown>>;
        };
      };
    }
    const res = await authRequest<RestoreResponse>(
      `/api/v1/sync/restore?businessId=${encodeURIComponent(businessId)}`
    );
    const d = res.data;
    const db = await getDb();

    await db.withTransactionAsync(async () => {
      for (const p of d.data.products ?? []) {
        await db.runAsync(
          `INSERT INTO local_products
             (server_id, business_id, name, sku, barcode, unit, purchase_price, selling_price,
              tax_rate, current_stock, min_stock, avg_cost, status, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
           ON CONFLICT(server_id) DO UPDATE SET
             name=excluded.name, sku=excluded.sku, barcode=excluded.barcode, unit=excluded.unit,
             purchase_price=excluded.purchase_price, selling_price=excluded.selling_price,
             tax_rate=excluded.tax_rate, current_stock=excluded.current_stock,
             min_stock=excluded.min_stock, avg_cost=excluded.avg_cost, status=excluded.status,
             updated_at=excluded.updated_at`,
          [
            String(p.id),
            businessId,
            String(p.name),
            (p.sku as string | null) ?? null,
            (p.barcode as string | null) ?? null,
            String(p.unit),
            Number(p.purchasePrice ?? 0),
            Number(p.sellingPrice ?? 0),
            Number(p.taxRate ?? 0),
            Number(p.currentStock ?? 0),
            Number(p.minStock ?? 0),
            Number(p.avgCost ?? 0),
            String(p.status ?? "ACTIVE"),
            p.updatedAt ? Date.parse(String(p.updatedAt)) || Date.now() : Date.now(),
          ]
        );
      }
      for (const c of d.data.customers ?? []) {
        await db.runAsync(
          `INSERT INTO local_customers
             (server_id, business_id, name, phone, address, customer_code, credit_limit,
              current_due, status, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
           ON CONFLICT(server_id) DO UPDATE SET
             name=excluded.name, phone=excluded.phone, address=excluded.address,
             customer_code=excluded.customer_code, credit_limit=excluded.credit_limit,
             current_due=excluded.current_due, status=excluded.status, updated_at=excluded.updated_at`,
          [
            String(c.id),
            businessId,
            String(c.name),
            (c.phone as string | null) ?? null,
            (c.address as string | null) ?? null,
            (c.customerCode as string | null) ?? null,
            Number(c.creditLimit ?? 0),
            Number(c.currentDue ?? 0),
            String(c.status ?? "ACTIVE"),
            c.updatedAt ? Date.parse(String(c.updatedAt)) || Date.now() : Date.now(),
          ]
        );
      }
      for (const s of d.data.suppliers ?? []) {
        await db.runAsync(
          `INSERT INTO local_suppliers
             (server_id, business_id, name, phone, company, address, current_payable,
              status, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
           ON CONFLICT(server_id) DO UPDATE SET
             name=excluded.name, phone=excluded.phone, company=excluded.company,
             address=excluded.address, current_payable=excluded.current_payable,
             status=excluded.status, updated_at=excluded.updated_at`,
          [
            String(s.id),
            businessId,
            String(s.name),
            (s.phone as string | null) ?? null,
            (s.company as string | null) ?? null,
            (s.address as string | null) ?? null,
            Number(s.currentPayable ?? 0),
            String(s.status ?? "ACTIVE"),
            s.updatedAt ? Date.parse(String(s.updatedAt)) || Date.now() : Date.now(),
          ]
        );
      }
      for (const a of d.data.accounts ?? []) {
        await db.runAsync(
          `INSERT INTO local_accounts
             (server_id, business_id, shop_id, name, type, current_balance, status, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
           ON CONFLICT(server_id) DO UPDATE SET
             name=excluded.name, type=excluded.type, current_balance=excluded.current_balance,
             status=excluded.status, updated_at=excluded.updated_at`,
          [
            String(a.id),
            businessId,
            (a.shopId as string | null) ?? null,
            String(a.name),
            String(a.type ?? "CASH"),
            Number(a.currentBalance ?? 0),
            "ACTIVE",
            a.updatedAt ? Date.parse(String(a.updatedAt)) || Date.now() : Date.now(),
          ]
        );
      }
    });

    this.lastRestoreAt = d.restoredAt;
    await setMeta("lastRestoreAt", d.restoredAt);
    // The caches are now current as of the server's restore snapshot — set
    // the pull cursor so the delta engine does not re-pull everything.
    await setMeta("lastPullCursor", new Date(Date.parse(d.restoredAt) - 1000).toISOString());
    this.notify();
    return { counts: d.counts, restoredAt: d.restoredAt };
  }
}

export const syncEngine = new SyncEngine();
