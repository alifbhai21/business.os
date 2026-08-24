import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Sale } from "../src/models/Sale";
import { Expense } from "../src/models/Expense";
import { Account } from "../src/models/Account";
import { Product } from "../src/models/Product";
import { Customer } from "../src/models/Customer";
import { StockMovement } from "../src/models/StockMovement";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { SyncEvent } from "../src/models/SyncEvent";

/**
 * Phase 10 — offline sync engine (server half).
 *
 * Every test drives the REAL HTTP endpoints (/api/v1/sync/push|pull) and
 * then inspects the persisted documents: exactly-once financial effects,
 * per-op failure isolation, RBAC, tenant isolation and the SyncEvent trail.
 */

const DEV = { deviceId: "sync-test-dev", deviceName: "SyncTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Sync Test User",
    email: `syn${Math.random().toString(36).slice(2)}@example.com`,
    phone: "019" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
    ...over,
  };
}

async function registerUser(over: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/v1/auth/register").send(regBody(over));
  assert.equal(res.status, 201);
  // Flatten { user, businessId, tokens } like the other suites.
  return { ...res.body.data.user, ...res.body.data };
}

async function createBusiness(token: string) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Sync Business", type: "retail" });
  assert.equal(res.status, 201);
  return res.body.data;
}

let shopSeq = 0;

async function createShop(token: string, businessId: string) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `SYN-${Date.now()}-${shopSeq++}` });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createAccount(token: string, businessId: string, shopId: string) {
  const res = await request(app)
    .post("/api/v1/accounts")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, shopId, type: "CASH", name: `Cash-${Date.now()}-${shopSeq++}` });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createProductOnline(
  token: string,
  businessId: string,
  over: Record<string, unknown> = {}
) {
  const res = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: `P-${Math.random().toString(36).slice(2)}`,
      unit: "piece",
      purchasePrice: 5000,
      sellingPrice: 8000,
      currentStock: 100,
      taxRate: 0,
      ...over,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

function push(token: string, body: Record<string, unknown>) {
  return request(app).post("/api/v1/sync/push").set("Authorization", `Bearer ${token}`).send(body);
}

interface Ctx {
  owner: Awaited<ReturnType<typeof registerUser>>;
  biz: { id: string };
  shop: { id: string };
  account: { id: string; currentBalance: number };
  product: { id: string };
}

const ctx = {} as Ctx;

before(async () => {
  await connectTestDb("business-os-test-sync");
  const owner = await registerUser();
  const biz = await createBusiness(owner.accessToken);
  const shop = await createShop(owner.accessToken, biz.id);
  const account = await createAccount(owner.accessToken, biz.id, shop.id);
  const product = await createProductOnline(owner.accessToken, biz.id);
  ctx.owner = owner;
  ctx.biz = biz;
  ctx.shop = shop;
  ctx.account = account;
  ctx.product = product;
});

after(async () => {
  await disconnectTestDb();
});

// ── Security surface ─────────────────────────────────────────────────────────

test("sync: unauthenticated push/pull are 401", async () => {
  const p = await request(app).post("/api/v1/sync/push").send({ businessId: "x", ops: [] });
  assert.equal(p.status, 401);
  const g = await request(app).get("/api/v1/sync/pull?businessId=x");
  assert.equal(g.status, 401);
});

test("sync: strict schema rejects spoofed deviceId, empty ops and bad op type", async () => {
  const spoof = await push(ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    deviceId: "507f1f77bcf86cd799439011",
    ops: [{ localId: "abc12345", type: "expense", payload: {} }],
  });
  assert.equal(spoof.status, 400);

  const empty = await push(ctx.owner.accessToken, { businessId: ctx.biz.id, ops: [] });
  assert.equal(empty.status, 400);

  const badType = await push(ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    ops: [{ localId: "abc12345", type: "transfer", payload: {} }],
  });
  assert.equal(badType.status, 400);
});

test("sync: cross-tenant push is 404 with zero side effects", async () => {
  const foreign = await registerUser();
  await createBusiness(foreign.accessToken);

  const res = await push(foreign.accessToken, {
    businessId: ctx.biz.id,
    ops: [{ localId: "fore123456", type: "expense", payload: { category: "RENT", amount: 1000, paymentAccountId: ctx.account.id } }],
  });
  assert.equal(res.status, 404);
  assert.equal(await Expense.countDocuments({ businessId: new mongoose.Types.ObjectId(ctx.biz.id), amount: 1000 }), 0);
});

// ── Exactly-once sale via the queue ────────────────────────────────────────

test("sync: queued sale commits fully (sale+stock+journal+account) and is reported SYNCED", async () => {
  const before = (await Account.findById(ctx.account.id))!.currentBalance;

  const localId = "sale-q-0001";
  const res = await push(ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId,
        type: "sale",
        payload: {
          items: [{ productId: ctx.product.id, qty: 3 }],
          paidAmount: 24000,
          accountId: ctx.account.id,
        },
      },
    ],
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.okCount, 1);
  const result = res.body.data.results[0];
  assert.equal(result.status, "SYNCED");
  assert.equal(result.duplicate, false);

  // Persisted effects — server recomputed the total from the selling price.
  const sale = await Sale.findOne({ businessId: new mongoose.Types.ObjectId(ctx.biz.id), localId });
  assert.ok(sale);
  assert.equal(sale!.status, "COMPLETED");
  assert.equal(sale!.total, 24000);
  // 05.13 invariant: device identity snapshot comes from the JWT claims.
  assert.ok(sale!.deviceId, "deviceId must be snapshotted from verified token");

  const account = await Account.findById(ctx.account.id);
  assert.equal(account!.currentBalance, before + 24000);

  const product = await Product.findById(ctx.product.id);
  assert.equal(product!.currentStock, 97);

  const movement = await StockMovement.findOne({ refType: "SALE", refId: sale!._id });
  assert.ok(movement);
  assert.equal(movement!.qtyChange, -3);

  const entry = await JournalEntry.findOne({ referenceType: "SALE", referenceId: sale!._id });
  assert.ok(entry);
  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.equal(lines.reduce((s, l) => s + l.debit, 0), lines.reduce((s, l) => s + l.credit, 0));

  const ev = await SyncEvent.findOne({ businessId: sale!.businessId, direction: "PUSH" }).sort({ createdAt: -1 });
  assert.ok(ev);
  assert.equal(ev!.okCount, 1);
  assert.equal(ev!.status, "SUCCESS");
});

test("sync: retry of the same queued sale is duplicate:true with ZERO additional effect", async () => {
  const before = (await Account.findById(ctx.account.id))!.currentBalance;
  const stockBefore = (await Product.findById(ctx.product.id))!.currentStock;

  const res = await push(ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId: "sale-q-0001",
        type: "sale",
        payload: { items: [{ productId: ctx.product.id, qty: 3 }], paidAmount: 24000, accountId: ctx.account.id },
      },
    ],
  });
  assert.equal(res.status, 200);
  const result = res.body.data.results[0];
  assert.equal(result.status, "SYNCED");
  assert.equal(result.duplicate, true);

  assert.equal((await Account.findById(ctx.account.id))!.currentBalance, before, "no second credit");
  assert.equal((await Product.findById(ctx.product.id))!.currentStock, stockBefore, "no second decrement");
  assert.equal(await Sale.countDocuments({ localId: "sale-q-0001" }), 1);
});

test("sync: concurrent pushes of one localId produce exactly-once effects", async () => {
  const before = (await Account.findById(ctx.account.id))!.currentBalance;
  const localId = "sale-conc-01";

  const body = {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId,
        type: "sale",
        payload: { items: [{ productId: ctx.product.id, qty: 1 }], paidAmount: 8000, accountId: ctx.account.id },
      },
    ],
  };
  const responses = await Promise.all([push(ctx.owner.accessToken, body), push(ctx.owner.accessToken, body)]);

  const ok = responses.filter((r) => r.status === 200);
  assert.ok(ok.length >= 1);
  for (const r of ok) {
    assert.equal(r.body.data.results[0].status, "SYNCED");
  }

  assert.equal((await Account.findById(ctx.account.id))!.currentBalance, before + 8000, "credited once");
  assert.equal(await Sale.countDocuments({ localId }), 1);
});

// ── Batch ordering & per-op failure isolation ───────────────────────────────

test("sync: mixed batch applies ops strictly in queue order (balance math exact)", async () => {
  const before = (await Account.findById(ctx.account.id))!.currentBalance;

  // Order matters: expense out first, then a smaller sale in.
  const res = await push(ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId: "exp-order-001",
        type: "expense",
        payload: { category: "TRANSPORT", amount: 3000, paymentAccountId: ctx.account.id },
      },
      {
        localId: "sale-order-001",
        type: "sale",
        payload: { items: [{ productId: ctx.product.id, qty: 1 }], paidAmount: 8000, accountId: ctx.account.id },
      },
    ],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.results.map((r: { status: string }) => r.status), ["SYNCED", "SYNCED"]);
  assert.equal((await Account.findById(ctx.account.id))!.currentBalance, before - 3000 + 8000);
});

test("sync: one bad op never blocks the rest (isolation + PARTIAL event)", async () => {
  const before = (await Account.findById(ctx.account.id))!.currentBalance;
  const stockBefore = (await Product.findById(ctx.product.id))!.currentStock;

  const res = await push(ctx.owner.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId: "bad-sale-0001",
        type: "sale",
        // Insufficient stock: 999 > available. Permanent business rejection.
        // Low unit price keeps it a fully-paid CASH sale so the credit rule
        // doesn't fire first — the stock guard is what must reject it.
        payload: {
          items: [{ productId: ctx.product.id, qty: 999, unitPrice: 1 }],
          paidAmount: 999,
          accountId: ctx.account.id,
        },
      },
      {
        localId: "good-cust-001",
        type: "customer",
        payload: { name: "Queued Customer", phone: "01511223344" },
      },
      {
        localId: "good-exp-0001",
        type: "expense",
        payload: { category: "OTHER", amount: 1500, paymentAccountId: ctx.account.id },
      },
    ],
  });
  assert.equal(res.status, 200);
  const statuses = res.body.data.results.map((r: { status: string }) => r.status);
  assert.deepEqual(statuses, ["CONFLICT", "SYNCED", "SYNCED"]);
  assert.match(res.body.data.results[0].error as string, /stock/i);

  // Partial state: only the good ops landed.
  assert.equal((await Account.findById(ctx.account.id))!.currentBalance, before - 1500);
  assert.equal((await Product.findById(ctx.product.id))!.currentStock, stockBefore, "failed sale left no movement");
  assert.ok(await Customer.findOne({ businessId: new mongoose.Types.ObjectId(ctx.biz.id), localId: "good-cust-001" }));

  const ev = await SyncEvent.findOne({ direction: "PUSH" }).sort({ createdAt: -1 });
  assert.equal(ev!.status, "PARTIAL");
  assert.equal(ev!.conflictCount, 1);
  assert.equal(ev!.okCount, 2);
});

// ── Master-data idempotency ────────────────────────────────────────────────

test("sync: queued customer create is idempotent on retry (one doc, duplicate:true)", async () => {
  const body = {
    businessId: ctx.biz.id,
    ops: [
      {
        localId: "cust-dup-0001",
        type: "customer",
        payload: { name: "Dup Customer", openingBalance: 5000 },
      },
    ],
  };
  const first = await push(ctx.owner.accessToken, body);
  assert.equal(first.status, 200);
  assert.equal(first.body.data.results[0].duplicate, false);

  const second = await push(ctx.owner.accessToken, body);
  assert.equal(second.status, 200);
  assert.equal(second.body.data.results[0].duplicate, true);
  assert.equal(second.body.data.results[0].serverId, first.body.data.results[0].serverId);

  assert.equal(await Customer.countDocuments({ localId: "cust-dup-0001" }), 1);
  // Due seeded once from the opening balance.
  const cust = await Customer.findOne({ localId: "cust-dup-0001" });
  assert.equal(cust!.currentDue, 5000);
});

test("sync: Salesperson may push sales but not expenses; Viewer blocked entirely", async () => {
  const salesperson = await registerUser();
  const viewer = await registerUser();
  const addEmp = async (phone: string, role: string) => {
    const res = await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${ctx.owner.accessToken}`)
      .send({ businessId: ctx.biz.id, name: "Staff", phone, role });
    assert.equal(res.status, 201);
    return res.body.data;
  };
  await addEmp(salesperson.phone, "Salesperson");
  await addEmp(viewer.phone, "Viewer");

  const spPush = await push(salesperson.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId: "sp-sale-00001",
        type: "sale",
        payload: { items: [{ productId: ctx.product.id, qty: 1 }], paidAmount: 8000, accountId: ctx.account.id },
      },
    ],
  });
  assert.equal(spPush.status, 200);
  assert.equal(spPush.body.data.results[0].status, "SYNCED");

  const spExpense = await push(salesperson.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId: "sp-expense-01",
        type: "expense",
        payload: { category: "OTHER", amount: 1000, paymentAccountId: ctx.account.id },
      },
    ],
  });
  assert.equal(spExpense.status, 200);
  assert.equal(spExpense.body.data.results[0].status, "CONFLICT", "Salesperson cannot record expenses");

  const viewerPush = await push(viewer.accessToken, {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId: "viewer-sale1",
        type: "sale",
        payload: { items: [{ productId: ctx.product.id, qty: 1 }], paidAmount: 8000, accountId: ctx.account.id },
      },
    ],
  });
  assert.equal(viewerPush.status, 200);
  assert.equal(viewerPush.body.data.results[0].status, "CONFLICT", "Viewer cannot record sales");
});

// ── Payment via the queue ──────────────────────────────────────────────────

test("sync: queued customer payment reduces due exactly once across retries", async () => {
  // Create an online customer with due, then settle via queued payment.
  const custRes = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${ctx.owner.accessToken}`)
    .send({ businessId: ctx.biz.id, name: "Due Customer", openingBalance: 12000 });
  assert.equal(custRes.status, 201);
  const customerId = custRes.body.data.id;

  const body = {
    businessId: ctx.biz.id,
    shopId: ctx.shop.id,
    ops: [
      {
        localId: "pay-due-00001",
        type: "payment",
        payload: {
          type: "customer_payment",
          customerId,
          accountId: ctx.account.id,
          amount: 7000,
          method: "CASH",
        },
      },
    ],
  };

  const first = await push(ctx.owner.accessToken, body);
  assert.equal(first.body.data.results[0].status, "SYNCED");
  const retry = await push(ctx.owner.accessToken, body);
  assert.equal(retry.body.data.results[0].status, "SYNCED");
  assert.equal(retry.body.data.results[0].duplicate, true);

  const cust = await Customer.findById(customerId);
  assert.equal(cust!.currentDue, 5000, "due reduced exactly once");
});

// ── Pull ───────────────────────────────────────────────────────────────────

test("sync: pull returns master data delta and an advanced cursor; fresh cursor yields empty", async () => {
  const first = await request(app)
    .get(`/api/v1/sync/pull?businessId=${ctx.biz.id}`)
    .set("Authorization", `Bearer ${ctx.owner.accessToken}`);
  assert.equal(first.status, 200);
  assert.ok(first.body.data.counts.products >= 1);
  assert.ok(first.body.data.cursor);

  const cursor = first.body.data.cursor as string;

  // No mutations since -> empty delta.
  const empty = await request(app)
    .get(`/api/v1/sync/pull?businessId=${ctx.biz.id}&cursor=${encodeURIComponent(cursor)}`)
    .set("Authorization", `Bearer ${ctx.owner.accessToken}`);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.data.counts.products, 0);
  assert.equal(empty.body.data.counts.customers, 0);

  // Mutate, then pull again: only the changed doc comes back.
  await createProductOnline(ctx.owner.accessToken, ctx.biz.id, { name: "Delta Product" });
  const delta = await request(app)
    .get(`/api/v1/sync/pull?businessId=${ctx.biz.id}&cursor=${encodeURIComponent(cursor)}`)
    .set("Authorization", `Bearer ${ctx.owner.accessToken}`);
  assert.equal(delta.status, 200);
  assert.equal(delta.body.data.counts.products, 1);
  assert.equal(delta.body.data.products[0].name, "Delta Product");
});

test("sync: pull is tenant-isolated and rejects invalid cursors", async () => {
  const foreign = await registerUser();
  await createBusiness(foreign.accessToken);

  const foreignPull = await request(app)
    .get(`/api/v1/sync/pull?businessId=${ctx.biz.id}`)
    .set("Authorization", `Bearer ${foreign.accessToken}`);
  assert.equal(foreignPull.status, 404);

  const badCursor = await request(app)
    .get(`/api/v1/sync/pull?businessId=${ctx.biz.id}&cursor=not-a-date`)
    .set("Authorization", `Bearer ${ctx.owner.accessToken}`);
  assert.equal(badCursor.status, 400);
});
