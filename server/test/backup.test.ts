import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { BusinessMembership, ROLES } from "../src/models/BusinessMembership";
import { Sale } from "../src/models/Sale";
import { Purchase } from "../src/models/Purchase";
import { Payment } from "../src/models/Payment";
import { Expense } from "../src/models/Expense";
import { Account } from "../src/models/Account";
import { Product } from "../src/models/Product";
import { Customer } from "../src/models/Customer";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { AuditLog } from "../src/models/AuditLog";
import { SyncEvent } from "../src/models/SyncEvent";
import { Device } from "../src/models/Device";
import { permissionsForRole } from "../src/config/roles";
import * as backupService from "../src/services/backup.service";

/**
 * Phase 11 — Backup & Restore.
 *
 * Every test drives the REAL HTTP endpoints (/api/v1/sync/restore,
 * /api/v1/backup/status, /api/v1/export/*) over the full middleware chain
 * and then verifies persisted documents: dataset completeness for a new
 * device, read-only behaviour, SyncEvent/AuditLog trails, RBAC matrix,
 * tenant isolation, shop-pin scoping and CSV escaping.
 */

const DEV = {
  deviceId: `bk-dev-${Math.random().toString(36).slice(2, 10)}`,
  deviceName: "BackupTest",
  platform: "android",
  appVersion: "1.0.0",
};

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Backup Test User",
    email: `bku${Math.random().toString(36).slice(2)}@example.com`,
    phone: "017" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
    ...over,
  };
}

async function registerUser(over: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/v1/auth/register").send(regBody(over));
  assert.equal(res.status, 201);
  return { ...res.body.data.user, ...res.body.data };
}

async function createBusiness(token: string) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Backup Business", type: "retail" });
  assert.equal(res.status, 201);
  return res.body.data;
}

let shopSeq = 0;

async function createShop(token: string, businessId: string, openingCash: number) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: "BK Shop",
      branchCode: `BK-${Date.now()}-${shopSeq++}`,
      openingCash,
    });
  assert.equal(res.status, 201);
  const shop = res.body.data;
  // openingCash seeds the shop's default Cash account with an authoritative
  // balance — that funded account is what the transactions below draw on.
  const accounts = await request(app)
    .get(`/api/v1/accounts?businessId=${businessId}&shopId=${shop.id}`)
    .set("Authorization", `Bearer ${token}`);
  assert.equal(accounts.status, 200);
  assert.equal(accounts.body.data.length, 1);
  return { ...shop, defaultAccount: accounts.body.data[0] };
}

async function createProduct(token: string, businessId: string, name?: string) {
  const res = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: name ?? `BK-P-${Math.random().toString(36).slice(2)}`,
      unit: "piece",
      purchasePrice: 5000,
      sellingPrice: 8000,
      currentStock: 50,
      taxRate: 0,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createCustomer(token: string, businessId: string, name?: string) {
  const res = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      // Comma + double quote — proves RFC-4180 escaping in the CSV export.
      name: name ?? `Doe, John "JD" ${Math.random().toString(36).slice(2)}`,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createSupplier(token: string, businessId: string) {
  const res = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: `BK-Sup-${Math.random().toString(36).slice(2)}` });
  assert.equal(res.status, 201);
  return res.body.data;
}

function post(path: string, token: string | null, body: Record<string, unknown>) {
  const r = request(app).post(path);
  if (token) r.set("Authorization", `Bearer ${token}`);
  return r.send(body);
}

function get(path: string, token: string | null) {
  const r = request(app).get(path);
  if (token) r.set("Authorization", `Bearer ${token}`);
  return r;
}

/** Seed a role-bound member the way production does (matrix-derived permissions). */
async function grantRole(
  userId: string,
  businessId: string,
  role: (typeof ROLES)[number]
): Promise<void> {
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { $set: { role, status: "ACTIVE", permissions: [...permissionsForRole(role)], shopId: null } },
    { upsert: true }
  );
}

interface Ctx {
  owner: Awaited<ReturnType<typeof registerUser>>;
  biz: { id: string };
  shopA1: { id: string };
  shopA2: { id: string };
  accountA1: { id: string; currentBalance: number };
  accountA2: { id: string };
  product: { id: string };
  customer: { id: string; name: string };
  supplier: { id: string };
  saleA1: { id: string; total: number; invoiceNo: string | null };
  saleA1Second: { id: string };
  paymentA1: { id: string; amount: number };
  expenseA1: { id: string };
  purchaseA2: { id: string; total: number };
  bizB: { id: string };
  ownerB: Awaited<ReturnType<typeof registerUser>>;
}

const ctx = {} as Ctx;

before(async () => {
  await connectTestDb("business-os-test-backup");

  // ── Tenant A: two shops, transactions in both ──────────────────────────
  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);
  const shopA1 = await createShop(owner.accessToken, biz.id, 500000);
  const shopA2 = await createShop(owner.accessToken, biz.id, 500000);
  const accountA1 = (shopA1 as unknown as { defaultAccount: { id: string } }).defaultAccount;
  const accountA2 = (shopA2 as unknown as { defaultAccount: { id: string } }).defaultAccount;
  const product = await createProduct(owner.accessToken, biz.id);
  const customer = await createCustomer(owner.accessToken, biz.id);
  const supplier = await createSupplier(owner.accessToken, biz.id);

  // Shop A1: cash sale ×2 + customer payment + expense.
  const saleRes = await post("/api/v1/sales", owner.accessToken, {
    businessId: biz.id,
    shopId: shopA1.id,
    customerId: customer.id,
    items: [{ productId: product.id, qty: 3, unitPrice: 8000 }],
    paidAmount: 24000,
    accountId: accountA1.id,
    localId: `bk-sale-${Math.random().toString(36).slice(2, 10)}`,
  });
  assert.equal(saleRes.status, 201, JSON.stringify(saleRes.body));
  const saleA1Second = await post("/api/v1/sales", owner.accessToken, {
    businessId: biz.id,
    shopId: shopA1.id,
    customerId: customer.id,
    items: [{ productId: product.id, qty: 1, unitPrice: 8000 }],
    paidAmount: 0, // fully on credit
    localId: `bk-sale-${Math.random().toString(36).slice(2, 10)}`,
  });
  assert.equal(saleA1Second.status, 201);

  const payRes = await post("/api/v1/payments", owner.accessToken, {
    businessId: biz.id,
    shopId: shopA1.id,
    type: "customer_payment",
    customerId: customer.id,
    amount: 4000,
    method: "CASH",
    accountId: accountA1.id,
    idempotencyKey: `bk-pay-${Math.random().toString(36).slice(2, 10)}`,
  });
  assert.equal(payRes.status, 201, JSON.stringify(payRes.body));

  const expRes = await post("/api/v1/expenses", owner.accessToken, {
    businessId: biz.id,
    shopId: shopA1.id,
    category: "RENT",
    amount: 5000,
    paymentAccountId: accountA1.id,
  });
  assert.equal(expRes.status, 201, JSON.stringify(expRes.body));

  // Shop A2: a purchase (inline COMPLETED).
  const purRes = await post("/api/v1/purchases", owner.accessToken, {
    businessId: biz.id,
    shopId: shopA2.id,
    supplierId: supplier.id,
    items: [{ productId: product.id, qty: 5 }],
    paidAmount: 25000,
    accountId: accountA2.id,
    localId: `bk-pur-${Math.random().toString(36).slice(2, 10)}`,
  });
  assert.equal(purRes.status, 201, JSON.stringify(purRes.body));
  assert.equal(purRes.body.data.status, "COMPLETED");

  // ── Tenant B ───────────────────────────────────────────────────────────
  const ownerB = await registerUser();
  const bizB = await createBusiness(ownerB.accessToken);
  await createShop(ownerB.accessToken, bizB.id, 100000);

  ctx.owner = owner;
  ctx.biz = biz;
  ctx.shopA1 = shopA1;
  ctx.shopA2 = shopA2;
  ctx.accountA1 = accountA1 as unknown as Ctx["accountA1"];
  ctx.accountA2 = accountA2;
  ctx.product = product;
  ctx.customer = customer as unknown as Ctx["customer"];
  ctx.supplier = supplier;
  ctx.saleA1 = {
    id: saleRes.body.data.id,
    total: saleRes.body.data.total,
    invoiceNo: saleRes.body.data.invoiceNo ?? null,
  };
  ctx.saleA1Second = { id: saleA1Second.body.data.id };
  ctx.paymentA1 = { id: payRes.body.data.id, amount: payRes.body.data.amount };
  ctx.expenseA1 = { id: expRes.body.data.id };
  ctx.purchaseA2 = { id: purRes.body.data.id, total: purRes.body.data.total };
  ctx.ownerB = ownerB;
  ctx.bizB = bizB;

  // Extra role-bound members for the export RBAC matrix.
  const manager = await registerUser();
  const accountant = await registerUser();
  const salesperson = await registerUser();
  const inventoryManager = await registerUser();
  const viewer = await registerUser();
  await grantRole(manager.user?.id ?? manager.id, biz.id, "Manager");
  await grantRole(accountant.user?.id ?? accountant.id, biz.id, "Accountant");
  await grantRole(salesperson.user?.id ?? salesperson.id, biz.id, "Salesperson");
  await grantRole(inventoryManager.user?.id ?? inventoryManager.id, biz.id, "Inventory Manager");
  await grantRole(viewer.user?.id ?? viewer.id, biz.id, "Viewer");
  (ctx as Record<string, unknown>).manager = manager;
  (ctx as Record<string, unknown>).accountant = accountant;
  (ctx as Record<string, unknown>).salesperson = salesperson;
  (ctx as Record<string, unknown>).inventoryManager = inventoryManager;
  (ctx as Record<string, unknown>).viewer = viewer;
});

after(async () => {
  await disconnectTestDb();
});

// ══════════════════════════════════════════════════════════════════════════
// RESTORE — full data pull for a new device
// ══════════════════════════════════════════════════════════════════════════

test("backup: restore returns the complete seeded dataset for the owner", async () => {
  const res = await get(`/api/v1/sync/restore?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  const d = res.body.data;

  assert.ok(d.restoredAt);
  const businessDoc = await mongoose.connection.db
    ?.collection("businesses")
    .findOne({ _id: new mongoose.Types.ObjectId(ctx.biz.id) });
  assert.ok(businessDoc);
  assert.equal(d.data.business.id, ctx.biz.id);
  assert.equal(d.data.business.name, businessDoc.name);

  // Every collection present, ids matching real documents.
  assert.equal(d.counts.sales, 2);
  assert.equal(d.counts.purchases, 1);
  assert.equal(d.counts.payments, 1);
  assert.equal(d.counts.expenses, 1);
  assert.equal(d.counts.accounts, 2);
  assert.equal(d.counts.shops, 2);
  assert.ok(d.counts.products >= 1);
  assert.ok(d.counts.customers >= 1);
  assert.ok(d.counts.suppliers >= 1);
  assert.ok(d.counts.stockMovements >= 2, "sale + purchase movements present");

  const saleIds = d.data.sales.map((s: { id: string }) => s.id);
  assert.ok(saleIds.includes(ctx.saleA1.id));
  assert.ok(saleIds.includes(ctx.saleA1Second.id));
  const purchaseIds = d.data.purchases.map((p: { id: string }) => p.id);
  assert.ok(purchaseIds.includes(ctx.purchaseA2.id));
  assert.ok(d.data.payments.some((p: { id: string }) => p.id === ctx.paymentA1.id));
  assert.ok(d.data.expenses.some((e: { id: string }) => e.id === ctx.expenseA1.id));

  // Server-authoritative financial values ride along unchanged.
  const restoredSale = d.data.sales.find((s: { id: string }) => s.id === ctx.saleA1.id);
  assert.equal(restoredSale.total, ctx.saleA1.total);
  assert.equal(restoredSale.invoiceNo, ctx.saleA1.invoiceNo);
});

test("backup: restore is read-only for business data but writes ONE RESTORE event", async () => {
  const before = {
    sale: await Sale.findById(ctx.saleA1.id),
    product: await Product.findById(ctx.product.id),
    customer: await Customer.findById(ctx.customer.id),
    account: await Account.findById(ctx.accountA1.id),
  };

  const eventsBefore = await SyncEvent.countDocuments({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
    direction: "RESTORE",
  });

  const res = await get(`/api/v1/sync/restore?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  assert.equal(res.status, 200);

  const after = {
    sale: await Sale.findById(ctx.saleA1.id)!,
    product: await Product.findById(ctx.product.id)!,
    customer: await Customer.findById(ctx.customer.id)!,
    account: await Account.findById(ctx.accountA1.id)!,
  };
  assert.deepEqual(after.sale!.toJSON(), before.sale!.toJSON(), "sale untouched");
  assert.equal(after.product!.currentStock, before.product!.currentStock);
  assert.equal(after.customer!.currentDue, before.customer!.currentDue);
  assert.equal(after.account!.currentBalance, before.account!.currentBalance);

  const eventsAfter = await SyncEvent.countDocuments({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
    direction: "RESTORE",
  });
  assert.equal(eventsAfter, eventsBefore + 1, "exactly one observability row per restore");
});

test("backup: restore logs deviceId from the verified JWT, not the body", async () => {
  const res = await get(
    `/api/v1/sync/restore?businessId=${ctx.biz.id}&deviceId=spoofed-device-id`,
    ctx.owner.accessToken
  );
  // deviceId is NOT a valid query field for this endpoint contract — an extra
  // query param is simply ignored by Zod's non-strict query schema, but it
  // must never reach the event row.
  assert.equal(res.status, 200);

  const event = await SyncEvent.findOne({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
    direction: "RESTORE",
  }).sort({ createdAt: -1 });

  assert.ok(event);
  const device = await Device.findOne({ deviceId: DEV.deviceId });
  assert.ok(device, "the registering device exists");
  assert.equal(String(event!.deviceId), String(device!._id), "deviceId came from JWT claims");

  // A client-supplied fake device must never appear.
  const spoof = await Device.findOne({ deviceId: "spoofed-device-id" });
  assert.equal(spoof, null);
});

test("backup: restore requires authentication (401)", async () => {
  const res = await get(`/api/v1/sync/restore?businessId=${ctx.biz.id}`, null);
  assert.equal(res.status, 401);
});

test("backup: cross-tenant restore is 404 and leaks nothing", async () => {
  const res = await get(`/api/v1/sync/restore?businessId=${ctx.biz.id}`, ctx.ownerB.accessToken);
  assert.equal(res.status, 404);
  assert.equal(res.body.data, undefined);
});

test("backup: restore validates the limit parameter strictly", async () => {
  for (const bad of ["0", "-5", "999999"]) {
    const res = await get(`/api/v1/sync/restore?businessId=${ctx.biz.id}&limit=${bad}`, ctx.owner.accessToken);
    assert.equal(res.status, 400, `limit=${bad} must be rejected`);
  }
  const limited = await get(
    `/api/v1/sync/restore?businessId=${ctx.biz.id}&limit=1`,
    ctx.owner.accessToken
  );
  assert.equal(limited.status, 200);
  assert.equal(limited.body.data.counts.sales, 1, "limit caps per-collection results");
});

test("backup: restore without businessId is 400", async () => {
  const res = await get("/api/v1/sync/restore", ctx.owner.accessToken);
  assert.equal(res.status, 400);
});

test("backup: shop-pinned member restores only their own shop's transactions", async () => {
  // Production path: employee invite pins the membership to one shop.
  const pinned = await registerUser();
  await BusinessMembership.findOneAndUpdate(
    {
      userId: new mongoose.Types.ObjectId(pinned.user?.id ?? pinned.id),
      businessId: new mongoose.Types.ObjectId(ctx.biz.id),
    },
    {
      $set: {
        role: "Salesperson",
        status: "ACTIVE",
        permissions: [...permissionsForRole("Salesperson")],
        shopId: new mongoose.Types.ObjectId(ctx.shopA2.id),
      },
    },
    { upsert: true }
  );

  const res = await get(`/api/v1/sync/restore?businessId=${ctx.biz.id}`, pinned.accessToken);
  assert.equal(res.status, 200);
  const d = res.body.data;

  // Master data stays business-wide…
  assert.ok(d.counts.customers >= 1);
  assert.ok(d.counts.shops === 2);

  // …but transactions are narrowed server-side to shop A2.
  assert.equal(d.counts.sales, 0, "shop A1 sales are NOT visible");
  assert.equal(d.counts.payments, 0);
  assert.equal(d.counts.expenses, 0);
  assert.equal(d.counts.purchases, 1, "shop A2's own purchase is visible");
  assert.equal(d.data.purchases[0].shopId, ctx.shopA2.id);
  assert.equal(d.counts.accounts, 1, "only shop A2 accounts");
  assert.equal(d.data.accounts[0].id, ctx.accountA2.id);
});

test("backup: concurrent restores all succeed and each is logged once", async () => {
  const before = await SyncEvent.countDocuments({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
    direction: "RESTORE",
  });
  const results = await Promise.allSettled([
    get(`/api/v1/sync/restore?businessId=${ctx.biz.id}`, ctx.owner.accessToken),
    get(`/api/v1/sync/restore?businessId=${ctx.biz.id}`, ctx.owner.accessToken),
    get(`/api/v1/sync/restore?businessId=${ctx.biz.id}`, ctx.owner.accessToken),
  ]);
  for (const r of results) {
    assert.equal(r.status, "fulfilled");
    assert.equal((r.value as unknown as { status: number }).status, 200);
  }
  const after = await SyncEvent.countDocuments({
    businessId: new mongoose.Types.ObjectId(ctx.biz.id),
    direction: "RESTORE",
  });
  assert.equal(after, before + 3);
});

// ══════════════════════════════════════════════════════════════════════════
// BACKUP STATUS — Atlas persistence visibility
// ══════════════════════════════════════════════════════════════════════════

test("backup: status reports counts that match the real documents", async () => {
  const res = await get(`/api/v1/backup/status?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const s = res.body.data;

  assert.equal(s.connected, true);
  assert.equal(s.healthy, true);

  const [salesCount, paymentsCount, expensesCount] = await Promise.all([
    Sale.countDocuments({ businessId: new mongoose.Types.ObjectId(ctx.biz.id) }),
    Payment.countDocuments({ businessId: newmongooseTypes(ctx.biz.id) }),
    Expense.countDocuments({ businessId: newmongooseTypes(ctx.biz.id) }),
  ]);
  assert.equal(s.counts.sales, salesCount);
  assert.equal(s.counts.payments, paymentsCount);
  assert.equal(s.counts.expenses, expensesCount);
  assert.ok(s.counts.journalEntries > 0);
  assert.ok(s.counts.auditLogs > 0);

  assert.ok(s.lastWriteAt, "a last write timestamp is reported");
  assert.ok(s.lastAuditAt, "audit trail timestamp is reported");
});

function newmongooseTypes(id: string) {
  return new mongoose.Types.ObjectId(id);
}

test("backup: status reflects a fresh write immediately", async () => {
  const statusBefore = await get(
    `/api/v1/backup/status?businessId=${ctx.biz.id}`,
    ctx.owner.accessToken
  );
  const countBefore = statusBefore.body.data.counts.sales;

  const sale = await post("/api/v1/sales", ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shopA1.id,
    customerId: ctx.customer.id,
    items: [{ productId: ctx.product.id, qty: 1, unitPrice: 8000 }],
    paidAmount: 8000,
    accountId: ctx.accountA1.id,
    localId: `bk-sale-${Math.random().toString(36).slice(2, 10)}`,
  });
  assert.equal(sale.status, 201);

  const statusAfter = await get(
    `/api/v1/backup/status?businessId=${ctx.biz.id}`,
    ctx.owner.accessToken
  );
  assert.equal(statusAfter.body.data.counts.sales, countBefore + 1);
});

test("backup: any active member may view backup status", async () => {
  const salesperson = (ctx as unknown as { salesperson: Awaited<ReturnType<typeof registerUser>> }).salesperson;
  const res = await get(`/api/v1/backup/status?businessId=${ctx.biz.id}`, salesperson.accessToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.healthy, true);
});

test("backup: status requires auth and rejects foreign tenants", async () => {
  const anon = await get(`/api/v1/backup/status?businessId=${ctx.biz.id}`, null);
  assert.equal(anon.status, 401);

  const foreign = await get(`/api/v1/backup/status?businessId=${ctx.biz.id}`, ctx.ownerB.accessToken);
  assert.equal(foreign.status, 404);
});

// ══════════════════════════════════════════════════════════════════════════
// EXPORT JSON — full archive incl. journals
// ══════════════════════════════════════════════════════════════════════════

test("backup: JSON export returns the whole archive as an attachment", async () => {
  const res = await get(`/api/v1/export/data?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"] ?? "", /application\/json/);
  assert.match(res.headers["content-disposition"] ?? "", /attachment;\s+filename=/);

  const d = res.body.data;
  assert.ok(d.exportedAt);
  assert.equal(d.format, "json");

  const entryDocs = await JournalEntry.find({ businessId: newmongooseTypes(ctx.biz.id) });
  const entryIds = entryDocs.map((e) => e._id);
  const [salesDocs, journalLineDocs] = await Promise.all([
    Sale.find({ businessId: newmongooseTypes(ctx.biz.id) }),
    JournalLine.find({ entryId: { $in: entryIds } }),
  ]);

  assert.equal(d.counts.sales, salesDocs.length);
  assert.equal(d.counts.journalLines, journalLineDocs.length);
  assert.ok(d.data.journalEntries.length > 0);
  assert.ok(d.data.auditLogs.length > 0);

  // FINANCIAL INVARIANT: every exported entry's debits equal its credits.
  const linesByEntry = new Map<string, { debit: number; credit: number }>();
  for (const line of d.data.journalLines) {
    const key = String(line.entryId ?? "");
    assert.ok(key, "every exported line references its journal entry");
    const agg = linesByEntry.get(key) ?? { debit: 0, credit: 0 };
    agg.debit += Number(line.debit ?? 0);
    agg.credit += Number(line.credit ?? 0);
    linesByEntry.set(key, agg);
  }
  for (const [, agg] of linesByEntry) {
    assert.equal(agg.debit, agg.credit, "exported journals stay balanced");
  }

  // Exported sales totals reconcile with the raw documents.
  const exportedSum = d.data.sales.reduce(
    (acc: number, s: { total: number }) => acc + Number(s.total),
    0
  );
  const dbSum = salesDocs.reduce((acc, s) => acc + s.total, 0);
  assert.equal(exportedSum, dbSum);
});

test("backup: JSON export writes a DATA_EXPORTED audit row", async () => {
  const res = await get(`/api/v1/export/data?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  assert.equal(res.status, 200);
  const auditRow = await AuditLog.findOne({
    businessId: newmongooseTypes(ctx.biz.id),
    action: "DATA_EXPORTED",
    details: "format=json",
  }).sort({ createdAt: -1 });
  assert.ok(auditRow, "DATA_EXPORTED audit row written");
});

test("backup: export RBAC matrix — Salesperson/Inventory Manager/Viewer 403", async () => {
  const c = ctx as unknown as Record<
    string,
    Awaited<ReturnType<typeof registerUser>>
  >;
  for (const role of ["salesperson", "inventoryManager", "viewer"]) {
    const res = await get(`/api/v1/export/data?businessId=${ctx.biz.id}`, c[role].accessToken);
    assert.equal(res.status, 403, `${role} must not export`);
  }
  for (const role of ["manager", "accountant"]) {
    const res = await get(`/api/v1/export/data?businessId=${ctx.biz.id}`, c[role].accessToken);
    assert.equal(res.status, 200, `${role} may export`);
  }
});

test("backup: export service re-checks permission at the service level", async () => {
  const c = ctx as unknown as Record<string, Awaited<ReturnType<typeof registerUser>>>;
  const salespersonId = c.salesperson.user?.id ?? c.salesperson.id;
  await assert.rejects(
    () => backupService.exportData(salespersonId, { businessId: ctx.biz.id }),
    /permission/i
  );
});

test("backup: cross-tenant export is 404 and writes no audit row for the victim", async () => {
  const before = await AuditLog.countDocuments({
    businessId: newmongooseTypes(ctx.biz.id),
    action: "DATA_EXPORTED",
  });
  const res = await get(`/api/v1/export/data?businessId=${ctx.biz.id}`, ctx.ownerB.accessToken);
  assert.equal(res.status, 404);
  const after = await AuditLog.countDocuments({
    businessId: newmongooseTypes(ctx.biz.id),
    action: "DATA_EXPORTED",
  });
  assert.equal(after, before, "no audit row for a refused export");
});

test("backup: unauthenticated export is 401", async () => {
  const res = await get(`/api/v1/export/data?businessId=${ctx.biz.id}`, null);
  assert.equal(res.status, 401);
});

// ══════════════════════════════════════════════════════════════════════════
// EXPORT CSV — flat entity exports
// ══════════════════════════════════════════════════════════════════════════

test("backup: sales CSV has exact header, one row per document and escaped values", async () => {
  const res = await get(
    `/api/v1/export/csv?businessId=${ctx.biz.id}&type=sales`,
    ctx.owner.accessToken
  );
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"] ?? "", /text\/csv/);
  assert.match(res.headers["content-disposition"] ?? "", /attachment/);

  const text = res.text as string;
  const lines = text.trim().split(/\r\n/);
  assert.equal(
    lines[0],
    "id,invoiceNo,date,shopId,customerId,customerName,subtotal,discountAmount,taxAmount,total,paidAmount,dueAmount,paymentStatus,status"
  );

  const salesDocs = await Sale.find({ businessId: newmongooseTypes(ctx.biz.id) });
  assert.equal(lines.length - 1, salesDocs.length, "one data row per sale document");

  // The seeded customer name contains a comma AND double quotes — RFC 4180
  // doubles inner quotes and wraps the cell, so the ESCAPED form must appear.
  const escapedName = `"${ctx.customer.name.replace(/"/g, '""')}"`;
  assert.ok(text.includes(escapedName), "quoted comma+quote name survives");

  const auditRow = await AuditLog.findOne({
    businessId: newmongooseTypes(ctx.biz.id),
    action: "DATA_EXPORTED",
    details: "format=csv,type=sales",
  }).sort({ createdAt: -1 });
  assert.ok(auditRow, "CSV export audited");
});

test("backup: every CSV type exports with correct row counts", async () => {
  const cases: Array<[string, () => Promise<number>]> = [
    ["products", () => Product.countDocuments({ businessId: newmongooseTypes(ctx.biz.id) })],
    ["customers", () => Customer.countDocuments({ businessId: newmongooseTypes(ctx.biz.id) })],
    [
      "accounts",
      () =>
        Account.countDocuments({
          businessId: newmongooseTypes(ctx.biz.id),
        }),
    ],
    ["payments", () => Payment.countDocuments({ businessId: newmongooseTypes(ctx.biz.id) })],
    ["expenses", () => Expense.countDocuments({ businessId: newmongooseTypes(ctx.biz.id) })],
    ["purchases", () => Purchase.countDocuments({ businessId: newmongooseTypes(ctx.biz.id) })],
  ];
  for (const [type, expected] of cases) {
    const res = await get(
      `/api/v1/export/csv?businessId=${ctx.biz.id}&type=${type}`,
      ctx.owner.accessToken
    );
    assert.equal(res.status, 200, `type=${type}`);
    const lines = (res.text as string).trim().split(/\r\n/);
    assert.equal(lines.length - 1, await expected(), `type=${type} row count`);
  }
});

test("backup: CSV type validation — unknown and missing types are 400", async () => {
  const bad = await get(
    `/api/v1/export/csv?businessId=${ctx.biz.id}&type=not_a_type`,
    ctx.owner.accessToken
  );
  assert.equal(bad.status, 400);
  const missing = await get(`/api/v1/export/csv?businessId=${ctx.biz.id}`, ctx.owner.accessToken);
  assert.equal(missing.status, 400);
});

test("backup: CSV export honours the same RBAC matrix", async () => {
  const c = ctx as unknown as Record<string, Awaited<ReturnType<typeof registerUser>>>;
  const denied = await get(
    `/api/v1/export/csv?businessId=${ctx.biz.id}&type=sales`,
    c.salesperson.accessToken
  );
  assert.equal(denied.status, 403);
  const allowed = await get(
    `/api/v1/export/csv?businessId=${ctx.biz.id}&type=sales`,
    c.manager.accessToken
  );
  assert.equal(allowed.status, 200);
});

test("backup: tenant B's CSV never contains tenant A data", async () => {
  const resB = await get(
    `/api/v1/export/csv?businessId=${ctx.bizB.id}&type=sales`,
    ctx.ownerB.accessToken
  );
  assert.equal(resB.status, 200);
  const text = resB.text as string;
  assert.doesNotMatch(text, new RegExp(ctx.saleA1.invoiceNo ?? "NEVER-MATCHES"));
  assert.equal(text.trim().split(/\r\n/).length - 1, 0, "tenant B has no sales yet");

  const jsonB = await get(`/api/v1/export/data?businessId=${ctx.bizB.id}`, ctx.ownerB.accessToken);
  assert.equal(jsonB.status, 200);
  const blob = JSON.stringify(jsonB.body.data);
  assert.ok(!blob.includes(ctx.saleA1.id), "tenant A sale ids absent");
  assert.ok(!blob.includes(ctx.customer.name), "tenant A customer names absent");
});
