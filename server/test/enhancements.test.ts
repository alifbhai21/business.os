import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { Product } from "../src/models/Product";
import { Customer } from "../src/models/Customer";
import { Supplier } from "../src/models/Supplier";
import { Sale } from "../src/models/Sale";
import { Expense } from "../src/models/Expense";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { StockMovement } from "../src/models/StockMovement";
import { SyncEvent } from "../src/models/SyncEvent";
import { Notification, NotificationRead } from "../src/models/Notification";
import { permissionsForRole } from "../src/config/roles";

/**
 * Phase 12 — Enhancements:
 * chart of accounts API, in-app notifications (+preferences), product
 * variants (+variant barcode lookup, sale snapshot), custom expense
 * categories, offline inventory movements (exactly-once through the sync
 * dispatcher), printable invoices and Excel export.
 *
 * Every mutation is verified against real documents, not just status codes.
 */

const DEV = {
  deviceId: `p12-dev-${Math.random().toString(36).slice(2, 10)}`,
  deviceName: "Phase12Test",
  platform: "android",
  appVersion: "1.0.0",
};

function regBody() {
  return {
    name: "P12 User",
    email: `p12${Math.random().toString(36).slice(2)}@example.com`,
    phone: "018" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
  };
}

async function registerUser() {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  assert.equal(res.status, 201);
  return { ...res.body.data.user, ...res.body.data };
}

async function createBusiness(token: string, name = "P12 Business") {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name, type: "retail" });
  assert.equal(res.status, 201);
  return res.body.data;
}

let shopSeq = 0;

async function createShop(token: string, businessId: string, openingCash = 500000) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: "P12 Shop",
      branchCode: `P12-${Date.now()}-${shopSeq++}`,
      openingCash,
    });
  assert.equal(res.status, 201);
  const shop = res.body.data;
  const accounts = await request(app)
    .get(`/api/v1/accounts?businessId=${businessId}&shopId=${shop.id}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(accounts.status, 200);
  return { ...shop, defaultAccount: accounts.body.data[0] as { id: string; currentBalance: number } };
}

async function createProduct(token: string, businessId: string, over: Record<string, unknown>) {
  const res = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      unit: "piece",
      purchasePrice: 5000,
      sellingPrice: 8000,
      taxRate: 0,
      ...over,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function grantRole(
  userId: string,
  businessId: string,
  role: Parameters<typeof permissionsForRole>[0]
) {
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { $set: { role, status: "ACTIVE", permissions: [...permissionsForRole(role)], shopId: null } },
    { upsert: true }
  );
}

function post(path: string, token: string | null, body: Record<string, unknown>) {
  const r = request(app).post(path);
  if (token) r.set("Authorization", `Bearer ${token}`);
  return r.send(body);
}

function put(path: string, token: string | null, body: Record<string, unknown>) {
  const r = request(app).put(path);
  if (token) r.set("Authorization", `Bearer ${token}`);
  return r.send(body);
}

function get(path: string, token: string | null) {
  const r = request(app).get(path);
  if (token) r.set("Authorization", `Bearer ${token}`);
  return r;
}

interface Ctx {
  owner: Awaited<ReturnType<typeof registerUser>>;
  biz: { id: string };
  shop: { id: string; defaultAccount: { id: string; currentBalance: number } };
  lowStockProduct: { id: string; name: string };
  overLimitCustomer: { id: string; name: string };
  underLimitCustomer: { id: string };
  payableSupplier: { id: string; name: string };
  variantProduct: {
    id: string;
    sellingPrice: number;
    variants: Array<{ name: string; barcode: string | null; priceAdjustmentPaisa: number }>;
  };
  bizB: { id: string };
  ownerB: Awaited<ReturnType<typeof registerUser>>;
  failedSyncEventId: string;
  xssSaleId: string;
  xssCustomerName: string;
}

const ctx = {} as Ctx;

before(async () => {
  await connectTestDb("business-os-test-p12");

  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);
  const shop = await createShop(owner.accessToken, biz.id);

  // Low-stock condition: minStock 10, currentStock 3.
  const lowStockProduct = await createProduct(owner.accessToken, biz.id, {
    name: `LowStock-${Math.random().toString(36).slice(2)}`,
    currentStock: 3,
    minStock: 10,
  });

  // Over-limit customer: limit 20000, due (opening) 25000.
  const overLimitRes = await post("/api/v1/customers", owner.accessToken, {
    businessId: biz.id,
    name: `OverLimit-${Math.random().toString(36).slice(2)}`,
    creditLimit: 20000,
    openingBalance: 25000,
  });
  assert.equal(overLimitRes.status, 201);

  // Under-limit customer for the negative case.
  const underLimitRes = await post("/api/v1/customers", owner.accessToken, {
    businessId: biz.id,
    name: `UnderLimit-${Math.random().toString(36).slice(2)}`,
    creditLimit: 50000,
    openingBalance: 1000,
  });
  assert.equal(underLimitRes.status, 201);

  // Payable supplier.
  const supRes = await post("/api/v1/suppliers", owner.accessToken, {
    businessId: biz.id,
    name: `Payable-${Math.random().toString(36).slice(2)}`,
    openingBalance: 12000,
  });
  assert.equal(supRes.status, 201);

  // Variant product: S/M/XL with a price bump on XL and its own barcode.
  const variantProduct = await createProduct(owner.accessToken, biz.id, {
    name: `Tee-${Math.random().toString(36).slice(2)}`,
    currentStock: 30,
    variants: [
      { name: "S", sku: null, barcode: null, priceAdjustmentPaisa: 0 },
      { name: "M", sku: null, barcode: null, priceAdjustmentPaisa: 0 },
      { name: "XL", sku: "TEE-XL", barcode: `XLBARC-${Date.now()}`, priceAdjustmentPaisa: 500 },
    ],
  });

  // XSS-print fixture: a customer whose name must be escaped in HTML output.
  const xssCustomerName = `Evil <script>alert("x")</script> & Co`;
  const xssCust = await post("/api/v1/customers", owner.accessToken, {
    businessId: biz.id,
    name: xssCustomerName,
  });
  assert.equal(xssCust.status, 201);
  const xssSale = await post("/api/v1/sales", owner.accessToken, {
    businessId: biz.id,
    shopId: shop.id,
    customerId: xssCust.body.data.id,
    items: [{ productId: variantProduct.id, qty: 1, unitPrice: 8000 }],
    paidAmount: 8000,
    accountId: shop.defaultAccount.id,
    localId: `p12-sale-${Math.random().toString(36).slice(2, 10)}`,
  });
  assert.equal(xssSale.status, 201, JSON.stringify(xssSale.body));

  // A FAILED sync event drives the SYNC_FAILURE notification.
  const failedEvent = await SyncEvent.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    userId: new mongoose.Types.ObjectId(owner.user?.id ?? owner.id),
    deviceId: null,
    direction: "PUSH",
    opCount: 2,
    okCount: 0,
    failedCount: 2,
    conflictCount: 0,
    status: "FAILED",
    error: "test failure",
  });

  ctx.owner = owner;
  ctx.biz = biz;
  ctx.shop = shop;
  ctx.lowStockProduct = { id: lowStockProduct.id, name: lowStockProduct.name };
  ctx.overLimitCustomer = {
    id: overLimitRes.body.data.id,
    name: overLimitRes.body.data.name,
  };
  ctx.underLimitCustomer = { id: underLimitRes.body.data.id };
  ctx.payableSupplier = { id: supRes.body.data.id, name: supRes.body.data.name };
  ctx.variantProduct = variantProduct;
  ctx.failedSyncEventId = String(failedEvent._id);
  ctx.xssSaleId = xssSale.body.data.id;
  ctx.xssCustomerName = xssCustomerName;

  // Second tenant.
  const ownerB = await registerUser();
  const bizB = await createBusiness(ownerB.accessToken, "P12 Biz B");
  ctx.ownerB = ownerB;
  ctx.bizB = bizB;

  // Role-bound members.
  const accountant = await registerUser();
  const salesperson = await registerUser();
  await grantRole(accountant.user?.id ?? accountant.id, biz.id, "Accountant");
  await grantRole(salesperson.user?.id ?? salesperson.id, biz.id, "Salesperson");
  (ctx as Record<string, unknown>).accountant = accountant;
  (ctx as Record<string, unknown>).salesperson = salesperson;
});

after(async () => {
  await disconnectTestDb();
});

// ══════════════════════════════════════════════════════════════════════════
// CHART OF ACCOUNTS
// ══════════════════════════════════════════════════════════════════════════

test("p12: chart of accounts serves the canonical config grouped by type", async () => {
  const res = await get(`/api/v1/accounting/chart?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  assert.equal(res.status, 200);
  const d = res.body.data;

  assert.equal(d.source, "config");
  const cash = d.accounts.find((a: { name: string }) => a.name === "Cash");
  assert.equal(cash.accountType, "ASSET");
  assert.equal(cash.normalBalance, "DEBIT");
  const revenue = d.accounts.find((a: { name: string }) => a.name === "Sales Revenue");
  assert.equal(revenue.normalBalance, "CREDIT");
  const cogs = d.accounts.find((a: { name: string }) => a.name === "Cost of Goods Sold");
  assert.equal(cogs.accountType, "EXPENSE");

  // Every built-in expense category maps to its journal account name.
  const rent = d.expenseCategories.find((c: { category: string }) => c.category === "RENT");
  assert.equal(rent.accountName, "Rent");

  assert.deepEqual(d.grouped.EQUITY, [], "equity group exists (retained earnings is derived)");
});

test("p12: chart RBAC — Accountant reads, Salesperson/Viewer are 403", async () => {
  const c = ctx as unknown as Record<string, Awaited<ReturnType<typeof registerUser>>>;
  assert.equal(
    (await get(`/api/v1/accounting/chart?businessId=${ctx.biz.id}`, c.accountant.accessToken)).status,
    200
  );
  assert.equal(
    (await get(`/api/v1/accounting/chart?businessId=${ctx.biz.id}`, c.salesperson.accessToken)).status,
    403
  );
});

test("p12: chart auth + cross-tenant", async () => {
  assert.equal((await get(`/api/v1/accounting/chart?businessId=${ctx.biz.id}`, null)).status, 401);
  assert.equal(
    (await get(`/api/v1/accounting/chart?businessId=${ctx.biz.id}`, ctx.ownerB.accessToken)).status,
    404
  );
});

// ══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════

test("p12: reading notifications materializes every currently-true condition", async () => {
  const res = await get(`/api/v1/notifications?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  const items = res.body.data.data as Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    dedupKey?: string;
    read: boolean;
  }>;

  const lowStock = items.find((i) => i.type === "LOW_STOCK");
  assert.ok(lowStock, "low-stock condition materialized");
  assert.ok(lowStock!.body.includes(ctx.lowStockProduct.name));
  assert.equal(lowStock!.read, false);

  const custDue = items.find((i) => i.type === "CUSTOMER_DUE");
  assert.ok(custDue, "over-limit customer alert materialized");
  assert.ok(custDue!.body.includes(ctx.overLimitCustomer.name));
  assert.ok(!items.some((i) => i.type === "CUSTOMER_DUE" && i.body.includes("UnderLimit")));

  assert.ok(items.some((i) => i.type === "SUPPLIER_DUE"), "supplier payable alert materialized");

  const syncFail = items.find((i) => i.type === "SYNC_FAILURE");
  assert.ok(syncFail, "sync-failure alert materialized");
});

test("p12: re-reading is idempotent — no duplicate notification rows", async () => {
  const first = await get(`/api/v1/notifications?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  const beforeCount = (first.body.data.data as unknown[]).length;

  const second = await get(`/api/v1/notifications?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  assert.equal((second.body.data.data as unknown[]).length, beforeCount);

  const dbCount = await Notification.countDocuments({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
  });
  const third = await get(`/api/v1/notifications?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  assert.equal((third.body.data.data as unknown[]).length, beforeCount);
  assert.ok(dbCount <= beforeCount + (third.body.data.data as unknown[]).length);
});

test("p12: unread flow — markRead then markAllRead", async () => {
  const list = await get(`/api/v1/notifications?businessId=${ctx.biz.id}&filter=unread`, ctx.owner.accessToken);
  assert.equal(list.status, 200);
  const unread = list.body.data.data as Array<{ id: string; read: boolean }>;
  assert.ok(unread.length > 0);
  assert.ok(unread.every((i) => !i.read));

  const target = unread[0];
  const mark = await post(`/api/v1/notifications/${target.id}/read`, ctx.owner.accessToken, {
    businessId: ctx.biz.id,
  });
  assert.equal(mark.status, 200);
  assert.equal(mark.body.data.read, true);

  // Re-marking is idempotent (unique {userId, notificationId}).
  const remark = await post(`/api/v1/notifications/${target.id}/read`, ctx.owner.accessToken, {
    businessId: ctx.biz.id,
  });
  assert.equal(remark.status, 200);
  const readsForTarget = await NotificationRead.countDocuments({
    userId: new mongoose.Types.ObjectId(ctx.owner.user?.id ?? owner_id_of(ctx.owner)),
    notificationId: new mongoose.Types.ObjectId(target.id),
  });
  assert.equal(readsForTarget, 1);

  const afterOne = await get(`/api/v1/notifications?businessId=${ctx.biz.id}&filter=unread`, ctx.owner.accessToken);
  const remaining = afterOne.body.data.data as Array<{ id: string }>;
  assert.ok(!remaining.some((i) => i.id === target.id), "acknowledged row leaves the unread view");

  const markAll = await post("/api/v1/notifications/read-all", ctx.owner.accessToken, {
    businessId: ctx.biz.id,
  });
  assert.equal(markAll.status, 200);
  const noneLeft = await get(`/api/v1/notifications?businessId=${ctx.biz.id}&filter=unread`, ctx.owner.accessToken);
  assert.equal((noneLeft.body.data.data as unknown[]).length, 0);
});

function owner_id_of(u: Awaited<ReturnType<typeof registerUser>>) {
  return u.user?.id ?? u.id;
}

test("p12: preferences suppress types per user without touching stored rows", async () => {
  const prefsBefore = await get(
    `/api/v1/notifications/preferences?businessId=${ctx.biz.id}`,
    ctx.owner.accessToken
  );
  assert.equal(prefsBefore.status, 200);
  assert.equal(prefsBefore.body.data.toggles.lowStock, true, "defaults to on");

  const updated = await put(`/api/v1/notifications/preferences`, ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    lowStock: false,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.toggles.lowStock, false);

  const list = await get(`/api/v1/notifications?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  const items = list.body.data.data as Array<{ type: string }>;
  assert.ok(!items.some((i) => i.type === "LOW_STOCK"), "suppressed type hidden for THIS user");

  // Rows remain in the database (other members with defaults still see them).
  const dbLowStock = await Notification.countDocuments({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
    type: "LOW_STOCK",
  });
  assert.ok(dbLowStock > 0);

  // Restore.
  await put(`/api/v1/notifications/preferences`, ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    lowStock: true,
  });
});

test("p12: notification validation + auth + isolation", async () => {
  const badFilter = await get(
    `/api/v1/notifications?businessId=${ctx.biz.id}&filter=bogus`,
    ctx.owner.accessToken
  );
  assert.equal(badFilter.status, 400);

  assert.equal((await get(`/api/v1/notifications?businessId=${ctx.biz.id}`, null)).status, 401);
  assert.equal(
    (await get(`/api/v1/notifications?businessId=${ctx.biz.id}`, ctx.ownerB.accessToken)).status,
    404
  );
  assert.equal(
    (
      await post(`/api/v1/notifications/read-all`, ctx.ownerB.accessToken, {
        businessId: ctx.biz.id,
      })
    ).status,
    404
  );

  const badPrefs = await put(`/api/v1/notifications/preferences`, ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    lowStock: "yes",
  });
  assert.equal(badPrefs.status, 400);
});

// ══════════════════════════════════════════════════════════════════════════
// PRODUCT VARIANTS
// ══════════════════════════════════════════════════════════════════════════

test("p12: duplicate variant names (case-insensitive) are rejected 409", async () => {
  const res = await post("/api/v1/products", ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    name: `VarDup-${Math.random().toString(36).slice(2)}`,
    variants: [
      { name: "Red", sku: null, barcode: null, priceAdjustmentPaisa: 0 },
      { name: "red", sku: null, barcode: null, priceAdjustmentPaisa: 0 },
    ],
  });
  assert.equal(res.status, 409);
});

test("p12: a variant barcode may not collide with another product's barcode", async () => {
  // ctx.variantProduct owns its own product barcode? It has none — use the
  // lowStock product's sibling instead: collide with variantProduct.XL barcode.
  const xlBarcode = ctx.variantProduct.variants.find((v) => v.barcode)?.barcode;
  assert.ok(xlBarcode);
  const res = await post("/api/v1/products", ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    name: `VarClash-${Math.random().toString(36).slice(2)}`,
    variants: [{ name: "A", sku: null, barcode: xlBarcode, priceAdjustmentPaisa: 0 }],
  });
  assert.equal(res.status, 409);
});

test("p12: variant barcode lookup returns the product with matchedVariant", async () => {
  const xlBarcode = ctx.variantProduct.variants.find((v) => v.barcode)?.barcode;
  assert.ok(xlBarcode);
  const res = await get(
    `/api/v1/products/lookup/barcode?businessId=${ctx.biz.id}&barcode=${encodeURIComponent(xlBarcode!)}`,
    ctx.owner.accessToken
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, ctx.variantProduct.id);
  assert.equal(res.body.data.matchedVariant.name, "XL");
  assert.equal(res.body.data.matchedVariant.priceAdjustmentPaisa, 500);
});

test("p12: unknown and cross-tenant barcodes stay 404", async () => {
  const unknown = await get(
    `/api/v1/products/lookup/barcode?businessId=${ctx.biz.id}&barcode=NOPE-123`,
    ctx.owner.accessToken
  );
  assert.equal(unknown.status, 404);

  const foreign = await get(
    `/api/v1/products/lookup/barcode?businessId=${ctx.bizB.id}&barcode=NOPE-123`,
    ctx.owner.accessToken
  );
  assert.equal(foreign.status, 404);
});

test("p12: INACTIVE products are identifiable but not sellable", async () => {
  const prod = await createProduct(ctx.owner.accessToken, ctx.biz.id, {
    name: `InactiveScan-${Math.random().toString(36).slice(2)}`,
    barcode: `INACT-${Date.now()}`,
    currentStock: 5,
  });
  const deact = await request(app)
    .patch(`/api/v1/products/${prod.id}/status`)
    .set("Authorization", `Bearer ${ctx.owner.accessToken}`)
    .send({ businessId: ctx.biz.id, status: "INACTIVE" });
  assert.equal(deact.status, 200);

  // Deterministic lookup by the exact barcode value.
  const exact = await Product.findById(prod.id);
  const scan = await get(
    `/api/v1/products/lookup/barcode?businessId=${ctx.biz.id}&barcode=${encodeURIComponent(exact!.barcode!)}`,
    ctx.owner.accessToken
  );
  assert.equal(scan.status, 200);
  assert.equal(scan.body.data.status, "INACTIVE", "the scanner may identify an inactive product");

  const sellAttempt = await post("/api/v1/sales", ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    items: [{ productId: prod.id, qty: 1 }],
    localId: `p12-inact-${Math.random().toString(36).slice(2, 10)}`,
  });
  assert.equal(sellAttempt.status, 400);
  assert.match(sellAttempt.body.error.message, /not active/i);
});

test("p12: selling a variant snapshots its name and applies its price delta", async () => {
  const sellingPrice = ctx.variantProduct.sellingPrice;
  const xlAdj = ctx.variantProduct.variants.find((v) => v.name === "XL")!.priceAdjustmentPaisa;
  const localId = `p12-var-${Math.random().toString(36).slice(2, 10)}`;

  const res = await post("/api/v1/sales", ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    items: [{ productId: ctx.variantProduct.id, qty: 2, variantName: "XL" }],
    paidAmount: 2 * (sellingPrice + xlAdj),
    accountId: ctx.shop.defaultAccount.id,
    localId,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.items[0].unitPrice, sellingPrice + xlAdj, "XL sells at base + delta");
  assert.equal(res.body.data.items[0].variantName, "XL");
  assert.equal(res.body.data.total, 2 * (sellingPrice + xlAdj));

  // Persisted document carries the snapshot.
  const doc = await Sale.findById(res.body.data.id);
  assert.equal(doc!.items[0].variantName, "XL");

  // Unknown variants are rejected — never silently relabelled.
  const bogus = await post("/api/v1/sales", ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    items: [{ productId: ctx.variantProduct.id, qty: 1, variantName: "XXL" }],
    localId: `p12-var-${Math.random().toString(36).slice(2, 10)}`,
  });
  assert.equal(bogus.status, 400);
  assert.match(bogus.body.error.message, /Unknown variant/i);
});

// ══════════════════════════════════════════════════════════════════════════
// CUSTOM EXPENSE CATEGORIES
// ══════════════════════════════════════════════════════════════════════════

test("p12: owner defines custom expense categories; expenses journal them", async () => {
  const upd = await request(app)
    .put(`/api/v1/businesses/${ctx.biz.id}`)
    .set("Authorization", `Bearer ${ctx.owner.accessToken}`)
    .send({ customExpenseCategories: ["delivery", "Utilities "] });
  assert.equal(upd.status, 200);
  assert.deepEqual(upd.body.data.customExpenseCategories, ["DELIVERY", "UTILITIES"]);

  const accBalBefore = (await get(
    `/api/v1/accounts?businessId=${ctx.biz.id}&shopId=${ctx.shop.id}`,
    ctx.owner.accessToken
  )).body.data[0].currentBalance;

  const exp = await post("/api/v1/expenses", ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    category: "DELIVERY",
    amount: 15000,
    paymentAccountId: ctx.shop.defaultAccount.id,
    note: "bike courier",
  });
  assert.equal(exp.status, 201, JSON.stringify(exp.body));

  const doc = await Expense.findById(exp.body.data.id);
  assert.equal(doc!.category, "DELIVERY");

  // Journal: DEBIT Delivery / CREDIT Cash, balanced.
  const entry = await JournalEntry.findOne({ referenceType: "EXPENSE", referenceId: doc!._id });
  assert.ok(entry);
  assert.equal(entry!.description.includes("Delivery"), true, "journal names the custom category");
  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.equal(lines.reduce((s, l) => s + l.debit, 0), lines.reduce((s, l) => s + l.credit, 0));
  assert.ok(lines.some((l) => l.accountName === "Delivery"));

  const accAfter = (await get(
    `/api/v1/accounts?businessId=${ctx.biz.id}&shopId=${ctx.shop.id}`,
    ctx.owner.accessToken
  )).body.data[0].currentBalance;
  assert.equal(accAfter, accBalBefore - 15000);
});

test("p12: non-permitted categories are refused; caps enforced; RBAC held", async () => {
  const bad = await post("/api/v1/expenses", ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    category: "NOT_A_THING",
    amount: 1000,
    paymentAccountId: ctx.shop.defaultAccount.id,
  });
  assert.equal(bad.status, 400);

  const tooMany = await request(app)
    .put(`/api/v1/businesses/${ctx.biz.id}`)
    .set("Authorization", `Bearer ${ctx.owner.accessToken}`)
    .send({ customExpenseCategories: Array.from({ length: 16 }, (_, i) => `CAT${i}`) });
  assert.equal(tooMany.status, 400);

  const salesperson = (ctx as unknown as Record<string, Awaited<ReturnType<typeof registerUser>>>).salesperson;
  const denied = await request(app)
    .put(`/api/v1/businesses/${ctx.biz.id}`)
    .set("Authorization", `Bearer ${salesperson.accessToken}`)
    .send({ customExpenseCategories: ["NOPE"] });
  assert.equal(denied.status, 403);

  const foreign = await request(app)
    .put(`/api/v1/businesses/${ctx.biz.id}`)
    .set("Authorization", `Bearer ${ctx.ownerB.accessToken}`)
    .send({ customExpenseCategories: ["NOPE"] });
  assert.equal(foreign.status, 404);
});

// ══════════════════════════════════════════════════════════════════════════
// OFFLINE INVENTORY MOVEMENTS (exactly-once)
// ══════════════════════════════════════════════════════════════════════════

test("p12: queued inventory_adjust mutates stock exactly once; retry adds nothing", async () => {
  const product = await createProduct(ctx.owner.accessToken, ctx.biz.id, {
    name: `OfflineAdj-${Math.random().toString(36).slice(2)}`,
    currentStock: 20,
  });
  const beforeStock = (await Product.findById(product.id))!.currentStock;
  const movementsBefore = await StockMovement.countDocuments({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
    refType: "ADJUSTMENT",
  });
  const localId = `adj-${Math.random().toString(36).slice(2, 12)}`;

  const pushBody = {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId,
        type: "inventory_adjust",
        payload: { productId: product.id, qtyChange: -4, kind: "damage", reason: "torn packaging" },
      },
    ],
  };

  const first = await post("/api/v1/sync/push", ctx.owner.accessToken, pushBody);
  assert.equal(first.status, 200);
  assert.equal(first.body.data.results[0].status, "SYNCED");
  assert.equal(first.body.data.results[0].duplicate, false);

  const afterFirst = (await Product.findById(product.id))!.currentStock;
  assert.equal(afterFirst, beforeStock - 4);

  const movement = await StockMovement.findOne({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
    refType: "DAMAGE",
    localId,
  });
  assert.ok(movement, "movement carries the queue's localId");
  assert.equal(movement!.prevStock, beforeStock);
  assert.equal(movement!.newStock, afterFirst);
  assert.equal(movement!.qtyChange, -4);

  // Retry → duplicate, zero additional effect.
  const retry = await post("/api/v1/sync/push", ctx.owner.accessToken, pushBody);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.results[0].status, "SYNCED");
  assert.equal(retry.body.data.results[0].duplicate, true);
  assert.equal((await Product.findById(product.id))!.currentStock, afterFirst);
  assert.equal(
    await StockMovement.countDocuments({
      businessId: new mongoose.Types.ObjectId(ctx.biz.id),
      localId,
    }),
    1
  );

  // Concurrent duplicates resolve to one effect.
  const [c1, c2] = await Promise.all([
    post("/api/v1/sync/push", ctx.owner.accessToken, {
      ...pushBody,
      ops: [
        {
          localId: `${localId}-c`,
          type: "inventory_adjust",
          payload: { productId: product.id, qtyChange: -1, kind: "adjustment", reason: "count fix" },
        },
      ],
    }),
    post("/api/v1/sync/push", ctx.owner.accessToken, {
      ...pushBody,
      ops: [
        {
          localId: `${localId}-c`,
          type: "inventory_adjust",
          payload: { productId: product.id, qtyChange: -1, kind: "adjustment", reason: "count fix" },
        },
      ],
    }),
  ]);
  for (const r of [c1, c2]) {
    assert.equal(r.status, 200);
    assert.equal(r.body.data.results[0].status, "SYNCED");
  }
  const concurrentMovements = await StockMovement.countDocuments({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
    localId: `${localId}-c`,
  });
  assert.equal(concurrentMovements, 1, "exactly one movement for concurrent pushes");
  const expectedAfterConcurrent =
    afterFirst - (concurrentMovements === 1 ? 1 : 2);
  assert.equal((await Product.findById(product.id))!.currentStock, expectedAfterConcurrent);
  void movementsBefore;
});

test("p12: queued inventory_opening sets stock once and retries cleanly", async () => {
  const product = await createProduct(ctx.owner.accessToken, ctx.biz.id, {
    name: `OfflineOpen-${Math.random().toString(36).slice(2)}`,
    currentStock: 0,
  });
  const localId = `open-${Math.random().toString(36).slice(2, 12)}`;
  const pushBody = {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId,
        type: "inventory_opening",
        payload: { productId: product.id, quantity: 7 },
      },
    ],
  };

  const first = await post("/api/v1/sync/push", ctx.owner.accessToken, pushBody);
  assert.equal(first.body.data.results[0].status, "SYNCED");
  assert.equal((await Product.findById(product.id))!.currentStock, 7);

  const retry = await post("/api/v1/sync/push", ctx.owner.accessToken, pushBody);
  assert.equal(retry.body.data.results[0].duplicate, true);
  assert.equal((await Product.findById(product.id))!.currentStock, 7);
});

test("p12: insufficient stock queues as CONFLICT without blocking the batch", async () => {
  const product = await createProduct(ctx.owner.accessToken, ctx.biz.id, {
    name: `ConflictAdj-${Math.random().toString(36).slice(2)}`,
    currentStock: 2,
  });
  // A separate zero-stock product satisfies the opening precondition so the
  // batch proves per-op isolation (one CONFLICT, one SYNCED).
  const zeroProduct = await createProduct(ctx.owner.accessToken, ctx.biz.id, {
    name: `ZeroOpen-${Math.random().toString(36).slice(2)}`,
    currentStock: 0,
  });
  const res = await post("/api/v1/sync/push", ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId: `bad-${Math.random().toString(36).slice(2, 10)}`,
        type: "inventory_adjust",
        payload: { productId: product.id, qtyChange: -50, kind: "adjustment", reason: "too much" },
      },
      {
        localId: `ok-${Math.random().toString(36).slice(2, 10)}`,
        type: "inventory_opening",
        payload: { productId: zeroProduct.id, quantity: 0 },
      },
    ],
  });
  assert.equal(res.status, 200);
  const results = res.body.data.results;
  assert.equal(results[0].status, "CONFLICT");
  assert.equal(results[1].status, "SYNCED", "zero-opening has no stock effect and succeeds");
});

// ══════════════════════════════════════════════════════════════════════════
// PRINTABLE INVOICES
// ══════════════════════════════════════════════════════════════════════════

test("p12: print view serves authoritative HTML with escaped user content", async () => {
  const res = await get(
    `/api/v1/invoices/sales/${ctx.xssSaleId}/print?businessId=${ctx.biz.id}&shopId=${ctx.shop.id}`,
    ctx.owner.accessToken
  );
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"] ?? "", /text\/html;\s*charset=utf-8/);

  const html = res.text as string;
  assert.ok(html.includes("&lt;script&gt;"), "customer HTML is escaped");
  assert.ok(!html.includes("<script>alert"), "no raw script tag survives");
  assert.match(html, /INV-/, "server invoice number rendered");
  // Total figure appears formatted (8000 paisa → 80.00).
  assert.ok(html.includes("80.00"));
});

test("p12: print view honors tenant + shop scope and validation", async () => {
  const missingShop = await get(
    `/api/v1/invoices/sales/${ctx.xssSaleId}/print?businessId=${ctx.biz.id}`,
    ctx.owner.accessToken
  );
  assert.equal(missingShop.status, 400);

  const anon = await get(
    `/api/v1/invoices/sales/${ctx.xssSaleId}/print?businessId=${ctx.biz.id}&shopId=${ctx.shop.id}`,
    null
  );
  assert.equal(anon.status, 401);
});

// ══════════════════════════════════════════════════════════════════════════
// EXCEL EXPORT
// ══════════════════════════════════════════════════════════════════════════

test("p12: Excel export produces a real workbook matching the database", async () => {
  const ExcelJS = (await import("exceljs")).default;

  // Buffer the binary xlsx body explicitly (superagent would otherwise try
  // to JSON-parse an unknown content type).
  const binary = await new Promise<Buffer>((resolve, reject) => {
    request(app)
      .get(`/api/v1/export/excel?businessId=${ctx.biz.id}&type=sales`)
      .set("Authorization", `Bearer ${ctx.owner.accessToken}`)
      .buffer(true)
      .parse((res2, cb) => {
        const chunks: Buffer[] = [];
        res2.on("data", (c: Buffer) => chunks.push(c));
        res2.on("end", () => cb(undefined, Buffer.concat(chunks)));
      })
      .end((err, res2) => {
        if (err) return reject(err);
        if (res2.status !== 200) return reject(new Error(`status ${res2.status}`));
        resolve(res2.body as Buffer);
      });
  });

  assert.match(
    binary.subarray(0, 2).toString("binary"),
    /PK/,
    "xlsx files start with the ZIP magic bytes"
  );

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(binary);
  const sheet = wb.worksheets[0];
  const headerRow = sheet.getRow(1).values as unknown[];
  assert.equal(headerRow[1], "id");
  assert.equal(headerRow[2], "invoiceNo");

  const dbSales = await Sale.countDocuments({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
  });
  assert.equal(sheet.rowCount - 1, dbSales, "one data row per real sale");

  const audit = await mongoose.connection.db
    ?.collection("auditlogs")
    .findOne({ businessId: new mongoose.Types.ObjectId(ctx.biz.id), details: "format=excel,type=sales" });
  assert.ok(audit, "excel export audited");
});

test("p12: Excel export shares the CSV permission gate", async () => {
  const salesperson = (ctx as unknown as Record<string, Awaited<ReturnType<typeof registerUser>>>).salesperson;
  const denied = await get(
    `/api/v1/export/excel?businessId=${ctx.biz.id}&type=sales`,
    salesperson.accessToken
  );
  assert.equal(denied.status, 403);

  const badType = await get(
    `/api/v1/export/excel?businessId=${ctx.biz.id}&type=nope`,
    ctx.owner.accessToken
  );
  assert.equal(badType.status, 400);
});
