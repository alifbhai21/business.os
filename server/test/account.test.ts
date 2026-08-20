import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Account } from "../src/models/Account";
import { DEFAULT_CASH_ACCOUNT_NAME } from "../src/config/accounts";
import { incrementBalance, decrementBalance } from "../src/services/account.service";

const DEV = { deviceId: "acc-test-dev", deviceName: "AccTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Account User",
    email: `acc${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Acc Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `ACC-${Math.random().toString(36).slice(2)}`, ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

before(async () => {
  await connectTestDb("business-os-test-acc");
});

after(async () => {
  await disconnectTestDb();
});

// ── Default Cash seeding ─────────────────────────────────────
test("account: default Cash account seeded from Shop.openingCash (authoritative balance)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const openingCash = 50000; // paisa = 500 taka
  const shop = await createShop(user.accessToken, biz.id, { openingCash });

  const res = await request(app)
    .get(`/api/v1/accounts?businessId=${biz.id}&shopId=${shop.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].name, DEFAULT_CASH_ACCOUNT_NAME);
  assert.equal(res.body.data[0].type, "CASH");
  assert.equal(res.body.data[0].currentBalance, openingCash);

  const shopRes = await request(app)
    .get(`/api/v1/shops/${shop.id}?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(shopRes.body.data.openingCash, openingCash); // seed preserved
});

// ── List / access ────────────────────────────────────────────
test("account: authenticated user can list accounts", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const res = await request(app)
    .get(`/api/v1/accounts?businessId=${biz.id}&shopId=${shop.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1); // only the seeded Cash account
});

test("account: unauthenticated user denied", async () => {
  const res = await request(app).get("/api/v1/accounts?businessId=abc&shopId=abc");
  assert.equal(res.status, 401);
});

test("account: business isolation — User B cannot list A's accounts", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const shopA = await createShop(userA.accessToken, bizA.id);

  const denied = await request(app)
    .get(`/api/v1/accounts?businessId=${bizA.id}&shopId=${shopA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(denied.status, 404);
});

test("account: shop isolation — businessId=A + shopId=B's shop rejected (404)", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const shopA = await createShop(userA.accessToken, bizA.id);
  const bizB = await createBusiness(userB.accessToken);
  const shopB = await createShop(userB.accessToken, bizB.id);
  assert.notEqual(shopA.id, shopB.id);

  // A must NOT be able to pair businessId=A with B's shopId (cross-tenant pairing)
  const denied = await request(app)
    .get(`/api/v1/accounts?businessId=${bizA.id}&shopId=${shopB.id}`)
    .set("Authorization", `Bearer ${userA.accessToken}`);
  assert.equal(denied.status, 404);
});

test("account: create validates required fields", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const res = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, name: "", type: "CASH" });
  assert.equal(res.status, 400);

  const noType = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, name: "Bank A" });
  assert.equal(noType.status, 400);

  const badType = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, name: "Bank A", type: "CRYPTO" });
  assert.equal(badType.status, 400);
});

test("account: owner can create an account (balance starts at 0)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const res = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, name: "Bank Account", type: "BANK", accountNumber: "12345" });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.name, "Bank Account");
  assert.equal(res.body.data.type, "BANK");
  assert.equal(res.body.data.accountNumber, "12345");
  assert.equal(res.body.data.currentBalance, 0);
  assert.ok(res.body.data.id);
});

test("account: duplicate name within same shop rejected (409)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, name: "Petty Cash", type: "CASH" });
  const dup = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, name: "Petty Cash", type: "CASH" });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error.message, /name already exists/i);
});

test("account: same name allowed in a different shop (shop-scoped uniqueness)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop1 = await createShop(user.accessToken, biz.id);
  const shop2 = await createShop(user.accessToken, biz.id);

  const first = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop1.id, name: "Shared Name", type: "CASH" });
  const second = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop2.id, name: "Shared Name", type: "CASH" });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
});

test("account: currentBalance cannot be client-manipulated (create strips it)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const res = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, name: "Cash 2", type: "CASH", currentBalance: 99999999 });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.currentBalance, 0); // not the injected 99999999

  // PATCH also cannot change the balance
  const patch = await request(app)
    .patch(`/api/v1/accounts/${res.body.data.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, name: "Cash 2", currentBalance: 12345 });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.data.currentBalance, 0);

  const doc = await Account.findById(res.body.data.id);
  assert.equal(doc!.currentBalance, 0);
});

test("account: balance updates are atomic $inc (never client-set) with insufficient-balance guard", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id, { openingCash: 50000 });

  // One test body mutates the same Cash account twice; find it by name.
  const cash = await Account.findOne({
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: new mongoose.Types.ObjectId(shop.id),
    name: DEFAULT_CASH_ACCOUNT_NAME,
  });
  assert.ok(cash);

  // Debit below balance must be rejected
  await assert.rejects(
    () => decrementBalance(biz.id, shop.id, String(cash!._id), 999999),
    /Insufficient account balance/i
  );
  let fresh = await Account.findById(cash!._id);
  assert.equal(fresh!.currentBalance, 50000); // unchanged

  // Debit exactly the balance succeeds
  await decrementBalance(biz.id, shop.id, String(cash!._id), 50000);
  fresh = await Account.findById(cash!._id);
  assert.equal(fresh!.currentBalance, 0);

  // Credit increases atomically
  await incrementBalance(biz.id, shop.id, String(cash!._id), 25000);
  fresh = await Account.findById(cash!._id);
  assert.equal(fresh!.currentBalance, 25000);

  // Non-positive amounts rejected
  await assert.rejects(() => incrementBalance(biz.id, shop.id, String(cash!._id), 0));
  await assert.rejects(() => decrementBalance(biz.id, shop.id, String(cash!._id), -5));
  fresh = await Account.findById(cash!._id);
  assert.equal(fresh!.currentBalance, 25000);
});

test("account: update name/type/accountNumber — but never balance", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const created = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, name: "Bank 1", type: "BANK" });

  const res = await request(app)
    .patch(`/api/v1/accounts/${created.body.data.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, name: "Bank 1 Renamed", accountNumber: "ACC-999" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, "Bank 1 Renamed");
  assert.equal(res.body.data.accountNumber, "ACC-999");
  assert.equal(res.body.data.type, "BANK");
  assert.equal(res.body.data.currentBalance, 0);
});

test("account: non-existent shop rejected (404)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const bogusShop = new mongoose.Types.ObjectId().toString();

  const res = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ businessId: biz.id, shopId: bogusShop, name: "Ghost", type: "CASH" });
  assert.equal(res.status, 404);
});

test("account: user from another business cannot create account in A's shop (404)", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const shopA = await createShop(userA.accessToken, bizA.id);

  const denied = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${userB.accessToken}`)
    .send({ businessId: bizA.id, shopId: shopA.id, name: "Intruder", type: "CASH" });
  assert.equal(denied.status, 404);
});