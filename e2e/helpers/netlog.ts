import type { Page, Request, Response } from "@playwright/test";

export interface NetRecord {
  method: string;
  url: string;
  path: string;
  status?: number;
  ms?: number;
  authHeader: boolean;
  ok?: boolean;
  at: string;
}

const SENSITIVE_PATH = /(login|register|refresh|logout)/i;

const records: NetRecord[] = [];

function redactPath(u: string): string {
  try {
    const parsed = new URL(u);
    return parsed.pathname;
  } catch {
    return u;
  }
}

/** Attach request/response observers to the given page. Never logs bodies, tokens or header values. */
export function attachNetworkLog(page: Page): void {
  // Each test gets an isolated record set (the worker module is shared across
  // test files, so stale records would otherwise pollute later lookups).
  records.length = 0;
  const timings = new Map<Request, number>();

  page.on("request", (req) => {
    if (!req.url().includes(":4000")) return;
    timings.set(req, Date.now());
    const hasAuth = !!req.headers()["authorization"];
    records.push({
      method: req.method(),
      url: redactUrl(req.url()),
      path: redactPath(req.url()),
      authHeader: hasAuth,
      at: new Date().toISOString(),
    });
  });

  page.on("response", (res: Response) => {
    if (!res.url().includes(":4000")) return;
    const rec = [...records].reverse().find((r) => r.url === redactUrl(res.url()) && r.status === undefined);
    if (rec) {
      rec.status = res.status();
      rec.ok = res.ok();
      const started = timings.get(res.request());
      if (started) rec.ms = Date.now() - started;
      console.log(
        `[NET] ${rec.method} ${rec.path} -> ${rec.status} (${rec.ms ?? "?"}ms, Authorization:${rec.authHeader ? "present" : "absent"})`
      );
    }
  });
}

export function redactUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return u;
  }
}

export function getRecords(): NetRecord[] {
  return records;
}

export function findRecord(method: string, pathFragment: string): NetRecord | undefined {
  // Prefer a record that already received a response (status set); fall back to
  // the earliest matching request so expect.poll can keep observing it mutate.
  const matches = records.filter((r) => r.method === method && r.path.includes(pathFragment));
  return matches.find((r) => r.status !== undefined) ?? matches[0];
}

export function printSummary(): void {
  const api = records.filter((r) => r.status !== undefined);
  console.log("\n===== NETWORK SUMMARY =====");
  for (const r of api) {
    console.log(
      `[NET] ${r.method} ${r.path} ${r.status} ${r.ok ? "OK" : "FAIL"} ${r.ms ?? "?"}ms auth=${r.authHeader ? "yes" : "no"}`
    );
  }
  console.log(`===== TOTAL API REQUESTS OBSERVED: ${api.length} =====\n`);
}
