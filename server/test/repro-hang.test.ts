import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { DEFAULT_CASH_ACCOUNT_NAME } from "../src/config/accounts";

const DEV = { deviceId: "repro-dev", deviceName: "Repro", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Repro User",
    email: `rp${Math.random().toString(36).slice(2)}@example.com`,
    phone: "019" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
    ...over,
  };
}

async function registerUser() {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createBusiness(token: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Repro Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `RPC-${Math.random().toString(36).slice(2)}`, ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function cashAccountId(businessId: string, shopId: string) {
  const acct = await mongoose.model("Account").findOne({
    businessId: new mongoose.Types.ObjectId(businessId),
    shopId: new mongoose.Types.ObjectId(shopId),
    name: DEFAULT_CASH_ACCOUNT_NAME,
  });
  assert.ok(acct);
  return String(acct!._id);
}

async function setRole(userId: string, businessId: string, role: string) {
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { role }
  );
}

before(async () => {
  await connectTestDb("business-os-test-repro");
});

after(async () => {
  await disconnectTestDb();
});

test("repro: salesperson scenario", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const account = await cashAccountId(biz.id, shop.id);
  await setRole(user.user.id, biz.id, "Salesperson");

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      businessId: biz.id,
      shopId: shop.id,
      type: "customer_payment",
      accountId: account,
      amount: 5000,
      method: "CASH",
      idempotencyKey: "repro-key-1",
    });
  assert.equal(res.status, 403);
});