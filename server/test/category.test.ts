import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Category } from "../src/models/Category";
import { BusinessMembership } from "../src/models/BusinessMembership";

const DEV = { deviceId: "cat-test-dev", deviceName: "CatTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Category User",
    email: `cat${Math.random().toString(36).slice(2)}@example.com`,
    phone: "019" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
    ...over,
  };
}

async function registerUser() {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  return res.body.data;
}

async function createBusiness(token: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Cat Business", type: "retail", ...over });
  return res.body.data;
}

async function createCategory(token: string, businessId: string, name: string) {
  const res = await request(app)
    .post("/api/v1/categories")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function setMembershipRole(userId: string, businessId: string, role: string) {
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { role }
  );
}

before(async () => {
  await connectTestDb("business-os-test-cat");
});

after(async () => {
  await disconnectTestDb();
});

test("category: owner can create a Category", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const res = await request(app)
    .post("/api/v1/categories")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "Beverages" });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.name, "Beverages");
  assert.equal(res.body.data.status, "ACTIVE");
  assert.ok(res.body.data.id);
});

test("category: create validates required fields", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const res = await request(app)
    .post("/api/v1/categories")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("category: duplicate name within same Business rejected (409)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await createCategory(user.accessToken, biz.id, "Snacks");
  const dup = await request(app)
    .post("/api/v1/categories")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "Snacks" });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error.message, /already exists/i);
});

test("category: same name in different Businesses allowed", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const bizB = await createBusiness(userB.accessToken);
  const a = await request(app)
    .post("/api/v1/categories")
    .set("Authorization", `Bearer ${userA.accessToken}`)
    .send({ businessId: bizA.id, name: "Shared" });
  const b = await request(app)
    .post("/api/v1/categories")
    .set("Authorization", `Bearer ${userB.accessToken}`)
    .send({ businessId: bizB.id, name: "Shared" });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
});

test("category: user can list own Business categories (paginated)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  for (let i = 0; i < 5; i++) {
    await createCategory(user.accessToken, biz.id, `Cat ${i}`);
  }
  const res = await request(app)
    .get(`/api/v1/categories?businessId=${biz.id}&page=1&limit=2`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.items.length, 2);
  assert.equal(res.body.data.pagination.total, 5);
  assert.equal(res.body.data.pagination.totalPages, 3);
  assert.equal(res.body.data.pagination.page, 1);
});

test("category: search filters by name", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await createCategory(user.accessToken, biz.id, "Beverages");
  await createCategory(user.accessToken, biz.id, "Biscuits");
  const res = await request(app)
    .get(`/api/v1/categories?businessId=${biz.id}&search=bev`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.items.length, 1);
  assert.equal(res.body.data.items[0].name, "Beverages");
});

test("category: user can get own Category by id", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const cat = await createCategory(user.accessToken, biz.id, "Dairy");
  const res = await request(app)
    .get(`/api/v1/categories/${cat.id}?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, "Dairy");
});

test("category: owner can update own Category", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const cat = await createCategory(user.accessToken, biz.id, "Old Name");
  const res = await request(app)
    .patch(`/api/v1/categories/${cat.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "New Name", description: "updated" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, "New Name");
  assert.equal(res.body.data.description, "updated");
});

test("category: owner can activate/deactivate Category (soft-delete)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const cat = await createCategory(user.accessToken, biz.id, "Soft");
  const res = await request(app)
    .patch(`/api/v1/categories/${cat.id}/status`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, status: "INACTIVE" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, "INACTIVE");
  // Inactive categories are hidden from the default list.
  const list = await request(app)
    .get(`/api/v1/categories?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(list.body.data.items.length, 0);
});

test("category: Viewer role cannot create/update (403)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await setMembershipRole(user.user.id, biz.id, "Viewer");
  const create = await request(app)
    .post("/api/v1/categories")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "Nope" });
  assert.equal(create.status, 403);
  // Read is still allowed for any member.
  const list = await request(app)
    .get(`/api/v1/categories?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(list.status, 200);
});

test("category: cross-tenant isolation — Business A never sees B's categories", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const bizB = await createBusiness(userB.accessToken);
  const catA = await createCategory(userA.accessToken, bizA.id, "Secret A");

  // B cannot list A's categories (404 — business not accessible).
  const deniedList = await request(app)
    .get(`/api/v1/categories?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedList.status, 404);

  // B cannot get A's category.
  const deniedGet = await request(app)
    .get(`/api/v1/categories/${catA.id}?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedGet.status, 404);

  // B cannot create a category in A's business.
  const deniedCreate = await request(app)
    .post("/api/v1/categories")
    .set("Authorization", `Bearer ${userB.accessToken}`)
    .send({ businessId: bizA.id, name: "Intruder" });
  assert.equal(deniedCreate.status, 404);

  // Only A's category exists in A's business.
  const count = await Category.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id) });
  assert.equal(count, 1);
});

test("category: unauthenticated user denied", async () => {
  const res = await request(app).get("/api/v1/categories?businessId=abc");
  assert.equal(res.status, 401);
});