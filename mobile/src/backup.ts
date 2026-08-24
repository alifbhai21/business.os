import { authRequest } from "./api";
import { getMeta } from "./offline/queue";

/**
 * Phase 11 — backup/restore/export client helpers.
 *
 * Every figure shown in the UI comes from the server payload; nothing is
 * computed client-side. The raw export text (JSON/CSV) is returned to the
 * caller so a screen can hand it to the OS share sheet.
 */

export interface BackupStatus {
  businessId: string;
  database: string;
  connected: boolean;
  healthy: boolean;
  counts: Record<string, number>;
  lastWriteAt: string | null;
  lastAuditAt: string | null;
  lastSyncEventAt: string | null;
}

async function activeBusinessId(): Promise<string> {
  const biz = await getMeta("activeBusinessId");
  if (!biz) throw new Error("No active business");
  return biz;
}

export async function fetchBackupStatus(businessId?: string): Promise<BackupStatus> {
  const biz = businessId ?? (await activeBusinessId());
  const res = await authRequest<{ data: BackupStatus }>(
    `/api/v1/backup/status?businessId=${encodeURIComponent(biz)}`
  );
  return res.data;
}

export async function fetchExportJson(): Promise<string> {
  const biz = await activeBusinessId();
  const res = await authRequest<{ data: unknown }>(
    `/api/v1/export/data?businessId=${encodeURIComponent(biz)}`
  );
  return JSON.stringify(res.data, null, 2);
}

export async function fetchExportCsv(type: string): Promise<string> {
  const biz = await activeBusinessId();
  // CSV answers with a text/csv attachment body — read it raw.
  return authRequest<string>(
    `/api/v1/export/csv?businessId=${encodeURIComponent(biz)}&type=${encodeURIComponent(type)}`,
    { rawText: true }
  );
}
