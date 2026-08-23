/**
 * Phase 08 — Owner dashboard tests.
 *
 * Every figure asserted here was hand-computed from the seeded scenario.
 * The dashboard must be SERVER-AUTHORITATIVE: totals come from completed
 * documents and the verified Phase 07 journal engine, VOIDED sales are
 * excluded, and shop scoping cannot be widened by a pinned member.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Product } from "../src/models/Product";
import { Customer } from "../src/models/Customer";
import { Supplier } from "../src/models/Supplier";
import { Account } from "../src/models/Account";
import { BusinessMembership } from "../src/models/BusinessMembership";

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Dash User",
    email: `dash${Math.random().toString(36).slice(2)}@example.com`,
    phone: "017" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    deviceId: "dash-dev-1",
    deviceName: "DashTest",
    platform: "android",
    appVersion: "1.0.0",
    ...over,
  };
}

async function registerUser() {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createBusiness(token: string) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Dash Business", type: "retail" });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string, openingCash: number) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: "Main",
      branchCode: `DASH-${Math.random().toString(36).slice(2)}`,
      openingCash,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function makeProduct(businessId: string, over: Record<string, unknown> = {}) {
  return Product.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `P-${Math.random().toString(36).slice(2)}`,
    purchasePrice: 6000,
    sellingPrice: 10000,
    taxRate: 10,
    currentStock: 10,
    avgCost: 6000,
    status: "ACTIVE",
    ...over,
  });
}

async function makeCustomer(businessId: string) {
  return Customer.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `C-${Math.random().toString(36).slice(2)}`,
    currentDue: 0,
  });
}

async function setRole(userId: string, businessId: string, role: string) {
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { role }
  );
}

let owner: any;
let biz: any;
let shop: any;
let cashAccountId: string;
let other: any; // second tenant
let roleUser: any;

before(async () => {
  await connectTestDb("business-os-test-dashboard");

  owner = await registerUser();
  biz = await createBusiness(owner.accessToken);
  // openingCash seeds the default Cash account with an authoritative balance.
  shop = await createShop(owner.accessToken, biz.id, 100000);
  const cash = await Account.findOne({
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: new mongoose.Types.ObjectId(shop.id),
  });
  cashAccountId = String(cash!._id);

  other = await registerUser();
  const otherBiz = await createBusiness(other.accessToken);
  await createShop(other.accessToken, otherBiz.id, 0);

  roleUser = await registerUser();
  // A second member of business A whose role is flipped by the RBAC test.
  await BusinessMembership.create({
    userId: new mongoose.Types.ObjectId(roleUser.user.id),
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: null,
    role: "Accountant",
    status: "ACTIVE",
    permissions: [],
  });
});

after(async () => {
  await disconnectTestDb();
});

function dash(shopId?: string | null, extraQs = "") {
  const token = owner.accessToken;
  let path = `/api/v1/dashboard?businessId=${biz.id}${extraQs}`;
  if (shopId !== undefined) {
    path += shopId === null ? "" : `&shopId=${shopId}`;
  }
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

test("dashboard: unauthenticated requests are 401", async () => {
  const res = await request(app).get(`/api/v1/dashboard?businessId=${biz.id}`);
  assert.equal(res.status, 401);
});

test("dashboard: missing businessId rejected (400)", async () => {
  const res = await request(app)
    .get("/api/v1/dashboard")
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(res.status, 400);
});

test("dashboard: cross-tenant request is 404", async () => {
  const res = await request(app)
    .get(`/api/v1/dashboard?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${other.accessToken}`);
  assert.equal(res.status, 404);
});

test("dashboard: empty state reports zeros with the seeded opening cash", async () => {
  const res = await dash();
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.today.salesCount, 0);
  assert.equal(res.body.data.today.salesTotal, 0);
  assert.equal(res.body.data.today.purchasesTotal, 0);
  assert.equal(res.body.data.today.expensesTotal, 0);
  assert.equal(res.body.data.today.grossProfit, 0);
  assert.equal(res.body.data.stockValue, 0);
  assert.equal(res.body.data.cash.total, 100000); // openingCash
  assert.equal(res.body.data.receivablesTotal, 0);
  assert.equal(res.body.data.payablesTotal, 0);
  assert.equal(res.body.data.lowStockCount, 0);
  assert.deepEqual(res.body.data.recentTransactions, []);
});

test("dashboard: RBAC — Salesperson/Inventory Manager/Viewer refused, Accountant allowed", async () => {
  const path = `/api/v1/dashboard?businessId=${biz.id}`;
  for (const role of ["Salesperson", "Inventory Manager", "Viewer"]) {
    await setRole(roleUser.user.id, biz.id, role);
    const res = await request(app)
      .get(path)
      .set("Authorization", `Bearer ${roleUser.accessToken}`);
    assert.equal(res.status, 403, `${role} should be 403`);
  }
  await setRole(roleUser.user.id, biz.id, "Accountant");
  const ok = await request(app)
    .get(path)
    .set("Authorization", `Bearer ${roleUser.accessToken}`);
  assert.equal(ok.status, 200);
});

test("dashboard: hand-computed metrics after sale + credit sale + expense", async () => {
  const product = await makeProduct(biz.id);
  const customer = await makeCustomer(biz.id);
  const supplier = await Supplier.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    name: `S-${Math.random().toString(36).slice(2)}`,
    openingBalance: 30000,
    currentPayable: 30000,
  });

  // Cash sale: 2 x 10000 @10% tax -> subtotal 20000 tax 2000 total 22000 PAID.
  const s1 = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id,
      shopId: shop.id,
      items: [{ productId: String(product._id), qty: 2 }],
      paidAmount: 22000,
      accountId: cashAccountId,
    });
  assert.equal(s1.status, 201);

  // Credit sale: 1 x 10000 @10% -> total 11000 UNPAID on the customer.
  const s2 = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id,
      shopId: shop.id,
      customerId: String(customer._id),
      items: [{ productId: String(product._id), qty: 1 }],
    });
  assert.equal(s2.status, 201);

  // Expense: RENT 5000 out of cash.
  const e1 = await request(app)
    .post("/api/v1/expenses")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id,
      shopId: shop.id,
      category: "RENT",
      amount: 5000,
      paymentAccountId: cashAccountId,
    });
  assert.equal(e1.status, 201);

  const res = await dash();
  assert.equal(res.status, 200);
  const d = res.body.data;

  assert.equal(d.today.salesCount, 2);
  assert.equal(d.today.salesTotal, 33000); // 22000 + 11000
  assert.equal(d.today.salesPaid, 22000);
  assert.equal(d.today.salesDue, 11000);
  assert.equal(d.today.purchasesCount, 0);
  assert.equal(d.today.purchasesTotal, 0);
  assert.equal(d.today.expensesCount, 1);
  assert.equal(d.today.expensesTotal, 5000);
  // Journal engine: revenue credit 30000 - COGS debit 18000 (6000/unit).
  assert.equal(d.today.grossProfit, 12000);

  // Stock: 10 - 3 sold = 7 units at avgCost 6000 (products are business-level).
  assert.equal(d.productCount, 1);
  assert.equal(d.stockUnits, 7);
  assert.equal(d.stockValue, 42000);

  // Cash: openingCash 100000 + paid 22000 - expense 5000 = 117000.
  assert.equal(d.cash.total, 117000);
  assert.ok(Array.isArray(d.cash.accounts) && d.cash.accounts.length >= 1);

  assert.equal(d.receivablesTotal, 11000);
  assert.equal(d.receivablesCount, 1);
  assert.equal(d.payablesTotal, 30000);
  assert.equal(d.payablesCount, 1);

  const types = d.recentTransactions.map((r: any) => r.type);
  assert.ok(types.includes("SALE"));
  assert.ok(types.includes("EXPENSE"));
  const saleRow = d.recentTransactions.find((r: any) => r.type === "SALE");
  assert.match(saleRow.refNo, /^INV-\d{4}-.+-\d{4}$/);
});

test("dashboard: low stock list uses the min-stock predicate", async () => {
  const product = await Product.findOne({ businessId: new mongoose.Types.ObjectId(biz.id) });
  await Product.updateOne({ _id: product!._id }, { $set: { minStock: 8 } }); // stock 7 <= 8

  const res = await dash();
  assert.equal(res.status, 200);
  assert.equal(res.body.data.lowStockCount, 1);
  assert.equal(res.body.data.lowStock[0].id, String(product!._id));
  assert.equal(res.body.data.lowStock[0].currentStock, 7);
  assert.equal(res.body.data.lowStock[0].minStock, 8);
});

test("dashboard: voided sales drop out of today's figures and receivables", async () => {
  const customer = await Customer.findOne({ businessId: new mongoose.Types.ObjectId(biz.id) });
  void customer;
  // GET /sales uses the paginated envelope: data IS the items array.
  const sale = await request(app)
    .get(`/api/v1/sales?businessId=${biz.id}&shopId=${shop.id}&limit=50`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  const creditSale = sale.body.data.find(
    (s: any) => s.customerName && s.paymentStatus === "UNPAID"
  );
  assert.ok(creditSale, "credit sale should exist");

  const voidRes = await request(app)
    .post(`/api/v1/sales/${creditSale.id}/void`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, reason: "dashboard test void" });
  assert.equal(voidRes.status, 200);

  const res = await dash();
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.equal(d.today.salesCount, 1);
  assert.equal(d.today.salesTotal, 22000);
  assert.equal(d.today.salesDue, 0);
  assert.equal(d.receivablesTotal, 0);
  assert.equal(d.receivablesCount, 0);
  // Profit back to just the cash sale: revenue 20000 - cogs 12000 = 8000.
  assert.equal(d.today.grossProfit, 8000);
  // Stock restored to 8 units.
  assert.equal(d.stockUnits, 8);
  assert.equal(d.stockValue, 48000);
});

test("dashboard: shop scoping excludes another branch's activity; business-wide includes it", async () => {
  const shop2 = await createShop(owner.accessToken, biz.id, 50000);
  const cash2 = await Account.findOne({
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: new mongoose.Types.ObjectId(shop2.id),
  });
  const product = await Product.findOne({ businessId: new mongoose.Types.ObjectId(biz.id) });

  const pur = await request(app)
    .post("/api/v1/purchases")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id,
      shopId: shop2.id,
      supplierId: (
        await Supplier.findOne({ businessId: new mongoose.Types.ObjectId(biz.id) })
      )!._id.toString(),
      items: [{ productId: String(product!._id), qty: 5, unitPrice: 6000 }],
      paidAmount: 33000,
      accountId: String(cash2!._id),
    });
  assert.equal(pur.status, 201);
  assert.equal(pur.body.data.status, "COMPLETED");

  // Scoped to shop A: the shop-B purchase is invisible, cash excludes B.
  const scoped = await dash(shop.id);
  assert.equal(scoped.status, 200);
  assert.equal(scoped.body.data.today.purchasesCount, 0);
  assert.equal(scoped.body.data.today.purchasesTotal, 0);
  assert.equal(scoped.body.data.cash.total, 117000);

  // Business-wide (Owner has no pinned shop): both branches included.
  const wide = await dash(null);
  assert.equal(wide.status, 200);
  assert.equal(wide.body.data.today.purchasesTotal, 33000);
  assert.equal(wide.body.data.cash.total, 117000 + 17000);
  // Stock valuation is business-wide in this schema (documented behaviour).
  assert.equal(wide.body.data.stockUnits, 13);
});
