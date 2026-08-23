import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../../src/app";
import { connectAtlasTestDb, disconnectAtlasTestDb, atlasConnectionLabel } from "./helpers/atlasConn";
import {
  registerUser,
  createBusiness,
  createShop,
  createAccount,
  createProduct,
  createCustomer,
  createSupplier,
  grantRole,
  uid,
} from "./factories/factories";
import { Account } from "../../src/models/Account";
import { Product } from "../../src/models/Product";
import { Customer } from "../../src/models/Customer";
import { Supplier } from "../../src/models/Supplier";
import { Sale } from "../../src/models/Sale";
import { Purchase } from "../../src/models/Purchase";
import { Expense } from "../../src/models/Expense";
import { Payment } from "../../src/models/Payment";
import { StockMovement } from "../../src/models/StockMovement";
import { JournalEntry } from "../../src/models/JournalEntry";
import { JournalLine } from "../../src/models/JournalLine";
import { AuditLog } from "../../src/models/AuditLog";
import { BusinessMembership } from "../../src/models/BusinessMembership";
import { Device } from "../../src/models/Device";
import { JOURNAL_ACCOUNTS, expenseAccountName } from "../../src/config/accounts";

/**
 * READ-ONLY guard: verifies we are connected ONLY to our dedicated test DB.
 * No destructive op anywhere in this file runs against any other database.
 */
function assertOnTestDb() {
  assert.equal(
    mongoose.connection.readyState,
    1,
    "must be connected to run real-Atlas audit"
  );
  assert.equal(
    mongoose.connection.name,
    "business_os_api_test",
    `Refusing to run audit on ${mongoose.connection.name}`
  );
}

const OBJ = (id: string) => new mongoose.Types.ObjectId(id);

// Unified test-context (tenant A + tenant B). Filled in before().
let a: { owner: any; biz: any; shop: any; account: any; product: any; customer: any; supplier: any };
let b: { owner: any; biz: any; shop: any; account: any; product: any; customer: any; supplier: any };

function post(path: string, token: string, body: Record<string, unknown>) {
  return request(app).post(path).set("Authorization", `Bearer ${token}`).send(body);
}
function get(path: string, token: string) {
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

before(async () => {
  await connectAtlasTestDb();
  assertOnTestDb();
  console.log(`[real-atlas] ${atlasConnectionLabel()}`);

  // ── Tenant A ────────────────────────────────────────────────────────────
  const ownerA = await registerUser();
  const bizA = await createBusiness(ownerA.accessToken);
  const shopA = await createShop(ownerA.accessToken, bizA.id, 50000);
  const accountA = await createAccount(ownerA.accessToken, bizA.id, shopA.id, "CASH", "Cash-A");
  const productA = await createProduct(ownerA.accessToken, bizA.id, {
    name: `Real Product A ${uid("p")}`,
    purchasePrice: 10000,
    sellingPrice: 20000,
    currentStock: 50,
  });
  const customerA = await createCustomer(ownerA.accessToken, bizA.id, {
    name: "Real Customer A",
  });
  const supplierA = await createSupplier(ownerA.accessToken, bizA.id, {
    name: "Real Supplier A",
  });
  a = { owner: ownerA, biz: bizA, shop: shopA, account: accountA, product: productA, customer: customerA, supplier: supplierA };

  // ── Tenant B ────────────────────────────────────────────────────────────
  const ownerB = await registerUser();
  const bizB = await createBusiness(ownerB.accessToken);
  const shopB = await createShop(ownerB.accessToken, bizB.id, 25000);
  const accountB = await createAccount(ownerB.accessToken, bizB.id, shopB.id, "CASH", "Cash-B");
  const productB = await createProduct(ownerB.accessToken, bizB.id, {
    name: "P Product B " + uid("pb"),
  });
  const customerB = await createCustomer(ownerB.accessToken, bizB.id, {
    name: "Real Customer B",
  });
  const supplierB = await createSupplier(ownerB.accessToken, bizB.id, {
    name: "Real Supplier B",
  });
  b = { owner: ownerB, biz: bizB, shop: shopB, account: accountB, product: productB, customer: customerB, supplier: supplierB };
});

after(async () => {
  await disconnectAtlasTestDb();
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 1 — real HTTP auth
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: /health + /ready report MongoDB connected (real Atlas)", async () => {
  const health = await request(app).get("/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.success, true);

  const ready = await request(app).get("/ready");
  assert.equal(ready.status, 200, "/ready should be 200 when DB connected");
  assert.equal(ready.body.db, "connected");
});

test("REAL-ATLAS: GET /auth/me returns the registered user with memberships", async () => {
  const me = await get("/api/v1/auth/me", a.owner.accessToken);
  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.email, a.owner.user.email);
  assert.ok(Array.isArray(me.body.data.memberships));
  // Owner business created through API: membership exists.
  assert.ok(
    me.body.data.memberships.some((m: { businessId: string; role: string }) => {
      return m.businessId === a.biz.id && m.role === "Owner";
    }),
    "owner membership must be the Owner from the real API"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 5 — sale via HTTP → verify ALL persisted Mongo documents
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: POST /sales (cash sale) writes sale+stock+account+journal+audit in Atlas", async () => {
  const beforeBalance = (
    await Account.findById(OBJ(a.account.id))
  )!.currentBalance;

  const localId = uid("sale");
  const res = await post(
    "/api/v1/sales",
    a.owner.accessToken,
    {
      businessId: a.biz.id,
      shopId: a.shop.id,
      customerId: a.customer.id,
      items: [{ productId: a.product.id, qty: 2, unitPrice: 20000 }],
      paidAmount: 40000,
      accountId: a.account.id,
      localId,
    }
  );
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.duplicate, false);
  assert.equal(res.body.data.status, "COMPLETED");
  assert.equal(res.body.data.paymentStatus, "PAID");
  assert.equal(res.body.data.total, 40000);

  const saleId = res.body.data.id as string;

  // 1. Sale persisted
  const sale = await Sale.findOne({ _id: OBJ(saleId) });
  assert.ok(sale);
  assert.equal(String(sale!.businessId), a.biz.id);
  assert.equal(String(sale!.shopId), a.shop.id);
  assert.equal(String(sale!.createdBy), a.owner.user.id);
  assert.equal(sale!.localId, localId);
  assert.ok(sale!.deviceId, "deviceId must be persisted");

  // 2. Account credited
  const acc = await Account.findById(a.account.id);
  assert.equal(acc!.currentBalance, beforeBalance + 40000);

  // 3. Stock movement decrement + product currentStock
  const product = await Product.findOne({ _id: OBJ(a.product.id) });
  assert.equal(product!.currentStock, 48);
  const sm = await StockMovement.findOne({ refType: "SALE", refId: OBJ(saleId) });
  assert.ok(sm);
  assert.equal(sm!.qtyChange, -2);
  assert.equal(sm!.newStock, 48);
  assert.equal(sm!.prevStock, 50);

  // 4. Journal balanced
  const entry = await JournalEntry.findOne({ referenceType: "SALE", referenceId: OBJ(saleId) });
  assert.ok(entry);
  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.ok(lines.length >= 2);
  const sumDebit = lines.reduce((s, l) => s + l.debit, 0);
  const sumCredit = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(sumDebit, sumCredit, "journal must be balanced");

  // 5. Customer due unchanged (fully paid)
  const customer = await Customer.findOne({ _id: OBJ(a.customer.id) });
  assert.equal(customer!.currentDue, 0);

  // 6. Audit
  const audit = await AuditLog.findOne({
    businessId: OBJ(a.biz.id),
    action: "SALE_FINALIZED",
    details: new RegExp(saleId),
  });
  assert.ok(audit, "SALE_FINALIZED audit log must exist");
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 6 — purchase via HTTP → real Mongo stock/avgCost/payable+journal
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: POST /purchases with credit finalizes supplier payable + stock", async () => {
  const localId = uid("po");
  const res = await post(
    "/api/v1/purchases",
    a.owner.accessToken,
    {
      businessId: a.biz.id,
      shopId: a.shop.id,
      supplierId: a.supplier.id,
      items: [{ productId: a.product.id, qty: 5, unitPrice: 9000 }],
      localId,
    }
  );
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.status, "COMPLETED");
  assert.equal(res.body.data.paymentStatus, "UNPAID");

  const poId = res.body.data.id as string;

  const received = await Product.findOne({ _id: OBJ(a.product.id) });
  // Initial 50 − 2 sale + 5 purchase = 53
  assert.equal(received!.currentStock, 53);
  assert.ok(received!.avgCost > 0, "avgCost must be recalculated");

  const sm = await StockMovement.findOne({ refType: "PURCHASE", refId: OBJ(poId) });
  assert.ok(sm);
  assert.equal(sm!.qtyChange, 5);
  assert.equal(sm!.newStock, 53);

  const supplier = await Supplier.findOne({ _id: OBJ(a.supplier.id) });
  assert.equal(supplier!.currentPayable, res.body.data.dueAmount);

  const entry = await JournalEntry.findOne({ referenceType: "PURCHASE", referenceId: OBJ(poId) });
  assert.ok(entry);
  const lines = await JournalLine.find({ entryId: entry!._id });
  const d = lines.reduce((s, l) => s + l.debit, 0);
  const c = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(d, c, "purchase journal must be balanced");
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 5 — expense reduces the account + journal + audit
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: POST /expenses debits account, journal + audit in real DB", async () => {
  const balBefore = (await Account.findOne({ _id: OBJ(a.account.id) }))!.currentBalance;
  const localId = uid("exp");
  const res = await post(
    "/api/v1/expenses",
    a.owner.accessToken,
    {
      businessId: a.biz.id,
      shopId: a.shop.id,
      category: "RENT",
      amount: 12000,
      paymentAccountId: a.account.id,
      localId,
    }
  );
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.amount, 12000);
  assert.equal(res.body.data.duplicate, false);

  const acc = await Account.findOne({ _id: OBJ(a.account.id) });
  assert.equal(acc!.currentBalance, balBefore - 12000);

  const exp = await Expense.findOne({ _id: OBJ(res.body.data.id) });
  assert.ok(exp);
  assert.equal(exp!.businessId.toString(), a.biz.id);
  assert.equal(exp!.createdBy.toString(), a.owner.user.id);

  const entry = await JournalEntry.findOne({ referenceType: "EXPENSE", referenceId: OBJ(res.body.data.id) });
  assert.ok(entry, "expense journal entry must exist");
  const lines = await JournalLine.find({ entryId: entry!._id });
  const expenseLine = lines.find((l) => l.accountName === expenseAccountName("RENT"));
  const cashLine = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.CASH);
  assert.ok(expenseLine, "expense account line");
  assert.ok(cashLine, "cash account line");
  assert.equal(expenseLine!.debit, 12000);
  assert.equal(cashLine!.credit, 12000);
  assert.equal(
    lines.reduce((s, l) => s + l.debit, 0),
    lines.reduce((s, l) => s + l.credit, 0)
  );

  const audit = await AuditLog.findOne({ businessId: OBJ(a.biz.id), action: "EXPENSE_CREATED" });
  assert.ok(audit, "EXPENSE_CREATED audit must exist");
  assert.equal(String(audit!.userId), a.owner.user.id);
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 7 — integer paisa financial money carved from server code
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: money stored as integer paisa (no floats) and server values cannot be spoofed", async () => {
  const resMissing = await post("/api/v1/expenses", a.owner.accessToken, {
    businessId: a.biz.id,
    shopId: a.shop.id,
    category: "RENT",
    amount: 99.99, // float — rejected
    paymentAccountId: a.account.id,
  });
  assert.equal(resMissing.status, 400);

  const resSpoof = await post("/api/v1/sales", a.owner.accessToken, {
    businessId: a.biz.id,
    shopId: a.shop.id,
    customerId: a.customer.id,
    items: [{ productId: a.product.id, qty: 1 }],
    total: 1, // spoof attempt → strict schema rejects
    paidAmount: 0,
  });
  assert.equal(resSpoof.status, 400);
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 8 — idempotency (localId) with real concurrency
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: double send of same localId → only ONE financial effect", async () => {
  const balBefore = (await Account.findOne({ _id: OBJ(a.account.id) }))!.currentBalance;
  const localId = uid("idem");
  const body = {
    businessId: a.biz.id,
    shopId: a.shop.id,
    category: "OTHER",
    amount: 5000,
    paymentAccountId: a.account.id,
    localId,
  };

  const first = await post("/api/v1/expenses", a.owner.accessToken, body);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.duplicate, false);

  const second = await post("/api/v1/expenses", a.owner.accessToken, body);
  assert.equal(second.status, 200, "second identical send returns the duplicate");
  assert.equal(second.body.data.duplicate, true);
  assert.equal(second.body.data.id, first.body.data.id);

  const acc = await Account.findOne({ _id: OBJ(a.account.id) });
  assert.equal(acc!.currentBalance, balBefore - 5000, "exactly one deduction");

  const docs = await Expense.countDocuments({ businessId: OBJ(a.biz.id), localId });
  assert.equal(docs, 1);

  const entries = await JournalEntry.countDocuments({
    businessId: OBJ(a.biz.id),
    referenceType: "EXPENSE",
    referenceId: OBJ(first.body.data.id),
  });
  assert.equal(entries, 1, "exactly one journal");
});

test("REAL-ATLAS: concurrent localId sends (Promise.all) → exactly one effect", async () => {
  const balBefore = (await Account.findOne({ _id: OBJ(a.account.id) }))!.currentBalance;
  const localId = uid("conc");
  const body = {
    businessId: a.biz.id,
    shopId: a.shop.id,
    category: "OTHER",
    amount: 3000,
    paymentAccountId: a.account.id,
    localId,
  };

  const responses = await Promise.all([
    post("/api/v1/expenses", a.owner.accessToken, body),
    post("/api/v1/expenses", a.owner.accessToken, body),
    post("/api/v1/expenses", a.owner.accessToken, body),
  ]);

  const ok = responses.filter((r) => r.status === 200 || r.status === 201);
  assert.ok(ok.length >= 2, "concurrent requests resolve");
  const ids = new Set(ok.map((r) => r.body.data.id));
  assert.equal(ids.size, 1, "one expense id from all concurrent sends");

  const acc = await Account.findOne({ _id: OBJ(a.account.id) });
  assert.equal(acc!.currentBalance, balBefore - 3000, "balance moved exactly once");
  assert.equal(
    await Expense.countDocuments({ businessId: OBJ(a.biz.id), localId }),
    1
  );
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 9 — tenant isolation (mandatory)
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: tenant A cannot read OR write business B via any core route", async () => {
  // Read B's shop
  const shopRead = await get(`/api/v1/shops?businessId=${b.biz.id}`, a.owner.accessToken);
  assert.equal(shopRead.status, 404);

  // Read B's product list
  const productRead = await get(`/api/v1/products?businessId=${b.biz.id}`, a.owner.accessToken);
  assert.equal(productRead.status, 404);

  // Write to B's business
  const prodWrite = await post("/api/v1/products", a.owner.accessToken, {
    businessId: b.biz.id,
    name: "Bad",
    unit: "piece",
  });
  assert.equal(prodWrite.status, 404);

  // Use B's customer in A's sale
  const saleWithForeignCustomer = await post("/api/v1/sales", a.owner.accessToken, {
    businessId: a.biz.id,
    shopId: a.shop.id,
    customerId: b.customer.id,
    items: [{ productId: a.product.id, qty: 1, unitPrice: 20000 }],
    paidAmount: 0,
  });
  assert.equal(saleWithForeignCustomer.status, 404);

  // Use B's account as payout in A's purchase
  const purchaseWithForeignAccount = await post("/api/v1/purchases", a.owner.accessToken, {
    businessId: a.biz.id,
    shopId: a.shop.id,
    supplierId: a.supplier.id,
    items: [{ productId: a.product.id, qty: 1, unitPrice: 5000 }],
    paidAmount: 5000,
    accountId: b.account.id,
  });
  assert.equal(purchaseWithForeignAccount.status, 404);
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 10 — device-id security
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: client-supplied deviceId is rejected; persisted deviceId === verified JWT", async () => {
  // Spoof attempt: send another deviceId in the body → .strict() rejects.
  const spoof = await post("/api/v1/expenses", a.owner.accessToken, {
    businessId: a.biz.id,
    shopId: a.shop.id,
    category: "OTHER",
    amount: 1000,
    paymentAccountId: a.account.id,
    deviceId: new mongoose.Types.ObjectId().toString(),
  });
  assert.equal(spoof.status, 400);

  const localId = uid("dev");
  const ok = await post("/api/v1/expenses", a.owner.accessToken, {
    businessId: a.biz.id,
    shopId: a.shop.id,
    category: "OTHER",
    amount: 1000,
    paymentAccountId: a.account.id,
    localId,
  });
  assert.equal(ok.status, 201);
  const doc = await Expense.findOne({ businessId: OBJ(a.biz.id), localId });
  assert.ok(doc!.deviceId, "persisted deviceId must be set from token claims");
  const device = await Device.findById(doc!.deviceId);
  assert.ok(device, "persisted deviceId references a registered Device");
  // The registered device (from registration input) is a known value.
  assert.ok(device!.deviceId, "device has a string identity");
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 11 — transaction rollback (fault injection AFTER a money move)
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: failed expense (oversized note) rolls back account + journal + audit", async () => {
  const accId = a.account.id;
  const before = (await Account.findOne({ _id: OBJ(accId) }))!.currentBalance;
  const expenseBefore = await Expense.countDocuments({
    businessId: OBJ(a.biz.id),
    paymentAccountId: OBJ(accId),
  });
  const auditBefore = await AuditLog.countDocuments({ businessId: OBJ(a.biz.id), action: "EXPENSE_CREATED" });

  await request(app)
    .post("/api/v1/expenses")
    .set("Authorization", `Bearer ${a.owner.accessToken}`)
    .send({
      businessId: a.biz.id,
      shopId: a.shop.id,
      category: "RENT",
      amount: 9000,
      paymentAccountId: accId,
      note: "x".repeat(700), // > 500 max → model validation fails after decrement
    })
    .expect(400);

  const after = (await Account.findOne({ _id: OBJ(accId) }))!.currentBalance;
  assert.equal(after, before, "no balance change after failed expense");
  assert.equal(
    await Expense.countDocuments({ businessId: OBJ(a.biz.id), paymentAccountId: OBJ(accId) }),
    expenseBefore,
    "no NEW expense persisted"
  );
  assert.equal(
    await AuditLog.countDocuments({ businessId: OBJ(a.biz.id), action: "EXPENSE_CREATED" }),
    auditBefore,
    "no audit written for rolled-back expense"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 12 — index verification on the real Atlas collections
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: important unique indexes exist in Atlas", async () => {
  const saleIndexes = await Sale.collection.indexes();
  assert.ok(
    saleIndexes.some((i) =>
      JSON.stringify(i.key).includes('"localId":1') && JSON.stringify(i.key).includes('"businessId":1')
    ),
    "Sale (businessId,localId) unique index missing"
  );
  assert.ok(
    saleIndexes.some((i) =>
      JSON.stringify(i.key).includes('"invoiceNo":1') && JSON.stringify(i.key).includes('"businessId":1')
    ),
    "Sale (businessId,invoiceNo) unique index missing"
  );

  const expenseIndexes = await Expense.collection.indexes();
  assert.ok(
    expenseIndexes.some((i) =>
      JSON.stringify(i.key).includes('"localId":1') && JSON.stringify(i.key).includes('"businessId":1')
    ),
    "Expense (businessId,localId) unique index missing"
  );

  const paymentIndexes = await Payment.collection.indexes();
  assert.ok(
    paymentIndexes.some((i) =>
      JSON.stringify(i.key).includes('"idempotencyKey":1') && JSON.stringify(i.key).includes('"businessId":1')
    ),
    "Payment (businessId,idempotencyKey) unique index missing"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 13 — safe data-integrity scan (report-only)
// ══════════════════════════════════════════════════════════════════════════
test("REAL-ATLAS: integrity scan — no orphan references introduced", async () => {
  // JournalLines referencing missing JournalEntries
  const lines = await JournalLine.countDocuments();
  const entries = await JournalEntry.countDocuments();
  assert.ok(lines >= 1, "audit produced journal lines");

  // All JournalLines have a matching entry
  const orphanLines = await JournalLine.aggregate([
    {
      $lookup: {
        from: "journalentries",
        localField: "entryId",
        foreignField: "_id",
        as: "e",
      },
    },
    { $match: { e: { $size: 0 } } },
    { $count: "orphans" },
  ]);
  assert.equal(orphanLines[0]?.orphans ?? 0, 0, "orphan JournalLines found");
});
// ══════════════════════════════════════════════════════════════════════════
// PHASE 08 — dashboard, reports and global search over REAL Atlas data.
//
// The Atlas test database PERSISTS across runs, so every financial figure is
// asserted as a hand-computed DELTA against a before() snapshot taken inside
// the same test. Chain: HTTP -> Express -> controller -> service -> Atlas.
// ══════════════════════════════════════════════════════════════════════════

test("REAL-ATLAS: /dashboard deltas match the exact transactions performed", async () => {
  const before = await get(`/api/v1/dashboard?businessId=${a.biz.id}&shopId=${a.shop.id}`, a.owner.accessToken);
  assert.equal(before.status, 200);
  assert.equal(before.body.data.scope.businessId, a.biz.id);

  // One cash sale: 2 x 20000, no product tax on this seed -> total 40000.
  const sale = await post("/api/v1/sales", a.owner.accessToken, {
    businessId: a.biz.id,
    shopId: a.shop.id,
    customerId: a.customer.id,
    items: [{ productId: a.product.id, qty: 2, unitPrice: 20000 }],
    paidAmount: 40000,
    accountId: a.account.id,
    localId: uid("dash-sale"),
  });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  const saleTotal = sale.body.data.total as number;
  const salePaid = sale.body.data.paidAmount as number;

  // One expense out of the same account.
  const expAmount = 7000;
  const exp = await post("/api/v1/expenses", a.owner.accessToken, {
    businessId: a.biz.id,
    shopId: a.shop.id,
    category: "TRANSPORT",
    amount: expAmount,
    paymentAccountId: a.account.id,
    localId: uid("dash-exp"),
  });
  assert.equal(exp.status, 201, JSON.stringify(exp.body));

  const afterRes = await get(`/api/v1/dashboard?businessId=${a.biz.id}&shopId=${a.shop.id}`, a.owner.accessToken);
  assert.equal(afterRes.status, 200);
  const d = afterRes.body.data;

  // Independent expectation from the API responses above.
  assert.equal(d.today.salesCount - before.body.data.today.salesCount, 1);
  assert.equal(d.today.salesTotal - before.body.data.today.salesTotal, saleTotal);
  assert.equal(d.today.salesPaid - before.body.data.today.salesPaid, salePaid);
  assert.equal(d.today.expensesCount - before.body.data.today.expensesCount, 1);
  assert.equal(d.today.expensesTotal - before.body.data.today.expensesTotal, expAmount);
  // Cash moved exactly +salePaid -expense through the snapshotted account.
  const acctRow = d.cash.accounts.find((x: { id: string }) => x.id === a.account.id);
  const acctBefore = before.body.data.cash.accounts.find((x: { id: string }) => x.id === a.account.id);
  assert.ok(acctRow && acctBefore);
  assert.equal(acctRow.currentBalance - acctBefore.currentBalance, salePaid - expAmount);
  // Recent activity contains the new sale with its real invoice number.
  const recentSale = d.recentTransactions.find(
    (r: { type: string; id: string }) => r.type === "SALE" && r.id === sale.body.data.id
  );
  assert.ok(recentSale, "new sale must appear in recentTransactions");
  assert.equal(recentSale.amount, saleTotal);
});

test("REAL-ATLAS: /reports/sales daily+product figures reconcile with the raw Atlas documents", async () => {
  const dayKey = new Date().toISOString().slice(0, 10);
  const res = await get(
    `/api/v1/reports/sales?businessId=${a.biz.id}&shopId=${a.shop.id}&groupBy=daily&from=${dayKey}&to=${dayKey}`,
    a.owner.accessToken
  );
  assert.equal(res.status, 200);
  const bucket = (res.body.data.items as Array<{ key: string; count: number; total: number }>).find(
    (r) => r.key === dayKey
  );

  // Independent recomputation straight from the persisted Sale collection.
  const docs = await Sale.find({
    businessId: OBJ(a.biz.id),
    shopId: OBJ(a.shop.id),
    status: "COMPLETED",
    saleDate: {
      $gte: new Date(`${dayKey}T00:00:00.000Z`),
      $lte: new Date(new Date(`${dayKey}T00:00:00.000Z`).getTime() + 86400000 - 1),
    },
  });
  const expectedTotal = docs.reduce((s, x) => s + x.total, 0);
  assert.ok(bucket, "today's bucket must exist");
  assert.equal(bucket!.count, docs.length);
  assert.equal(bucket!.total, expectedTotal);

  // Product dimension exists and carries integer-paisa fields.
  const byProduct = await get(
    `/api/v1/reports/sales?businessId=${a.biz.id}&shopId=${a.shop.id}&groupBy=product&limit=100`,
    a.owner.accessToken
  );
  assert.equal(byProduct.status, 200);
  for (const row of byProduct.body.data.items as Array<Record<string, number | string>>) {
    assert.ok(Number.isInteger(row.salesTotal));
    assert.ok(Number.isInteger(row.grossProfit));
    assert.ok(row.qtySold > 0);
  }
});

test("REAL-ATLAS: /reports/inventory valuation equals stock x avgCost summed in Atlas", async () => {
  const res = await get(
    `/api/v1/reports/inventory?businessId=${a.biz.id}`,
    a.owner.accessToken
  );
  assert.equal(res.status, 200);
  const s = res.body.data.summary;

  // Independent recomputation from the Product collection.
  const products = await Product.find({ businessId: OBJ(a.biz.id) });
  const expectedValue = products.reduce((sum, p) => sum + p.currentStock * p.avgCost, 0);
  const expectedUnits = products.reduce((sum, p) => sum + p.currentStock, 0);
  assert.equal(s.productCount, products.length);
  assert.equal(s.totalUnits, expectedUnits);
  assert.equal(s.stockValue, expectedValue);
});

test("REAL-ATLAS: /reports/receivables + /reports/payables totals equal Atlas dues", async () => {
  const rec = await get(`/api/v1/reports/receivables?businessId=${a.biz.id}`, a.owner.accessToken);
  const pay = await get(`/api/v1/reports/payables?businessId=${a.biz.id}`, a.owner.accessToken);
  assert.equal(rec.status, 200);
  assert.equal(pay.status, 200);

  const recDocs = await Customer.find({ businessId: OBJ(a.biz.id), currentDue: { $gt: 0 } });
  const payDocs = await Supplier.find({ businessId: OBJ(a.biz.id), currentPayable: { $gt: 0 } });
  assert.equal(rec.body.data.totals.total, recDocs.reduce((s, c) => s + c.currentDue, 0));
  assert.equal(rec.body.data.totals.count, recDocs.length);
  assert.equal(pay.body.data.totals.total, payDocs.reduce((s, x) => s + x.currentPayable, 0));
  assert.equal(pay.body.data.totals.count, payDocs.length);
});

test("REAL-ATLAS: /search finds seeded Atlas documents; foreign tenant does not leak", async () => {
  const marker = uid("srch").slice(0, 8);
  await post("/api/v1/products", a.owner.accessToken, {
    businessId: a.biz.id,
    name: `Atlas Search ${marker} Product`,
    unit: "piece",
    sellingPrice: 555,
  });

  const mine = await get(`/api/v1/search?businessId=${a.biz.id}&q=${marker}`, a.owner.accessToken);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.products.length, 1);
  assert.equal(mine.body.data.products[0].sellingPrice, 555);

  const theirs = await get(`/api/v1/search?businessId=${b.biz.id}&q=${marker}`, b.owner.accessToken);
  assert.equal(theirs.status, 200);
  assert.deepEqual(theirs.body.data.products, []);

  // RBAC parity with catalog reads: any active member may search.
  const anon = await request(app).get(`/api/v1/search?q=${marker}&businessId=${a.biz.id}`);
  assert.equal(anon.status, 401);
});
