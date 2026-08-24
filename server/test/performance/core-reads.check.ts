import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "../helpers/db";

// This file fires hundreds of requests on purpose (latency sampling). Raise
// the per-minute ceiling BEFORE the app module loads, exactly like the
// real-Atlas harness does via `cross-env RATE_LIMIT_MAX=...`.
process.env.RATE_LIMIT_MAX = "1000000";

// Loaded lazily so the env tweak above lands before loadEnv() runs.
let app: Express;

import { Product } from "../../src/models/Product";

/**
 * Phase 13 — performance smoke test (PRD: p95 < 500ms on core reads).
 *
 * Runs against the local in-memory replica set so it measures APPLICATION
 * latency (middleware → controller → service → query) without network
 * variance. Seeds a realistic small-merchant dataset (300 products), then
 * samples the core read endpoints and asserts p95 stays under 500ms.
 */

const SEED_PRODUCTS = 300;
const SAMPLES = 30;
const P95_BUDGET_MS = 500;

const DEV = {
  deviceId: "perf-device",
  deviceName: "Perf",
  platform: "android",
  appVersion: "1.0.0",
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

let token: string;
let businessId: string;
let shopId: string;

async function registerUser() {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "Perf User",
      email: `perf${Math.random().toString(36).slice(2)}@example.com`,
      phone: "016" + Math.floor(10000000 + Math.random() * 89999999),
      password: "password123",
      ...DEV,
    });
  assert.equal(res.status, 201);
  return res.body.data as { accessToken: string; user: { id: string } };
}

const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  ({ app } = await import("../../src/app"));
  await connectTestDb("business-os-test-perf");

  const user = await registerUser();
  token = user.accessToken;

  const bizRes = await request(app)
    .post("/api/v1/businesses")
    .set(auth())
    .send({ name: "Perf Business", type: "retail" });
  assert.equal(bizRes.status, 201);
  businessId = bizRes.body.data.id;

  const shopRes = await request(app)
    .post("/api/v1/shops")
    .set(auth())
    .send({ businessId, name: "Main", branchCode: `PF-${Math.random().toString(36).slice(2)}` });
  assert.equal(shopRes.status, 201);
  shopId = shopRes.body.data.id;

  // Bulk-seed via the model (not HTTP) — this file measures READS.
  const businessObjId = new mongoose.Types.ObjectId(businessId);
  const docs = Array.from({ length: SEED_PRODUCTS }, (_, i) => ({
    businessId: businessObjId,
    name: `Perf Product ${String(i).padStart(4, "0")}`,
    sku: `PF-${i}`,
    unit: "piece",
    sellingPrice: 10_000 + i,
    purchasePrice: 5_000 + i,
    currentStock: 10 + (i % 50),
    status: "ACTIVE",
  }));
  await Product.insertMany(docs);
});

after(async () => {
  await disconnectTestDb();
});

test("performance: core reads hold p95 < 500ms on a 300-product catalog", async () => {
  // Warm-up round (compiles aggregation pipelines, fills connection pool).
  for (const url of [
    `/api/v1/products?businessId=${businessId}&shopId=${shopId}`,
    `/api/v1/dashboard?businessId=${businessId}&shopId=${shopId}`,
    `/api/v1/reports/sales?businessId=${businessId}&shopId=${shopId}&groupBy=daily`,
  ]) {
    const warm = await request(app).get(url).set(auth());
    assert.ok(warm.status < 500, `warm-up ${url} failed with ${warm.status}`);
  }

  const targets: Array<[string, string]> = [
    ["products list", `/api/v1/products?businessId=${businessId}&shopId=${shopId}`],
    ["products search", `/api/v1/products?businessId=${businessId}&shopId=${shopId}&search=Perf%20Product%2001`],
    ["low stock filter", `/api/v1/products?businessId=${businessId}&shopId=${shopId}&lowStock=true`],
    ["dashboard", `/api/v1/dashboard?businessId=${businessId}&shopId=${shopId}`],
    ["sales report", `/api/v1/reports/sales?businessId=${businessId}&shopId=${shopId}&groupBy=daily`],
    ["inventory report", `/api/v1/reports/inventory?businessId=${businessId}&shopId=${shopId}`],
    ["receivables", `/api/v1/reports/receivables?businessId=${businessId}&shopId=${shopId}`],
    ["trial balance", `/api/v1/accounting/trial-balance?businessId=${businessId}&shopId=${shopId}`],
  ];

  for (const [label, url] of targets) {
    const timings: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const start = performance.now();
      const res = await request(app).get(url).set(auth());
      const elapsed = performance.now() - start;
      assert.equal(
        res.status,
        200,
        `${label} returned ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`
      );
      timings.push(elapsed);
    }
    timings.sort((a, b) => a - b);
    const p95 = percentile(timings, 95);
    const p50 = percentile(timings, 50);
    assert.ok(
      p95 < P95_BUDGET_MS,
      `${label} p95=${p95.toFixed(1)}ms exceeds the ${P95_BUDGET_MS}ms budget (p50=${p50.toFixed(1)}ms)`
    );
  }
});
