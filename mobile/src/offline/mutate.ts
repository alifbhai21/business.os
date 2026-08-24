import { ApiError, authRequest } from "../api";
import { newLocalId } from "../localId";
import { enqueue } from "./queue";
import type { SyncOpType } from "./types";

/**
 * Phase 10 — online-first mutation with a durable offline fallback.
 *
 * Screens keep their verified submit flows: the wrapper tries the exact same
 * authenticated request first. Only a NETWORK failure (ApiError.status === 0,
 * i.e. the request never reached the server) falls back to the durable
 * SQLite queue; every real server answer — including 400/403/404 rejections
 * — surfaces to the screen unchanged, exactly as before.
 *
 * The queued payload is byte-identical to what would have been sent, so the
 * sync engine replays it against /sync/push with the same strict validation,
 * RBAC and exactly-once localId guarantees.
 */

export interface MutationResult {
  queued: boolean;
  localId: string;
}

export async function authMutation(
  ownerId: string,
  opType: SyncOpType,
  path: string,
  body: Record<string, unknown>
): Promise<MutationResult> {
  // Ensure the body always carries an idempotency anchor BEFORE first send.
  const localId = (body.localId as string | undefined) ?? newLocalId(opType.slice(0, 3));
  const finalBody: Record<string, unknown> = { ...body, localId };

  try {
    await authRequest(path, { method: "POST", body: finalBody });
    return { queued: false, localId };
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      // Never reached the server -> queue it durably and report success.
      await enqueue({
        ownerId,
        businessId: String(finalBody.businessId ?? ""),
        shopId: (finalBody.shopId as string | undefined) ?? null,
        localId,
        opType,
        endpoint: path,
        payload: finalBody,
      });
      return { queued: true, localId };
    }
    throw err;
  }
}
