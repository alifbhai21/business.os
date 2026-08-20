import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app";
import { Customer } from "../src/models/Customer";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

const DEV = { deviceId: "cust-test-dev", deviceName: "CustTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Customer User",
    email: `cust${Math.random().toString(36).slice(2)}@example.com`,
    phone: "016" + Math.floor(10000000 + Math.random() * 89999999),
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
    .send({ name: "Customer Business", type: "retail", ...over });
  return res.body.data;
}

function customerBody(over: Record<string, unknown> = {}) {
  return {
    name: "Rahim Uddin",
    phone: "01812345678",
    email: "rahim@example.com",
    address: "Dhaka",
    customerCode: "C-001",
    openingBalance: 10000,
    creditLimit: 50000,
    ...over,
  };
}

async function createCustomer(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, ...customerBody(over) });
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
  await connectTestDb("business-os-test-cust");
});

after(async () => {
  await disconnectTestDb();
});

test("customer: owner can create a Customer with all PRD fields", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const res = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, ...customerBody() });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.name, "Rahim Uddin");
  assert.equal(res.body.data.phone, "01812345678");
  assert.equal(res.body.data.email, "rahim@example.com");
  assert.equal(res.body.data.customerCode, "C-001");
  assert.equal(res.body.data.openingBalance, 10000);
  assert.equal(res.body.data.creditLimit, 50000);
  // Opening balance seeds the current due.
  assert.equal(res.body.data.currentDue, 10000);
  assert.equal(res.body.data.status, "ACTIVE");
});

test("customer: create validates required fields and amounts", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const noName = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "" });
  assert.equal(noName.status, 400);
  assert.equal(noName.body.error.code, "VALIDATION_ERROR");

  const badEmail = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "X", email: "not-an-email" });
  assert.equal(badEmail.status, 400);

  const negativeBalance = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "X", openingBalance: -100 });
  assert.equal(negativeBalance.status, 400);
});

test("customer: duplicate phone numbers allowed (non-unique index)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await createCustomer(user.accessToken, biz.id, { name: "First" });
  const second = await createCustomer(user.accessToken, biz.id, { name: "Second" });
  assert.ok(second.id);
});

test("customer: list is paginated and searchable by name/phone/code", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await createCustomer(user.accessToken, biz.id, { name: "Karim", phone: "01800000001", customerCode: "K-1" });
  await createCustomer(user.accessToken, biz.id, { name: "Rahim", phone: "01800000002", customerCode: "R-1" });
  await createCustomer(user.accessToken, biz.id, { name: "Salim", phone: "01800000003", customerCode: "S-1" });

  const byName = await request(app)
    .get(`/api/v1/customers?businessId=${biz.id}&search=rahim`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(byName.status, 200);
  assert.equal(byName.body.data.items.length, 1);
  assert.equal(byName.body.data.items[0].name, "Rahim");

  const byPhone = await request(app)
    .get(`/api/v1/customers?businessId=${biz.id}&search=01800000003`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(byPhone.body.data.items.length, 1);
  assert.equal(byPhone.body.data.items[0].name, "Salim");

  const byCode = await request(app)
    .get(`/api/v1/customers?businessId=${biz.id}&search=K-1`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(byCode.body.data.items.length, 1);

  const page = await request(app)
    .get(`/api/v1/customers?businessId=${biz.id}&page=1&limit=2`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(page.body.data.items.length, 2);
  assert.equal(page.body.data.pagination.total, 3);
  assert.equal(page.body.data.pagination.totalPages, 2);
});

test("customer: owner can get own Customer by id", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const cust = await createCustomer(user.accessToken, biz.id);
  const res = await request(app)
    .get(`/api/v1/customers/${cust.id}?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, cust.id);
});

test("customer: owner can update Customer", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const cust = await createCustomer(user.accessToken, biz.id, { openingBalance: 10000 });
  const res = await request(app)
    .patch(`/api/v1/customers/${cust.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, name: "Updated Name", creditLimit: 75000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, "Updated Name");
  assert.equal(res.body.data.creditLimit, 75000);
  assert.equal(res.body.data.currentDue, 10000); // untouched
});

test("customer: opening balance change adjusts current due by the same delta", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const cust = await createCustomer(user.accessToken, biz.id, { openingBalance: 10000 });
  const res = await request(app)
    .patch(`/api/v1/customers/${cust.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, openingBalance: 15000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.openingBalance, 15000);
  assert.equal(res.body.data.currentDue, 15000);
});

test("customer: owner can activate/deactivate Customer", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const cust = await createCustomer(user.accessToken, biz.id);
  const res = await request(app)
    .patch(`/api/v1/customers/${cust.id}/status`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, status: "INACTIVE" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, "INACTIVE");
  const list = await request(app)
    .get(`/api/v1/customers?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(list.body.data.items.length, 0);
});

test("customer: Salesperson role can create customers, Viewer cannot", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  await setMembershipRole(user.user.id, biz.id, "Salesperson");
  const create = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, ...customerBody() });
  assert.equal(create.status, 201);

  await setMembershipRole(user.user.id, biz.id, "Viewer");
  const denied = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, ...customerBody({ name: "Nope" }) });
  assert.equal(denied.status, 403);
});

test("customer: cross-tenant isolation — Business A never sees B's customers", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const bizB = await createBusiness(userB.accessToken);
  const custA = await createCustomer(userA.accessToken, bizA.id, { customerCode: "SECRET-1" });

  const deniedList = await request(app)
    .get(`/api/v1/customers?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedList.status, 404);

  const deniedGet = await request(app)
    .get(`/api/v1/customers/${custA.id}?businessId=${bizA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedGet.status, 404);

  const deniedCreate = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${userB.accessToken}`)
    .send({ businessId: bizA.id, ...customerBody({ name: "Intruder" }) });
  assert.equal(deniedCreate.status, 404);

  // B's search in A's business also blocked.
  const deniedSearch = await request(app)
    .get(`/api/v1/customers?businessId=${bizA.id}&search=rahim`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(deniedSearch.status, 404);

  const count = await Customer.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id) });
  assert.equal(count, 1);
});

test("customer: unauthenticated user denied", async () => {
  const res = await request(app).get("/api/v1/customers?businessId=abc");
  assert.equal(res.status, 401);
});