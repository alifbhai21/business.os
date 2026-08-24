import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";

// Property testing fires hundreds of requests across scenarios in a few
// seconds — far beyond the production-style 100/min ceiling. Raise it BEFORE
// the app module loads (same convention as the real-Atlas harness and the
// performance suite); the limiter itself is exercised by dedicated tests.
process.env.RATE_LIMIT_MAX = "1000000";

import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { Customer } from "../src/models/Customer";
import { Account } from "../src/models/Account";
import { EXPENSE_CATEGORIES } from "../src/config/accounts";

/** Loaded lazily inside before() so the env tweak above lands first. */
let app: import("express").Express;

/**
 * Phase 13 — PROPERTY-BASED journal balance test (PRD task list).
 *
 * Instead of hand-picked fixtures, a seeded PRNG drives randomized but
 * REPRODUCIBLE sequences of financial operations (sales, purchases,
 * payments, expenses) through the real HTTP API. After EVERY operation the
 * invariant is asserted across the WHOLE ledger:
 *
 *   for every journal entry:  Σ debit(lines) === Σ credit(lines)
 *
 * and the trial balance must hold at the end. A fixed seed keeps failures
 * debuggable: the exact scenario can be replayed.
 */

/** Deterministic PRNG (mulberry32) — reproducible random sequences. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEV = {
  deviceId: "journal-prop-device",
  deviceName: "Journal Property",
  platform: "android",
  appVersion: "1.0.0",
};

function regBody() {
  return {
    name: "Property User",
    email: `jp${Math.random().toString(36).slice(2)}@example.com`,
    phone: "017" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    ...DEV,
  };
}

async function registerUser() {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  assert.equal(res.status, 201);
  return res.body.data as {
    accessToken: string;
    user: { id: string };
  };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface ScenarioCtx {
  token: string;
  businessId: string;
  shopId: string;
  accountId: string;
  productIds: string[];
  customerId: string;
}

async function setupScenario(rand: () => number): Promise<ScenarioCtx> {
  const user = await registerUser();
  const bizRes = await request(app)
    .post("/api/v1/businesses")
    .set(auth(user.accessToken))
    .send({
      name: `Prop Biz ${rand().toFixed(8)}`,
      type: "retail",
      allowNegativeStock: true, // every generated sale must succeed regardless of order
    });
  assert.equal(bizRes.status, 201);
  const businessId = bizRes.body.data.id;

  const shopRes = await request(app)
    .post("/api/v1/shops")
    .set(auth(user.accessToken))
    .send({ businessId, name: "Main", branchCode: `JP-${Math.random().toString(36).slice(2)}` });
  assert.equal(shopRes.status, 201);
  const shopId = shopRes.body.data.id;

  const productIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await request(app)
      .post("/api/v1/products")
      .set(auth(user.accessToken))
      .send({
        businessId,
        name: `Prop Product ${i}-${Math.random().toString(36).slice(2)}`,
        sellingPrice: 10_000 + Math.floor(rand() * 90_000),
        purchasePrice: 5_000 + Math.floor(rand() * 40_000),
        currentStock: Math.floor(rand() * 50),
      });
    assert.equal(res.status, 201);
    productIds.push(res.body.data.id);
  }

  const supplierRes = await request(app)
    .post("/api/v1/suppliers")
    .set(auth(user.accessToken))
    .send({ businessId, name: `Prop Supplier ${Math.random().toString(36).slice(2)}` });
  assert.equal(supplierRes.status, 201);

  const customerRes = await request(app)
    .post("/api/v1/customers")
    .set(auth(user.accessToken))
    .send({ businessId, name: `Prop Customer ${Math.random().toString(36).slice(2)}` });
  assert.equal(customerRes.status, 201);
  const customerId = customerRes.body.data.id;

  const accountsRes = await request(app)
    .get(`/api/v1/accounts?businessId=${businessId}&shopId=${shopId}`)
    .set(auth(user.accessToken));
  assert.equal(accountsRes.status, 200);
  assert.ok(accountsRes.body.data.length >= 1);

  return {
    token: user.accessToken,
    businessId,
    shopId,
    accountId: accountsRes.body.data[0].id,
    productIds,
    customerId,
  };
}

/** Assert every EXISTING journal entry of the business is balanced. */
async function assertLedgerBalanced(businessId: string): Promise<number> {
  const entries = await JournalEntry.find({
    businessId: new mongoose.Types.ObjectId(businessId),
  }).select("_id");

  if (entries.length === 0) return 0;

  const lines = await JournalLine.aggregate([
    {
      $match: {
        entryId: { $in: entries.map((e) => e._id) },
      },
    },
    {
      $group: {
        _id: "$entryId",
        debit: { $sum: "$debit" },
        credit: { $sum: "$credit" },
      },
    },
  ]);

  assert.equal(
    lines.length,
    entries.length,
    "every journal entry must have at least one line pair"
  );
  for (const line of lines) {
    assert.equal(
      line.debit,
      line.credit,
      `journal entry ${String(line._id)} unbalanced: debit=${line.debit} credit=${line.credit}`
    );
    assert.ok(Number.isSafeInteger(line.debit), "journal totals stay within integer paisa");
  }
  return entries.length;
}

/**
 * Every op returns TRUE only when it actually applied a financial effect
 * (skips/rejections return false so `applied` counts real journal work).
 */
async function doRandomSale(ctx: ScenarioCtx, rand: () => number): Promise<boolean> {
  const itemCount = 1 + Math.floor(rand() * 2);
  // Distinct products per line — the API rejects duplicate lines by design.
  const picked = [...ctx.productIds].sort(() => rand() - 0.5).slice(0, itemCount);
  const items = picked.map((productId, i) => ({
    productId,
    qty: 1 + Math.floor(rand() * 5),
    ...(i === 0 && rand() < 0.3 ? { unitPrice: 20_000 + Math.floor(rand() * 50_000) } : {}),
  }));
  const subtotal = items.reduce((sum, it) => {
    return sum + it.qty * (it.unitPrice ?? 30_000);
  }, 0);
  const pay = rand() < 0.5 ? Math.floor(subtotal * rand()) : 0;

  const res = await request(app)
    .post("/api/v1/sales")
    .set(auth(ctx.token))
    .send({
      businessId: ctx.businessId,
      shopId: ctx.shopId,
      customerId: ctx.customerId,
      items,
      draft: false,
      ...(pay > 0 ? { paidAmount: pay, accountId: ctx.accountId } : {}),
    });
  if (res.status !== 201) return false; // e.g. overpayment guard — legal rejection
  return true;
}

async function doRandomPurchase(ctx: ScenarioCtx, rand: () => number): Promise<boolean> {
  const sup = await request(app)
    .get(`/api/v1/suppliers?businessId=${ctx.businessId}&shopId=${ctx.shopId}`)
    .set(auth(ctx.token));
  const supplierId = sup.body?.data?.items?.[0]?.id;
  assert.ok(supplierId, `supplier list unusable for purchase (status ${sup.status})`);
  const itemCount = 1 + Math.floor(rand() * 2);
  const picked = [...ctx.productIds].sort(() => rand() - 0.5).slice(0, itemCount);
  const items = picked.map((productId) => ({
    productId,
    qty: 1 + Math.floor(rand() * 10),
  }));
  const res = await request(app)
    .post("/api/v1/purchases")
    .set(auth(ctx.token))
    .send({
      businessId: ctx.businessId,
      shopId: ctx.shopId,
      supplierId,
      items,
      draft: false,
    });
  return res.status === 201 || res.status === 200;
}

async function doRandomCustomerPayment(ctx: ScenarioCtx, rand: () => number): Promise<boolean> {
  const customer = await Customer.findById(ctx.customerId);
  assert.ok(customer);
  if ((customer.currentDue ?? 0) <= 0) return false; // nothing to settle

  const amount = 1 + Math.floor(rand() * customer.currentDue);
  const res = await request(app)
    .post("/api/v1/payments")
    .set(auth(ctx.token))
    .send({
      businessId: ctx.businessId,
      shopId: ctx.shopId,
      type: "customer_payment",
      customerId: ctx.customerId,
      accountId: ctx.accountId,
      amount,
      method: "CASH",
      idempotencyKey: `prop-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    });
  return res.status === 201;
}

async function doRandomExpense(ctx: ScenarioCtx, rand: () => number): Promise<boolean> {
  const account = await Account.findById(ctx.accountId);
  assert.ok(account);
  if ((account.currentBalance ?? 0) <= 0) return false; // nothing to spend

  const amount = 1 + Math.floor(rand() * Math.min(account.currentBalance, 50000));
  const category = EXPENSE_CATEGORIES[Math.floor(rand() * EXPENSE_CATEGORIES.length)];
  const res = await request(app)
    .post("/api/v1/expenses")
    .set(auth(ctx.token))
    .send({
      businessId: ctx.businessId,
      shopId: ctx.shopId,
      category,
      amount,
      accountId: ctx.accountId,
    });
  return res.status === 201;
}

before(async () => {
  ({ app } = await import("../src/app"));
  await connectTestDb("business-os-test-journal-prop");
});

after(async () => {
  await disconnectTestDb();
});

test("property-based: randomized financial sequences keep EVERY journal balanced", async () => {
  const SCENARIOS = 12;
  const OPS_PER_SCENARIO = 8;

  for (let s = 0; s < SCENARIOS; s++) {
    // Fixed seed → failing scenarios are exactly replayable.
    const rand = mulberry32(0x135_0000 + s);
    const ctx = await setupScenario(rand);

    const ops = [doRandomSale, doRandomPurchase, doRandomCustomerPayment, doRandomExpense];
    let applied = 0;

    // A purchase first, unconditionally: it always applies (credit purchase,
    // no balance guard) and guarantees the scenario has real journal traffic
    // regardless of what the seeded draws choose afterwards.
    const baselineOk = await doRandomPurchase(ctx, rand);
    if (baselineOk) {
      applied++;
      await assertLedgerBalanced(ctx.businessId);
    }

    for (let op = 0; op < OPS_PER_SCENARIO && applied < 5; op++) {
      const chosen = ops[Math.floor(rand() * ops.length)];
      const ok = await chosen(ctx, rand);
      if (ok) {
        applied++;
        // The invariant holds after EVERY applied operation — not just at the end.
        await assertLedgerBalanced(ctx.businessId);
      }
    }
    assert.ok(applied >= 3, `scenario ${s} exercised too few operations (${applied})`);

    // A healthy scenario must have produced real journal entries.
    const entryCount = await assertLedgerBalanced(ctx.businessId);
    assert.ok(entryCount > 0, `scenario ${s} produced no journal entries`);

    // Final gate: the trial-balance read layer agrees with the raw lines.
    const tb = await request(app)
      .get(`/api/v1/accounting/trial-balance?businessId=${ctx.businessId}&shopId=${ctx.shopId}`)
      .set(auth(ctx.token));
    assert.equal(tb.status, 200);
    assert.equal(tb.body.data.balanced, true);
    assert.equal(tb.body.data.totalDebit, tb.body.data.totalCredit);
  }
});
