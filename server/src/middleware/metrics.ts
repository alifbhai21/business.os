import { NextFunction, Request, Response } from "express";

/**
 * Phase 14 — API latency monitoring (PRD: p95 < 500ms on core reads).
 *
 * Zero-dependency in-process histogram. Every request is timed and bucketed
 * under a normalized route key (`/api/v1/products/:id`), skipping only the
 * platform probes (/health, /ready). `getLatencySnapshot()` is consumed by
 * the Owner/Admin-only ops endpoint so production latency can be observed
 * without external tooling.
 *
 * Memory bound: per route key we keep a bounded ring of recent samples
 * (RING_SIZE) plus running totals — a long-lived process cannot grow this
 * structure beyond (#route keys × RING_SIZE) numbers.
 */

const RING_SIZE = 500;

interface LatencyStats {
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
  /** Most recent samples, oldest first — enough to compute percentiles. */
  ring: number[];
  cursor: number;
}

const stats = new Map<string, LatencyStats>();

/**
 * Normalize a request path into a bounded route key:
 * MongoDB ids / invoice numbers collapse to ":id" so unbounded client
 * input cannot create unbounded map keys.
 */
export function routeKeyOf(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      if (/^[a-f\d]{24}$/i.test(segment)) return ":id";
      if (/^\d+$/.test(segment)) return ":num";
      if (segment.length > 24) return ":blob";
      return segment;
    })
    .join("/");
}

function record(key: string, ms: number, isError: boolean): void {
  let entry = stats.get(key);
  if (!entry) {
    entry = { count: 0, errors: 0, totalMs: 0, maxMs: 0, ring: [], cursor: 0 };
    stats.set(key, entry);
  }
  entry.count += 1;
  entry.totalMs += ms;
  if (isError) entry.errors += 1;
  if (ms > entry.maxMs) entry.maxMs = ms;

  const ring = entry.ring;
  if (ring.length < RING_SIZE) {
    ring.push(ms);
    entry.cursor = ring.length;
  } else {
    ring[entry.cursor % RING_SIZE] = ms;
    entry.cursor += 1;
  }
}

/** Percentile over the current ring contents (sorted copy). */
function percentile(entry: LatencyStats, p: number): number {
  if (entry.ring.length === 0) return 0;
  const sorted = [...entry.ring].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/** Express middleware: time every request and record its outcome. */
export function latencyTracker(req: Request, res: Response, next: NextFunction): void {
  // Probes are exempt — they answer instantly by design and would skew data.
  if (req.path === "/health" || req.path === "/ready") {
    next();
    return;
  }
  // IMPORTANT: capture the path NOW. Express rebases req.path/req.url as
  // routing descends into mounted routers, so by the time the 'finish'
  // event fires req.path holds the innermost RELATIVE path (" /register").
  // originalUrl is immutable and always the client-facing full path.
  const rawPath = (req.originalUrl ?? req.url ?? "").split("?")[0];
  const key = routeKeyOf(rawPath);
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    record(key, ms, res.statusCode >= 500);
  });
  next();
}

export interface RouteLatency {
  routeKey: string;
  count: number;
  errors: number;
  avgMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface LatencySnapshot {
  trackedRoutes: number;
  routes: RouteLatency[];
  overall: { p50Ms: number; p95Ms: number; p99Ms: number };
}

/** Snapshot for the ops endpoint (routes sorted by traffic). */
export function getLatencySnapshot(): LatencySnapshot {
  const routes: RouteLatency[] = [...stats.entries()].map(([routeKey, e]) => ({
    routeKey,
    count: e.count,
    errors: e.errors,
    avgMs: e.count > 0 ? Math.round((e.totalMs / e.count) * 100) / 100 : 0,
    maxMs: Math.round(e.maxMs * 100) / 100,
    p50Ms: Math.round(percentile(e, 50) * 100) / 100,
    p95Ms: Math.round(percentile(e, 95) * 100) / 100,
    p99Ms: Math.round(percentile(e, 99) * 100) / 100,
  }));
  routes.sort((a, b) => b.count - a.count);

  // Overall percentiles across all rings combined.
  const all: number[] = [];
  for (const e of stats.values()) all.push(...e.ring);
  all.sort((a, b) => a - b);
  const pick = (p: number) =>
    all.length === 0
      ? 0
      : Math.round(all[Math.min(all.length - 1, Math.ceil((p / 100) * all.length) - 1)] * 100) / 100;

  return {
    trackedRoutes: routes.length,
    routes,
    overall: { p50Ms: pick(50), p95Ms: pick(95), p99Ms: pick(99) },
  };
}

/** Test/ops helper: clear all samples. */
export function resetLatencyStats(): void {
  stats.clear();
}
