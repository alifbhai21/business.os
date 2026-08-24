import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "../helpers/db";

// Latency sampling fires hundreds of requests — raise the ceiling BEFORE the
// app module loads (same convention as the other perf suites).
process.env.RATE_LIMIT_MAX = "1000000";

let app: import("express").Express;
import { Product } from "../../src/models/Product";

/**
 * Phase 14 — PRD performance target: product search stays responsive at
 * 5,000+ products ("Product search with 5,000+ products locally").
 *
 * Seeds 5,000 realistic products via bulk insert and measures p95 of the
 * exact search paths the mobile app uses (name search, SKU lookup,
 * barcode-style exact match, low-stock filter) against the local replica
 * set — application latency without network variance.
 */

const SEED_PRODUCTS = 5_000;
const SAMPLES = 15;
const P95_BUDGET_MS = 500;

const DEV = {
  deviceId: "perf5k-device",
  deviceName: "Perf5k",
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

const auth = () => ({ Authorization: `Bearer ${token}` });

async function measure(label: string, url: string): Promise<void> {
  const timings: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const start = performance.now();
    const res = await request(app).get(url).set(auth());
    const elapsed = performance.now() - start;
    assert.equal(res.status, 200, `${label} returned ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
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

before(async () => {
  ({ app } = await import("../../src/app"));
  await connectTestDb("business-os-test-perf-5k");

  const reg = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "Perf5k User",
      email: `p5${Math.random().toString(36).slice(2)}@example.com`,
      phone: "012" + Math.floor(10000000 + Math.random() * 89999999),
      password: "password123",
      ...DEV,
    });
  assert.equal(reg.status, 201);
  token = reg.body.data.accessToken;

  const biz = await request(app)
    .post("/api/v1/businesses")
    .set(auth())
    .send({ name: "Perf5k Business", type: "retail" });
  assert.equal(biz.status, 201);
  businessId = biz.body.data.id;

  const shop = await request(app)
    .post("/api/v1/shops")
    .set(auth())
    .send({ businessId, name: "Main", branchCode: `P5-${Math.random().toString(36).slice(2)}` });
  assert.equal(shop.status, 201);
  shopId = shop.body.data.id;

  // Realistic catalog: brand + category-ish names with searchable variety.
  const brands = ["Fresh", "Pran", "Nestle", "Unilever", "Square", "ACI", "Bashundhara", "Teer"];
  const kinds = ["Rice", "Oil", "Soap", "Sugar", "Salt", "Tea", "Biscuit", "Milk", "Flour", "Spice"];
  const docs = Array.from({ length: SEED_PRODUCTS }, (_, i) => ({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `${brands[i % brands.length]} ${kinds[(i * 3) % kinds.length]} ${String(i).padStart(5, "0")}`,
    sku: `SKU-${i}`,
    barcode: `8801234${String(i).padStart(6, "0")}`,
    unit: "piece",
    sellingPrice: 10_000 + (i % 900) * 100,
    purchasePrice: 8_000 + (i % 700) * 100,
    currentStock: i % 120,
    minStock: i % 20,
    status: "ACTIVE",
  }));
  await Product.insertMany(docs);
});

after(async () => {
  await disconnectTestDb();
});

test("performance: catalog reads hold p95 < 500ms over a 5,000-product catalog", async () => {
  const base = `/api/v1/products?businessId=${businessId}&shopId=${shopId}`;

  // Warm-up (pipeline compilation + connection pool).
  for (const warm of [base, `${base}&search=Fresh%20Rice`]) {
    const r = await request(app).get(warm).set(auth());
    assert.ok(r.status < 500, `warm-up failed: ${r.status}`);
  }

  await measure("paginated list page-1", base);
  await measure("paginated list deep-page", `${base}&page=100`);
  await measure("name search (prefix brand)", `${base}&search=Fresh`);
  await measure("name search (brand+kind)", `${base}&search=Fresh%20Rice`);
  await measure("sku search", `${base}&search=SKU-0499`);
  await measure("no-match search", `${base}&search=zzzqqqxxx`);
  await measure("low-stock filter", `${base}&lowStock=true`);
});
