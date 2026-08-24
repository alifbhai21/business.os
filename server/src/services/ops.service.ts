import mongoose from "mongoose";
import { getLatencySnapshot, type LatencySnapshot } from "../middleware/metrics";
import { BusinessMembership } from "../models/BusinessMembership";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 14 — authorization for the process-global ops view.
 *
 * /ops/metrics is NOT business-scoped (it exposes process timing counters,
 * never tenant data), so route-level requireRole cannot apply — there is no
 * business context to read a role from. Instead we verify the caller holds
 * an ACTIVE Owner or Admin membership in at least one business; everyone
 * else gets a plain 403.
 */
export async function assertOpsViewer(userId: string): Promise<void> {
  const privileged = await BusinessMembership.exists({
    userId: new mongoose.Types.ObjectId(userId),
    role: { $in: ["Owner", "Admin"] },
    status: "ACTIVE",
  });
  if (!privileged) {
    throw ApiError.forbidden("Owner or Admin membership required");
  }
}

/**
 * Phase 14 — production monitoring snapshot.
 *
 * Process-local operational telemetry for the Owner/Admin console:
 * uptime, memory pressure, MongoDB connection state and the p50/p95/p99
 * latency table collected by the metrics middleware.
 *
 * NOTE: this exposes NO tenant business data — only timing counters and
 * process health. Route keys contain no ids (normalized to ":id").
 */
export function opsSnapshot() {
  const mem = process.memoryUsage();
  const dbState = mongoose.connection.readyState;
  return {
    process: {
      nodeVersion: process.version,
      env: process.env.NODE_ENV ?? "development",
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
    },
    db: {
      state: dbState === 1 ? "connected" : dbState === 2 ? "connecting" : "disconnected",
    },
    sentry: process.env.SENTRY_DSN ? "configured" : "not_configured",
    latency: getLatencySnapshot(),
  };
}

export type OpsSnapshot = ReturnType<typeof opsSnapshot>;
export type { LatencySnapshot };
