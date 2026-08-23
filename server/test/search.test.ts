/**
 * Phase 08 - Global search tests.
 *
 * Search mirrors the READ RBAC of the collections it covers (any ACTIVE
 * member), is tenant-scoped, shop-scopes transactional hits for pinned
 * members, escapes the term as a literal and rejects short input.
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

const DEV = { deviceId: "srch-dev", deviceName: "SearchTest", platform: "android", appVersion: "1.0.0" };
const oid = (s: string) => new mongoose.Types.ObjectId(s);
const UNIQUE = `zzq${Math.random().toString(36).slice(2, 8)}`; // tenant-A marker

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Search User",
    email: `srch${Math.random().toString(36).slice(2)}@example.com`,
    phone: "017" + Math.floor(10000000 + Math.random() * 89999999),
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

let owner: any;
let biz: any;
let shop: any;
let shop2: any;
let widgetId = "";

function search(token: string, q?: string, businessId?: string, shopId?: string) {
  const params = new URLSearchParams({ businessId: businessId ?? biz.id });
  if (q !== undefined) params.set("q", q);
  if (shopId) params.set("shopId", shopId);
  return request(app)
    .get(`/api/v1/search?${params.toString()}`)
    .set("Authorization", `Bearer ${token}`);
}

before(async () => {
  await connectTestDb("business-os-test-search");
  owner = await registerUser();
  const bizRes = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ name: "Search Business", type: "retail" });
  biz = bizRes.body.data;
  const shopRes = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, name: "Search Main", branchCode: `SM-${Math.random().toString(36).slice(2)}` });
  shop = shopRes.body.data;
  const shop2Res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, name: "Search Second", branchCode: `SS-${Math.random().toString(36).slice(2)}` });
  shop2 = shop2Res.body.data;

  const widget = await Product.create({
    businessId: oid(biz.id),
    name: `Widget ${UNIQUE}`,
    sku: `SKU-${UNIQUE}`,
    barcode: `BC-${UNIQUE}`,
    unit: "piece",
    sellingPrice: 1234,
    currentStock: 7,
  });
  widgetId = String(widget._id);
  await Product.create({
    businessId: oid(biz.id),
    name: "Unrelated product",
    sku: `SKU-other-${UNIQUE}x`, // matches by SKU on purpose
    unit: "piece",
    sellingPrice: 10,
    currentStock: 1,
  });
  const customer = await Customer.create({
    businessId: oid(biz.id),
    name: `Client ${UNIQUE}`,
    phone: `01718899${UNIQUE.slice(4, 8)}`,
    currentDue: 4321,
  });
  await Supplier.create({
    businessId: oid(biz.id),
    name: `Vendor ${UNIQUE}`,
    company: `Acme ${UNIQUE} Ltd`,
    currentPayable: 99,
  });

  const acct = await Account.create({
    businessId: oid(biz.id),
    shopId: oid(shop.id),
    name: `CashA-${Math.random().toString(36).slice(2)}`,
    type: "CASH",
    currentBalance: 100000,
  });

  // A COMPLETED sale (findable by customer snapshot name).
  const saleRes = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id,
      shopId: shop.id,
      customerId: String(customer._id),
      items: [{ productId: widgetId, qty: 1 }],
      paidAmount: 1234,
      accountId: String(acct._id),
    });
  assert.equal(saleRes.status, 201, JSON.stringify(saleRes.body));

  // A DRAFT sale in shop2 - findable, with its DRAFT status surfaced.
  const draftRes = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id,
      shopId: shop2.id,
      items: [{ productId: widgetId, qty: 1 }],
      customerName: `Draft party ${UNIQUE}`,
      draft: true,
    });
  assert.equal(draftRes.status, 201, JSON.stringify(draftRes.body));
});

after(async () => {
  await disconnectTestDb();
});

test("search: short/missing term is rejected", async () => {
  assert.equal((await search(owner.accessToken, "")).status, 400);
  assert.equal((await search(owner.accessToken, "a")).status, 400);
  const noQ = await request(app)
    .get(`/api/v1/search?businessId=${biz.id}`)
    .set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(noQ.status, 400);
});

test("search: unauthenticated is 401; unknown business is 404", async () => {
  const anon = await request(app).get(`/api/v1/search?q=${UNIQUE}&businessId=${biz.id}`);
  assert.equal(anon.status, 401);

  const stranger = await registerUser();
  const foreign = await search(stranger.accessToken, UNIQUE, biz.id);
  assert.equal(foreign.status, 404);
});

test("search: finds products by name/sku/barcode and parties by name/phone/company", async () => {
  const res = await search(owner.accessToken, UNIQUE);
  assert.equal(res.status, 200);
  const d = res.body.data;

  assert.ok(d.products.length >= 2, "name + sku matches");
  const widgetRow = d.products.find((p: { id: string }) => p.id === widgetId);
  assert.ok(widgetRow);
  assert.equal(widgetRow.currentStock, 6, "widget stock reflects the seeded sale (7-1)");
  assert.equal(widgetRow.sellingPrice, 1234);
  assert.ok(d.customers.some((c: { currentDue: number }) => c.currentDue === 4321));
  assert.equal(d.suppliers.length, 1);

  // Literal escaping: regex metacharacters match literally, never inject.
  const meta = await search(owner.accessToken, `${UNIQUE})(*|`);
  assert.equal(meta.status, 200);
  assert.deepEqual(meta.body.data.products, []);
});

test("search: finds sales by invoice/customer snapshot and surfaces status", async () => {
  const res = await search(owner.accessToken, `Client ${UNIQUE}`);
  assert.equal(res.status, 200);
  const completedHit = res.body.data.sales.find((s: { status: string }) => s.status === "COMPLETED");
  assert.ok(completedHit, "completed sale hit");
  assert.equal(completedHit.total, 1234);

  const draftRes = await search(owner.accessToken, `Draft party ${UNIQUE}`);
  const draftHit = draftRes.body.data.sales[0];
  assert.ok(draftHit);
  assert.equal(draftHit.status, "DRAFT");

  // Purchases bucket stays empty but present.
  assert.deepEqual(res.body.data.purchases, []);
});

test("search: tenant isolation - another tenant's marker returns nothing", async () => {
  const stranger = await registerUser();
  const sBiz = (
    await request(app)
      .post("/api/v1/businesses")
      .set("Authorization", `Bearer ${stranger.accessToken}`)
      .send({ name: "Other Search Biz", type: "retail" })
  ).body.data;

  const res = await search(stranger.accessToken, UNIQUE, sBiz.id);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.products, []);
  assert.deepEqual(res.body.data.customers, []);
  assert.deepEqual(res.body.data.suppliers, []);
  assert.deepEqual(res.body.data.sales, []);
  assert.deepEqual(res.body.data.purchases, []);
});

test("search: every active role may search (read-parity with catalog lists)", async () => {
  for (const role of ["Viewer", "Salesperson", "Inventory Manager", "Accountant"]) {
    const reg = await registerUser();
    await BusinessMembership.create({ userId: oid(reg.user.id), businessId: oid(biz.id), role });
    const res = await search(reg.accessToken, `Widget`);
    assert.equal(res.status, 200, `${role} must be allowed to search`);
    assert.ok(res.body.data.products.length >= 1, `${role} sees tenant products`);
  }
});

test("search: shop-pinned member gets transactional hits scoped to their shop", async () => {
  const reg = await registerUser();
  await BusinessMembership.create({
    userId: oid(reg.user.id),
    businessId: oid(biz.id),
    role: "Manager",
    shopId: oid(shop.id),
  });

  // The COMPLETED sale lives in shop; the DRAFT one in shop2. A pinned
  // member searching the shared customer marker must only see shop hits.
  const res = await search(reg.accessToken, UNIQUE);
  assert.equal(res.status, 200);
  for (const s of res.body.data.sales as Array<{ status: string }>) {
    assert.equal(s.status, "COMPLETED", "pinned member must not see other shops' drafts");
  }
});
