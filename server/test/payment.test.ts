import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { DEFAULT_CASH_ACCOUNT_NAME, JOURNAL_ACCOUNTS } from "../src/config/accounts";

const DEV = { deviceId: "pay-test-dev", deviceName: "PayTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Payment User",
    email: `pay${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Pay Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `PAY-${Math.random().toString(36).slice(2)}`, ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createCustomer(token: string, businessId: string, openingBalance = 100000) {
  const res = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Pay Customer", phone: "017" + Math.floor(10000000 + Math.random() * 89999999), openingBalance });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createSupplier(token: string, businessId: string, openingBalance = 80000) {
  const res = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Pay Supplier", phone: "018" + Math.floor(10000000 + Math.random() * 89999999), openingBalance });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function cashAccountOf(businessId: string, shopId: string) {
  const acct = await mongoose.model("Account").findOne({
    businessId: new mongoose.Types.ObjectId(businessId),
    shopId: new mongoose.Types.ObjectId(shopId),
    name: DEFAULT_CASH_ACCOUNT_NAME,
  });
  assert.ok(acct);
  return String(acct!._id);
}

function paymentBody(businessId: string, shopId: string, over: Record<string, unknown>) {
  return {
    businessId,
    shopId,
    amount: 5000,
    method: "CASH",
    idempotencyKey: `idem-${Math.random().toString(36).slice(2)}${Date.now()}`,
    ...over,
  };
}

before(async () => {
  await connectTestDb("business-os-test-payment");
});

after(async () => {
  await disconnectTestDb();
});

test("payment: customer payment success — due decreases, account increases", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id, { openingCash: 50000 });
  const customer = await createCustomer(user.accessToken, biz.id, 100000);
  const accountId = await cashAccountOf(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(paymentBody(biz.id, shop.id, { type: "customer_payment", customerId: customer.id, amount: 5000, accountId }));
  assert.equal(res.status, 201);
  assert.equal(res.body.data.type, "customer_payment");
  assert.equal(res.body.data.amount, 5000);
  assert.equal(res.body.data.customerId, customer.id);
  assert.equal(res.body.data.duplicate, false);

  const custRes = await request(app)
    .get(`/api/v1/customers/${customer.id}?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(custRes.body.data.currentDue, 95000);

  const acctRes = await request(app)
    .get(`/api/v1/accounts/${accountId}?businessId=${biz.id}&shopId=${shop.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(acctRes.body.data.currentBalance, 55000);
});

test("payment: customer payment journal balanced DEBIT Cash / CREDIT Receivable", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id, { openingCash: 20000 });
  const customer = await createCustomer(user.accessToken, biz.id, 50000);
  const accountId = await cashAccountOf(biz.id, shop.id);
  const amount = 3000;

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(paymentBody(biz.id, shop.id, { type: "customer_payment", customerId: customer.id, amount, accountId }));
  assert.equal(res.status, 201);

  const entry = await JournalEntry.findOne({
    businessId: new mongoose.Types.ObjectId(biz.id),
    referenceType: "PAYMENT",
    referenceId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  assert.ok(entry);
  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.equal(lines.length, 2);
  const cash = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.CASH);
  const recv = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.CUSTOMER_RECEIVABLE);
  assert.ok(cash);
  assert.ok(recv);
  assert.equal(cash!.debit, amount);
  assert.equal(cash!.credit, 0);
  assert.equal(recv!.credit, amount);
  assert.equal(recv!.debit, 0);
  assert.equal(lines.reduce((s, l) => s + l.debit, 0), lines.reduce((s, l) => s + l.credit, 0));
});

test("payment: supplier payment success — payable decreases, account decreases", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id, { openingCash: 50000 });
  const supplier = await createSupplier(user.accessToken, biz.id, 80000);
  const accountId = await cashAccountOf(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(paymentBody(biz.id, shop.id, { type: "supplier_payment", supplierId: supplier.id, amount: 5000, accountId }));
  assert.equal(res.status, 201);
  assert.equal(res.body.data.type, "supplier_payment");

  const supRes = await request(app)
    .get(`/api/v1/suppliers/${supplier.id}?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(supRes.body.data.currentPayable, 75000);

  const acctRes = await request(app)
    .get(`/api/v1/accounts/${accountId}?businessId=${biz.id}&shopId=${shop.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(acctRes.body.data.currentBalance, 45000);
});

test("payment: supplier payment journal direction DEBIT Payable CREDIT Cash", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id, { openingCash: 30000 });
  const supplier = await createSupplier(user.accessToken, biz.id, 40000);
  const accountId = await cashAccountOf(biz.id, shop.id);
  const amount = 4000;

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(paymentBody(biz.id, shop.id, { type: "supplier_payment", supplierId: supplier.id, amount, accountId }));
  assert.equal(res.status, 201);

  const entry = await JournalEntry.findOne({
    businessId: new mongoose.Types.ObjectId(biz.id),
    referenceType: "PAYMENT",
    referenceId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  const lines = await JournalLine.find({ entryId: entry!._id });
  const payable = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.SUPPLIER_PAYABLE);
  const cash = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.CASH);
  assert.ok(payable);
  assert.ok(cash);
  assert.equal(payable!.debit, amount);
  assert.equal(payable!.credit, 0);
  assert.equal(cash!.credit, amount);
  assert.equal(cash!.debit, 0);
});

test("payment: insufficient customer due rejected (no clamp)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id, { openingCash: 20000 });
  const customer = await createCustomer(user.accessToken, biz.id, 1000);
  const accountId = await cashAccountOf(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(paymentBody(biz.id, shop.id, { type: "customer_payment", customerId: customer.id, amount: 5000, accountId }));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /exceeds customer outstanding due/i);

  const custRes = await request(app)
    .get(`/api/v1/customers/${customer.id}?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`);
  assert.equal(custRes.body.data.currentDue, 1000);
});

test("payment: insufficient supplier payable rejected", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id, { openingCash: 20000 });
  const supplier = await createSupplier(user.accessToken, biz.id, 1000);
  const accountId = await cashAccountOf(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(paymentBody(biz.id, shop.id, { type: "supplier_payment", supplierId: supplier.id, amount: 5000, accountId }));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /exceeds supplier payable/i);
});

test("payment: invalid payment type rejected", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const accountId = await cashAccountOf(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(paymentBody(biz.id, shop.id, { type: "refund", accountId }));
  assert.equal(res.status, 400);
});

test("payment: invalid payment method rejected", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  const customer = await createCustomer(user.accessToken, biz.id);
  const accountId = await cashAccountOf(biz.id, shop.id);

  const res = await request(app)
    .post("/api/v1/payments")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send(paymentBody(biz.id, shop.id, { type: "customer_payment", customerId: customer.id, method: "BITCOIN", accountId }));
  assert.equal(res.status, 400);
});