import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { SyncEvent } from "../src/models/SyncEvent";

/**
 * Phase 14 — sync success-rate KPI (GET /api/v1/sync/stats).
 *
 * The Phase 10 SyncEvent ledger is the PRD's observability surface for
 * offline reliability. These tests seed deterministic event rows directly
 * (the ledger itself is already covered by sync tests) and verify the KPI
 * aggregation math, windowing, RBAC, tenant isolation and validation.
 */

let app: import("express").Express;

const DEV = {
  deviceId: "syncstats-device",
  deviceName: "SyncStats",
  platform: "android",
  appVersion: "1.0.0",
};

async function registerUser() {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "KPI User",
      email: `kpi${Math.random().toString(36).slice(2)}@example.com`,
      phone: "013" + Math.floor(10000000 + Math.random() * 89999999),
      password: "password123",
      ...DEV,
    });
  assert.equal(res.status, 201);
  return res.body.data as { accessToken: string; user: { id: string } };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let ownerToken: string;
let ownerId: string;
let businessId: string;

async function seedEvent(over: Partial<Record<string, unknown>>) {
  const doc = await SyncEvent.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    userId: new mongoose.Types.ObjectId(ownerId),
    direction: "PUSH",
    opCount: 1,
    okCount: 1,
    failedCount: 0,
    conflictCount: 0,
    status: "SUCCESS",
    error: null,
    ...over,
  });
  return doc;
}

before(async () => {
  ({ app } = await import("../src/app"));
  await connectTestDb("business-os-test-sync-kpi");

  const user = await registerUser();
  ownerToken = user.accessToken;
  ownerId = user.user.id;

  const biz = await request(app)
    .post("/api/v1/businesses")
    .set(auth(ownerToken))
    .send({ name: "KPI Biz", type: "retail" });
  assert.equal(biz.status, 201);
  businessId = biz.body.data.id as string;
});

after(async () => {
  await disconnectTestDb();
});

test("sync stats: deterministic aggregation over PUSH/PULL/RESTORE", async () => {
  // Seeded mutation window: 8 ok, 2 conflicts, 4 failed ops across 4 pushes.
  await seedEvent({ direction: "PUSH", opCount: 3, okCount: 3, status: "SUCCESS" });
  await seedEvent({ direction: "PUSH", opCount: 5, okCount: 5, status: "SUCCESS" });
  await seedEvent({ direction: "PUSH", opCount: 2, okCount: 0, conflictCount: 2, status: "FAILED", error: "validation conflict" });
  await seedEvent({ direction: "PUSH", opCount: 4, okCount: 0, failedCount: 4, status: "FAILED", error: "boom" });
  await seedEvent({ direction: "PULL", opCount: 10, okCount: 10, status: "SUCCESS" });
  await seedEvent({ direction: "RESTORE", opCount: 25, okCount: 25, status: "SUCCESS" });

  const res = await request(app)
    .get(`/api/v1/sync/stats?businessId=${businessId}`)
    .set(auth(ownerToken));
  assert.equal(res.status, 200);

  const data = res.body.data;

  const push = data.directions.find((d: { direction: string }) => d.direction === "PUSH");
  assert.ok(push);
  assert.equal(push.events, 4);
  // Op-level mutation ratio: 8 ok / 14 attempted (8+2 conflicts+4 failed).
  assert.equal(push.ops.attempted, 14);
  assert.equal(push.ops.ok, 8);
  assert.equal(push.ops.conflicts, 2);
  assert.equal(push.ops.failed, 4);
  assert.equal(push.ops.successRate, Math.round((8 / 14) * 10000) / 100);

  // Overall across ALL directions: 43 ok ops / 49 attempted.
  assert.equal(data.totals.okOps, 43);
  assert.equal(data.totals.badOps, 6);
  assert.equal(data.overallSuccessRate, Math.round((43 / 49) * 10000) / 100);

  // Recent failures surface the two FAILED/PARTIAL pushes with their errors.
  assert.equal(data.recentFailures.length, 2);
  assert.ok(data.recentFailures.every((f: { error: string | null }) => f.error !== null));
});

test("sync stats: since window excludes older events", async () => {
  // Backdate the RESTORE event 90 days. Mongoose treats createdAt as
  // immutable, so go through the RAW collection (no casting/plugins).
  const old = await SyncEvent.findOne({ businessId: new mongoose.Types.ObjectId(businessId), direction: "RESTORE" });
  assert.ok(old);
  await SyncEvent.collection.updateOne(
    { _id: old._id },
    { $set: { createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } }
  );

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await request(app)
    .get(`/api/v1/sync/stats?businessId=${businessId}&since=${encodeURIComponent(since)}`)
    .set(auth(ownerToken));
  assert.equal(res.status, 200);

  const restore = res.body.data.directions.find(
    (d: { direction: string; events: number }) => d.direction === "RESTORE"
  );
  assert.equal(restore.events, 0, "backdated RESTORE must fall outside the window");
});

test("sync stats: RBAC — Viewer forbidden (403)", async () => {
  const viewer = await registerUser();
  await mongoose.model("BusinessMembership").create({
    userId: new mongoose.Types.ObjectId(viewer.user.id),
    businessId: new mongoose.Types.ObjectId(businessId),
    role: "Viewer",
    status: "ACTIVE",
  });
  const res = await request(app)
    .get(`/api/v1/sync/stats?businessId=${businessId}`)
    .set(auth(viewer.accessToken));
  assert.equal(res.status, 403);
});

test("sync stats: tenant isolation — outsider gets 404 with no data", async () => {
  const outsider = await registerUser();
  const res = await request(app)
    .get(`/api/v1/sync/stats?businessId=${businessId}`)
    .set(auth(outsider.accessToken));
  assert.equal(res.status, 404);
  assert.equal(res.body.data, undefined);
});

test("sync stats: validation — malformed since rejected 400", async () => {
  const res = await request(app)
    .get(`/api/v1/sync/stats?businessId=${businessId}&since=not-a-date`)
    .set(auth(ownerToken));
  assert.equal(res.status, 400);
});

test("sync stats: unauthenticated is 401", async () => {
  const res = await request(app).get(`/api/v1/sync/stats?businessId=${businessId}`);
  assert.equal(res.status, 401);
});
