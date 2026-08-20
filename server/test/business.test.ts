import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app";
import { Shop } from "../src/models/Shop";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

const DEV = { deviceId: "biz-test-dev", deviceName: "BizTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Biz User",
    email: `biz${Math.random().toString(36).slice(2)}@example.com`,
    phone: "018" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
    ...over,
  };
}

async function registerUser() {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  return res.body.data;
}

// Register no longer auto-creates a Business; tests must create one explicitly
// (this mirrors the real onboarding flow: Register → Business Setup → Shop Setup).
async function createBusiness(token: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Test Business", type: "retail", ...over });
  return res.body.data;
}

before(async () => {
  await connectTestDb("business-os-test-biz");
});

after(async () => {
  await disconnectTestDb();
});

// ── Business ────────────────────────────────────────────────
test("business: authenticated user can create a Business", async () => {
  const user = await registerUser();
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ name: "Test Business", type: "retail" });
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.name, "Test Business");
  assert.ok(res.body.data.id);
});

test("business: creation validates required fields", async () => {
  const user = await registerUser();
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ name: "", type: "retail" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("business: invalid business type is rejected", async () => {
  const user = await registerUser();
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ name: "X", type: "not-a-type" });
  assert.equal(res.status, 400);
});

test("business: authenticated member can list permitted businesses", async () => {
  const user = await registerUser();
  // Fresh account starts with zero businesses (no auto-created default)
  const empty = await request(app).get("/api/v1/businesses").set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data, []);

  await createBusiness(user.accessToken, { name: "Listed Biz" });
  const res = await request(app).get("/api/v1/businesses").set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].name, "Listed Biz");
});

test("business: owner can update own Business", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const res = await request(app)
    .put(`/api/v1/businesses/${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ name: "Renamed Business" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, "Renamed Business");
});

test("business: user without membership cannot access Business (404)", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizB = await createBusiness(userB.accessToken);
  const res = await request(app)
    .get(`/api/v1/businesses/${bizB.id}`)
    .set("Authorization", `Bearer ${userA.accessToken}`);
  assert.equal(res.status, 404);
});

test("business: modules endpoint works and matches configured type", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const res = await request(app)
    .get(`/api/v1/businesses/${biz.id}/modules`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.type, "retail");
  assert.ok(Array.isArray(res.body.data.modules));
  assert.ok(res.body.data.modules.includes("sales"));
  assert.ok(res.body.data.modules.includes("inventory"));
});

test("business: unauthenticated user denied", async () => {
  const res = await request(app).get("/api/v1/businesses");
  assert.equal(res.status, 401);
});

// ── Shop ────────────────────────────────────────────────────
test("shop: authorized user can create Shop", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "Main Branch", branchCode: "BN-01" });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.branchCode, "BN-01");
});

test("shop: invalid Shop data rejected", async () => {
  const user = await registerUser();
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: "fake", name: "", branchCode: "" });
  assert.equal(res.status, 400);
});

test("shop: user can list Shops for authorized Business", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "A", branchCode: "A-1" });
  const res = await request(app)
    .get(`/api/v1/shops?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test("shop: user can get authorized Shop", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const created = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "B", branchCode: "B-1" });
  const res = await request(app)
    .get(`/api/v1/shops/${created.body.data.id}?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.branchCode, "B-1");
});

test("shop: user can update authorized Shop", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const created = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "C", branchCode: "C-1" });
  const res = await request(app)
    .patch(`/api/v1/shops/${created.body.data.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "C2" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, "C2");
});

test("shop: user can activate/deactivate Shop", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const created = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "D", branchCode: "D-1" });
  const res = await request(app)
    .patch(`/api/v1/shops/${created.body.data.id}/status`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, status: "INACTIVE" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, "INACTIVE");
});

test("shop: duplicate branchCode within same Business rejected", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "E", branchCode: "E-1" });
  const dup = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "E2", branchCode: "E-1" });
  assert.equal(dup.status, 409); // unique branchCode violation → conflict
  assert.match(dup.body.error.message, /branch code already exists/i);
});

test("shop: same branchCode in different Business allowed", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const bizB = await createBusiness(userB.accessToken);
  const a = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${userA.accessToken}`)
    .send({ businessId: bizA.id, name: "F", branchCode: "F-1" });
  const b = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${userB.accessToken}`)
    .send({ businessId: bizB.id, name: "F2", branchCode: "F-1" });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
});

test("shop: unauthorized Shop access denied (cross-tenant)", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const bizB = await createBusiness(userB.accessToken);
  const created = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${userA.accessToken}`)
    .send({ businessId: bizA.id, name: "G", branchCode: "G-1" });
  const shopA = created.body.data.id;

  // B cannot list A's shops
  const deniedList = await request(app)
    .get(`/api/v1/shops?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedList.status, 404);

  // B cannot get A's shop
  const deniedGet = await request(app)
    .get(`/api/v1/shops/${shopA}?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedGet.status, 404);

  // B cannot create a shop in A's business
  const deniedCreate = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${userB.accessToken}`)
    .send({ businessId: bizA.id, name: "Intruder", branchCode: "I-1" });
  assert.equal(deniedCreate.status, 404);

  // Only A's original shop exists in A's business
  const count = await Shop.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id) });
  assert.equal(count, 1);
});

test("shop: unauthenticated user denied", async () => {
  const res = await request(app).get("/api/v1/shops?businessId=abc");
  assert.equal(res.status, 401);
});

// ── Onboarding chain (Register → Business Setup → Shop Setup) ──
test("onboarding: register → explicit business (Owner) → first shop", async () => {
  const user = await registerUser();

  // 1. Register created NO business
  assert.equal(user.businessId, null);
  const none = await request(app).get("/api/v1/businesses").set("Authorization", `Bearer ${user.accessToken}`);
  assert.deepEqual(none.body.data, []);

  // 2. Business Setup creates the real Business with Owner membership
  const biz = await createBusiness(user.accessToken, { name: "Onboard Business", type: "retail" });
  assert.ok(biz.id);
  const mem = await BusinessMembership.findOne({
    userId: user.user.id,
    businessId: new mongoose.Types.ObjectId(biz.id),
  });
  assert.ok(mem);
  assert.equal(mem!.role, "Owner");
  assert.equal(mem!.status, "ACTIVE");

  // 3. Shop Setup creates the first Shop under that Business
  const shopRes = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "First Branch", branchCode: "MAIN-01" });
  assert.equal(shopRes.status, 201);

  const shops = await request(app)
    .get(`/api/v1/shops?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(shops.body.data.length, 1);
  assert.equal(shops.body.data[0].branchCode, "MAIN-01");
});