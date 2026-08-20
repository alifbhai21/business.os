import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app";
import { Supplier } from "../src/models/Supplier";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

const DEV = { deviceId: "sup-test-dev", deviceName: "SupTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Supplier User",
    email: `sup${Math.random().toString(36).slice(2)}@example.com`,
    phone: "015" + Math.floor(10000000 + Math.random() * 89999999),
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
    .send({ name: "Supplier Business", type: "retail", ...over });
  return res.body.data;
}

function supplierBody(over: Record<string, unknown> = {}) {
  return {
    name: "Abdul Traders",
    phone: "01799999999",
    email: "abdul@traders.com",
    company: "Abdul & Sons",
    address: "Chittagong",
    openingBalance: 20000,
    ...over,
  };
}

async function createSupplier(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, ...supplierBody(over) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function setMembershipRole(userId: string, businessId: string, role: string) {
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { role }
  );
}

before(async () => {
  await connectTestDb("business-os-test-sup");
});

after(async () => {
  await disconnectTestDb();
});

test("supplier: owner can create a Supplier with all PRD fields", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const res = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, ...supplierBody() });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.name, "Abdul Traders");
  assert.equal(res.body.data.phone, "01799999999");
  assert.equal(res.body.data.email, "abdul@traders.com");
  assert.equal(res.body.data.company, "Abdul & Sons");
  assert.equal(res.body.data.address, "Chittagong");
  assert.equal(res.body.data.openingBalance, 20000);
  // Opening balance seeds the current payable.
  assert.equal(res.body.data.currentPayable, 20000);
  assert.equal(res.body.data.status, "ACTIVE");
});

test("supplier: create validates required fields and amounts", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const noName = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "" });
  assert.equal(noName.status, 400);
  assert.equal(noName.body.error.code, "VALIDATION_ERROR");

  const negativeBalance = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "X", openingBalance: -1 });
  assert.equal(negativeBalance.status, 400);
});

test("supplier: list is paginated and searchable by name/phone/company", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await createSupplier(user.accessToken, biz.id, { name: "Alpha Traders", phone: "01700000001", company: "Alpha Co" });
  await createSupplier(user.accessToken, biz.id, { name: "Beta Traders", phone: "01700000002", company: "Beta Co" });
  await createSupplier(user.accessToken, biz.id, { name: "Gamma Traders", phone: "01700000003", company: "Gamma Co" });

  const byName = await request(app)
    .get(`/api/v1/suppliers?businessId=${biz.id}&search=beta`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(byName.status, 200);
  assert.equal(byName.body.data.items.length, 1);
  assert.equal(byName.body.data.items[0].name, "Beta Traders");

  const byPhone = await request(app)
    .get(`/api/v1/suppliers?businessId=${biz.id}&search=01700000003`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(byPhone.body.data.items.length, 1);

  const byCompany = await request(app)
    .get(`/api/v1/suppliers?businessId=${biz.id}&search=alpha co`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(byCompany.body.data.items.length, 1);

  const page = await request(app)
    .get(`/api/v1/suppliers?businessId=${biz.id}&page=1&limit=2`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(page.body.data.items.length, 2);
  assert.equal(page.body.data.pagination.total, 3);
  assert.equal(page.body.data.pagination.totalPages, 2);
});

test("supplier: owner can get own Supplier by id", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const sup = await createSupplier(user.accessToken, biz.id);
  const res = await request(app)
    .get(`/api/v1/suppliers/${sup.id}?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, sup.id);
});

test("supplier: owner can update Supplier", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const sup = await createSupplier(user.accessToken, biz.id);
  const res = await request(app)
    .patch(`/api/v1/suppliers/${sup.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "Updated Traders", company: "New Co" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, "Updated Traders");
  assert.equal(res.body.data.company, "New Co");
});

test("supplier: opening balance change adjusts current payable by the same delta", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const sup = await createSupplier(user.accessToken, biz.id, { openingBalance: 20000 });
  const res = await request(app)
    .patch(`/api/v1/suppliers/${sup.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, openingBalance: 5000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.openingBalance, 5000);
  assert.equal(res.body.data.currentPayable, 5000);
});

test("supplier: owner can activate/deactivate Supplier", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const sup = await createSupplier(user.accessToken, biz.id);
  const res = await request(app)
    .patch(`/api/v1/suppliers/${sup.id}/status`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, status: "INACTIVE" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, "INACTIVE");
  const list = await request(app)
    .get(`/api/v1/suppliers?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(list.body.data.items.length, 0);
});

test("supplier: Viewer role cannot create/update (403)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await setMembershipRole(user.user.id, biz.id, "Viewer");
  const create = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, ...supplierBody() });
  assert.equal(create.status, 403);
  const list = await request(app)
    .get(`/api/v1/suppliers?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(list.status, 200);
});

test("supplier: cross-tenant isolation — Business A never sees B's suppliers", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const bizB = await createBusiness(userB.accessToken);
  const supA = await createSupplier(userA.accessToken, bizA.id);

  const deniedList = await request(app)
    .get(`/api/v1/suppliers?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedList.status, 404);

  const deniedGet = await request(app)
    .get(`/api/v1/suppliers/${supA.id}?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedGet.status, 404);

  const deniedCreate = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${userB.accessToken}`)
    .send({ businessId: bizA.id, ...supplierBody({ name: "Intruder" }) });
  assert.equal(deniedCreate.status, 404);

  const count = await Supplier.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id) });
  assert.equal(count, 1);
});

test("supplier: unauthenticated user denied", async () => {
  const res = await request(app).get("/api/v1/suppliers?businessId=abc");
  assert.equal(res.status, 401);
});