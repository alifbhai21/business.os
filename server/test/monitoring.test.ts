import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { redactText } from "../src/utils/logger";
import { resetLatencyStats, routeKeyOf } from "../src/middleware/metrics";

/**
 * Phase 14 — structured logging redaction + API latency monitoring.
 */

let app: import("express").Express;

before(async () => {
  ({ app } = await import("../src/app"));
  await connectTestDb("business-os-test-monitoring");
});

after(async () => {
  await disconnectTestDb();
});

// ---------------------------------------------------------------------------
// Redaction (no secrets/PII in logs)
// ---------------------------------------------------------------------------

test("redaction: MongoDB credentials never survive logging", () => {
  const out = redactText("connected mongodb+srv://rakin:hunter2@cluster0.x.mongodb.net/business_os");
  assert.ok(!out.includes("hunter2"));
  assert.ok(!out.includes("rakin:"));
  assert.match(out, /mongodb\+srv:\/\/\*\*\*:\*\*\*@/);
});

test("redaction: postgres URIs are masked the same way", () => {
  const out = redactText("postgresql://admin:s3cret@127.0.0.1:5432/app_db");
  assert.ok(!out.includes("s3cret"));
  assert.ok(out.includes("postgresql://***:***@127.0.0.1:5432/app_db"));
});

test("redaction: bearer tokens are replaced", () => {
  const out = redactText('auth header "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig123" received');
  assert.ok(!out.includes("eyJhbGciOiJIUzI1NiJ9"));
  assert.ok(out.includes("Bearer ***"));
});

test("redaction: raw JWT-shaped strings are replaced", () => {
  const token = "aaaabbbbccccdddd.eeeeffffgggghhhh.iiii jjjj kkkk llll".replace(/\s/g, "");
  const out = redactText(`token=${token}`);
  assert.ok(!out.includes(token));
  assert.match(out, /\*\*\*jwt\*\*\*/);
});

test("redaction: emails are masked but domains survive", () => {
  const out = redactText("user rahim.uddin@example.com logged in");
  assert.ok(!out.includes("rahim.uddin@"));
  assert.ok(out.includes("r***@example.com"));
});

test("redaction: long hex secrets collapse", () => {
  const secret = "a".repeat(48);
  const out = redactText(`key ${secret} end`);
  assert.ok(!out.includes(secret));
  assert.ok(out.includes("(hex)"));
});

// ---------------------------------------------------------------------------
// Route-key normalization (bounded metric cardinality)
// ---------------------------------------------------------------------------

test("route keys: ids/numbers/blob segments normalize to bounded placeholders", () => {
  assert.equal(
    routeKeyOf("/api/v1/products/665f0a1b9c3d4e5f6a7b8c9d"),
    "/api/v1/products/:id"
  );
  assert.equal(routeKeyOf("/reports/2024/08"), "/reports/:num/:num");
  const blob = "x".repeat(40);
  assert.equal(routeKeyOf(`/weird/${blob}`), "/weird/:blob");
});

// ---------------------------------------------------------------------------
// GET /api/v1/ops/metrics
// ---------------------------------------------------------------------------

const DEV = {
  deviceId: "ops-device",
  deviceName: "Ops",
  platform: "android",
  appVersion: "1.0.0",
};

async function registerUser(over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "Ops User",
      email: `ops${Math.random().toString(36).slice(2)}@example.com`,
      phone: "014" + Math.floor(10000000 + Math.random() * 89999999),
      password: "password123",
      ...DEV,
      ...over,
    });
  assert.equal(res.status, 201);
  return res.body.data as { accessToken: string; user: { id: string } };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Owner/Admin gate requires a REAL ACTIVE membership in some business. */
async function registerWithBusiness(role: "Owner" | "Salesperson") {
  const user = await registerUser();
  if (role === "Owner") {
    const biz = await request(app)
      .post("/api/v1/businesses")
      .set(auth(user.accessToken))
      .send({ name: `Ops Biz ${Math.random().toString(36).slice(2)}`, type: "retail" });
    assert.equal(biz.status, 201);
    return { user, businessId: biz.body.data.id as string };
  }
  // Salesperson: member of someone else's business.
  const owner = await registerUser();
  const biz = await request(app)
    .post("/api/v1/businesses")
    .set(auth(owner.accessToken))
    .send({ name: `Ops Biz ${Math.random().toString(36).slice(2)}`, type: "retail" });
  assert.equal(biz.status, 201);
  await mongoose.model("BusinessMembership").create({
    userId: new mongoose.Types.ObjectId(user.user.id),
    businessId: new mongoose.Types.ObjectId(biz.body.data.id),
    role: "Salesperson",
    status: "ACTIVE",
  });
  return { user, businessId: biz.body.data.id as string };
}

test("ops metrics: unauthenticated is 401", async () => {
  const res = await request(app).get("/api/v1/ops/metrics");
  assert.equal(res.status, 401);
});

test("ops metrics: Owner sees process health and latency percentiles", async () => {
  const { user: owner } = await registerWithBusiness("Owner");

  // Generate traffic so the histogram has real samples.
  resetLatencyStats();
  for (let i = 0; i < 3; i++) {
    const probe = await request(app).get("/health"); // exempt — not tracked
    assert.equal(probe.status, 200);
    const res = await request(app).get("/api/v1/units").set(auth(owner.accessToken));
    assert.equal(res.status, 200);
  }

  const res = await request(app)
    .get("/api/v1/ops/metrics")
    .set(auth(owner.accessToken));
  assert.equal(res.status, 200);

  const data = res.body.data;
  assert.ok(data.process.uptimeSec >= 0);
  assert.ok(data.process.rssMb > 0);
  assert.equal(data.db.state, "connected");
  assert.equal(data.sentry, "not_configured");

  const unitsRoute = data.latency.routes.find((r: { routeKey: string }) =>
    r.routeKey.startsWith("/api/v1/units")
  );
  assert.ok(unitsRoute, "tracked traffic must appear in the latency table");
  assert.ok(unitsRoute.count >= 3);
  assert.equal(unitsRoute.errors, 0);
  assert.ok(unitsRoute.p95Ms >= 0 && unitsRoute.p95Ms < 500);
  assert.ok(data.latency.overall.p95Ms >= 0);

  // /health is probe-exempt and must NOT appear as a tracked route.
  assert.ok(
    !data.latency.routes.some((r: { routeKey: string }) => r.routeKey === "/health"),
    "/health must be exempt from latency tracking"
  );
});

test("ops metrics: authenticated non-privileged user is forbidden (403)", async () => {
  const plain = await registerUser(); // no membership at all
  const res = await request(app)
    .get("/api/v1/ops/metrics")
    .set(auth(plain.accessToken));
  assert.equal(res.status, 403);
});

test("ops metrics: Salesperson membership is insufficient (403)", async () => {
  const { user } = await registerWithBusiness("Salesperson");
  const res = await request(app)
    .get("/api/v1/ops/metrics")
    .set(auth(user.accessToken));
  assert.equal(res.status, 403);
});
