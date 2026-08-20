import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Payment } from "../src/models/Payment";
import { AuditLog } from "../src/models/AuditLog";
import { JournalEntry } from "../src/models/JournalEntry";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { recordPayment } from "../src/services/payment.service";
import { DEFAULT_CASH_ACCOUNT_NAME } from "../src/config/accounts";

const DEV = { deviceId: "paysec-dev", deviceName: "PaySec", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "PaySec User",
    email: `ps${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "PaySec Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `PSC-${Math.random().toString(36).slice(2)}`, ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createCustomer(token: string, businessId: string, openingBalance = 100000) {
  const res = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "C", openingBalance });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createSupplier(token: string, businessId: string, openingBalance = 80000) {
  const res = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "S", openingBalance });
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

function body(businessId: string, shopId: string, over: Record<string, unknown>) {
  return {
    businessId,
    shopId,
    amount: 5000,
    method: "CASH",
    idempotencyKey: `sec-${Math.random().toString(36).slice(2)}${Date.now()}`,
    ...over,
  };
}

async function setRole(userId: string, businessId: string, role: string) {
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { role }
  );
}

before(async () => {
  await connectTestDb("business-os-test-payment-sec");
});

after(async () => {
  await disconnectTestDb();
});

test("payment: unauthenticated denied (401)", async () => {
  const res = await request(app).get("/api/v1/payments?businessId=abc&shopId=abc");
  assert.equal(res.status, 401);
});

test("payment: Viewer role denied (403)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const accountId = await cashAccountId(biz.id, shop.id);
  await setRole(user.user.id, biz.id, "Viewer");

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(body(biz.id, shop.id, { type: "customer_payment", accountId }));
  assert.equal(res.status, 403);
});

test("payment: Salesperson role denied (403)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const accountId = await cashAccountId(biz.id, shop.id);
  await setRole(user.user.id, biz.id, "Salesperson");

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(body(biz.id, shop.id, { type: "customer_payment", accountId }));
  assert.equal(res.status, 403);
});

test("payment: missing customerId for customer_payment rejected (400)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const accountId = await cashAccountId(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(body(biz.id, shop.id, { type: "customer_payment", accountId }));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /customerId is required/i);
});

test("payment: missing supplierId for supplier_payment rejected (400)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const accountId = await cashAccountId(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(body(biz.id, shop.id, { type: "supplier_payment", accountId }));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /supplierId is required/i);
});

test("payment: invalid combination — customer_payment with supplierId rejected (400)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const customer = await createCustomer(user.accessToken, biz.id);
  const supplier = await createSupplier(user.accessToken, biz.id);
  const accountId = await cashAccountId(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(body(biz.id, shop.id, { type: "customer_payment", customerId: customer.id, supplierId: supplier.id, accountId }));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /customer_payment must not have a supplierId/i);
});

test("payment: invalid combination — supplier_payment with customerId rejected (400)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const customer = await createCustomer(user.accessToken, biz.id);
  const supplier = await createSupplier(user.accessToken, biz.id);
  const accountId = await cashAccountId(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(body(biz.id, shop.id, { type: "supplier_payment", customerId: customer.id, supplierId: supplier.id, accountId }));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /supplier_payment must not have a customerId/i);
});

test("payment: missing-account rejected (404)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const customer = await createCustomer(user.accessToken, biz.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(body(biz.id, shop.id, {
      type: "customer_payment",
      customerId: customer.id,
      accountId: new mongoose.Types.ObjectId().toString(),
    }));
  assert.equal(res.status, 404);
});

test("payment: cross-tenant denied — B cannot pay in A's shop (404)", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const shopA = await createShop(userA.accessToken, bizA.id);
  const customer = await createCustomer(userA.accessToken, bizA.id);
  const account = await cashAccountId(bizA.id, shopA.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${userB.accessToken}`)
    .send(body(bizA.id, shopA.id, {
      type: "customer_payment",
      customerId: customer.id,
      accountId: account,
    }));
  assert.equal(res.status, 404);
});

test("payment: cross-shop denied — businessId=A + shopId=B's shop (404)", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const shopA = await createShop(userA.accessToken, bizA.id);
  const bizB = await createBusiness(userB.accessToken);
  const shopB = await createShop(userB.accessToken, bizB.id);
  const customer = await createCustomer(userA.accessToken, bizA.id);
  const account = await cashAccountId(bizA.id, shopA.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${userA.accessToken}`)
    .send({
      businessId: bizA.id,
      shopId: shopB.id,
      type: "customer_payment",
      customerId: customer.id,
      accountId: account,
      amount: 5000,
      method: "CASH",
      idempotencyKey: "cross-shop-1",
    });
  assert.equal(res.status, 404);
});

test("payment: content cannot bypass membership — B cannot list A's payments", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const shopA = await createShop(userA.accessToken, bizA.id);

  const res = await request(app)
    .get(`/api/v1/payments?businessId=${bizA.id}&shopId=${shopA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(res.status, 404);
});

test("payment: duplicate idempotencyKey returns existing, no double effect", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id, { openingCash: 50000 });
  const customer = await createCustomer(user.accessToken, biz.id, 100000);
  const account = await cashAccountId(biz.id, shop.id);
  const key = `dup-${Date.now()}`;

  const first = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(body(biz.id, shop.id, { type: "customer_payment", customerId: customer.id, accountId: account, idempotencyKey: key }));
  assert.equal(first.status, 201);

  const second = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(body(biz.id, shop.id, { type: "customer_payment", customerId: customer.id, accountId: account, idempotencyKey: key }));
  assert.equal(second.status, 200); // existing returned
  assert.equal(second.body.data.id, first.body.data.id);
  assert.equal(second.body.data.duplicate, true);

  // Only ONE journal entry for that payment
  const entryCount = await JournalEntry.countDocuments({
    businessId: new mongoose.Types.ObjectId(biz.id),
    referenceType: "PAYMENT",
    referenceId: new mongoose.Types.ObjectId(first.body.data.id),
  });
  assert.equal(entryCount, 1);

  // Only one payment document
  const payCount = await Payment.countDocuments({
    businessId: new mongoose.Types.ObjectId(biz.id),
    idempotencyKey: key,
  });
  assert.equal(payCount, 1);
});

test("payment: concurrent duplicate idempotencyKey — only ONE applies", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id, { openingCash: 50000 });
  const customer = await createCustomer(user.accessToken, biz.id, 100000);
  const account = await cashAccountId(biz.id, shop.id);
  const key = `conc-${Date.now()}`;

  const results = await Promise.allSettled([
    recordPayment(user.user.id, {
      businessId: biz.id,
      shopId: shop.id,
      type: "customer_payment",
      customerId: customer.id,
      amount: 5000,
      method: "CASH",
      accountId: account,
      idempotencyKey: key,
    }),
    recordPayment(user.user.id, {
      businessId: biz.id,
      shopId: shop.id,
      type: "customer_payment",
      customerId: customer.id,
      amount: 5000,
      method: "CASH",
      accountId: account,
      idempotencyKey: key,
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  assert.ok(fulfilled.length >= 1);

  const payCount = await Payment.countDocuments({
    businessId: new mongoose.Types.ObjectId(biz.id),
    idempotencyKey: key,
  });
  assert.equal(payCount, 1);

  const customerDoc = await mongoose.model("Customer").findById(customer.id);
  assert.equal(customerDoc!.currentDue, 95000); // reduced once
});

test("payment: transaction rollback — failed payment leaves no records", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id, { openingCash: 50000 });
  const customer = await createCustomer(user.accessToken, biz.id, 100000);
  const account = await cashAccountId(biz.id, shop.id);
  const key = `rollback-${Date.now()}`;

  // recordPayment runs its own transaction; a failure (bad account id) must
  // roll back atomically — no payment, no journal, no balance/due change.
  await assert.rejects(
    () =>
      recordPayment(user.user.id, {
        businessId: biz.id,
        shopId: shop.id,
        type: "customer_payment",
        customerId: customer.id,
        amount: 5000,
        method: "CASH",
        accountId: new mongoose.Types.ObjectId().toString(),
        idempotencyKey: key,
      }),
    /Account not found/i
  );

  // No payment persisted
  const payCount = await Payment.countDocuments({ idempotencyKey: key });
  assert.equal(payCount, 0);
  // Customer due unchanged
  const customerDoc = await mongoose.model("Customer").findById(customer.id);
  assert.equal(customerDoc!.currentDue, 100000);
});

test("payment: audit event PAYMENT_RECORDED created", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const customer = await createCustomer(user.accessToken, biz.id);
  const account = await cashAccountId(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(body(biz.id, shop.id, { type: "customer_payment", customerId: customer.id, accountId: account }));
  assert.equal(res.status, 201);

  const log = await AuditLog.findOne({
    businessId: new mongoose.Types.ObjectId(biz.id),
    action: "PAYMENT_RECORDED",
  });
  assert.ok(log);
  assert.equal(String(log!.userId), user.user.id);
});

test("payment: get is business-scoped (404 for other business)", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const shopA = await createShop(userA.accessToken, bizA.id);
  const customer = await createCustomer(userA.accessToken, bizA.id);
  const account = await cashAccountId(bizA.id, shopA.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${userA.accessToken}`)
    .send(body(bizA.id, shopA.id, { type: "customer_payment", customerId: customer.id, accountId: account }));
  assert.equal(res.status, 201);

  const other = await request(app)
    .get(`/api/v1/payments/${res.body.data.id}?businessId=${bizA.id}&shopId=${shopA.id}`)
    .set("Authorization", `Bearer ${userB.accessToken}`);
  assert.equal(other.status, 404);
});