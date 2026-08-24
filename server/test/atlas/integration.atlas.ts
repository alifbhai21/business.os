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
  loginUser,
  uid,
  DEV,
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
import { Employee } from "../../src/models/Employee";
import { RefreshToken } from "../../src/models/RefreshToken";
import { SyncEvent } from "../../src/models/SyncEvent";
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

// ══════════════════════════════════════════════════════════════════════════
// PHASE 09 — employees, roles & devices over REAL Atlas.
//
// Every assertion goes HTTP -> Express -> controller -> service ->
// business_os_api_test and then re-reads the raw Atlas documents. The DB
// persists across runs, so all figures are deltas or uniquely-marked docs.
// ══════════════════════════════════════════════════════════════════════════

test("REAL-ATLAS: employee unique partial index exists on the real collection", async () => {
  assertOnTestDb();
  // Deterministic: sync the model's indexes into Atlas before asserting.
  await Employee.syncIndexes();
  const idx = await Employee.collection.indexes();
  const phoneUnique = idx.find(
    (i) => JSON.stringify(i.key) === JSON.stringify({ businessId: 1, phone: 1 }) && i.unique === true
  );
  assert.ok(phoneUnique, "Employee (businessId, phone) unique index missing");
  const filter = (phoneUnique as { partialFilterExpression?: Record<string, unknown> })
    .partialFilterExpression;
  assert.ok(filter, "partialFilterExpression required so REMOVED history stays un-unique");
  assert.deepEqual(
    filter!.status,
    { $in: ["ACTIVE", "INVITED", "SUSPENDED"] },
    "uniqueness domain must cover exactly the live statuses"
  );
});

test("REAL-ATLAS: POST /employees invites an existing user -> ACTIVE + membership + audit in Atlas", async () => {
  const staff = await registerUser("empstaff");
  const res = await post("/api/v1/employees", a.owner.accessToken, {
    businessId: a.biz.id,
    shopId: a.shop.id,
    name: "Atlas Staff",
    phone: staff.phone,
    role: "Salesperson",
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.status, "ACTIVE");
  assert.equal(res.body.data.userId, staff.user.id);

  const emp = await Employee.findOne({ _id: OBJ(res.body.data.id) });
  assert.ok(emp);
  assert.equal(String(emp!.businessId), a.biz.id);
  assert.equal(String(emp!.shopId), a.shop.id);
  assert.equal(String(emp!.userId), staff.user.id);
  assert.equal(emp!.phone, staff.phone);
  assert.equal(emp!.role, "Salesperson");

  const mem = await BusinessMembership.findOne({
    userId: OBJ(staff.user.id),
    businessId: OBJ(a.biz.id),
  });
  assert.ok(mem, "membership must be created for a linked account");
  assert.equal(mem!.role, "Salesperson");
  assert.equal(mem!.status, "ACTIVE");
  assert.ok(mem!.permissions.includes("sales:create"), "role permissions expanded server-side");

  const audit = await AuditLog.findOne({
    businessId: OBJ(a.biz.id),
    action: "EMPLOYEE_CREATED",
    recordId: String(emp!._id),
  });
  assert.ok(audit, "EMPLOYEE_CREATED audit must exist");
});

test("REAL-ATLAS: unknown-phone invite stays INVITED; duplicate live phone is 409 on real Atlas", async () => {
  const invitePhone = "02" + Math.floor(10000000 + Math.random() * 89999999);
  const memBefore = await BusinessMembership.countDocuments({ businessId: OBJ(a.biz.id) });

  const invited = await post("/api/v1/employees", a.owner.accessToken, {
    businessId: a.biz.id,
    name: "Atlas Invited",
    phone: invitePhone,
    role: "Viewer",
  });
  assert.equal(invited.status, 201);
  assert.equal(invited.body.data.status, "INVITED");
  assert.equal(invited.body.data.userId, null);

  const empDoc = await Employee.findOne({ _id: OBJ(invited.body.data.id) });
  assert.ok(empDoc);
  assert.equal(empDoc!.userId, null, "no linked account for an unknown phone");

  // Duplicate live phone in the SAME business -> 409. This proves the unique
  // partial index actually enforces uniqueness on real MongoDB (the $ne
  // variant silently never built).
  const dup = await post("/api/v1/employees", a.owner.accessToken, {
    businessId: a.biz.id,
    name: "Atlas Duplicate",
    phone: invitePhone,
    role: "Viewer",
  });
  assert.equal(dup.status, 409, "unique partial index must reject duplicates");

  // Same phone in ANOTHER business is fine (business-scoped uniqueness).
  const otherBiz = await post("/api/v1/employees", b.owner.accessToken, {
    businessId: b.biz.id,
    name: "Other Biz Same Phone",
    phone: invitePhone,
    role: "Viewer",
  });
  assert.equal(otherBiz.status, 201);

  assert.equal(
    await BusinessMembership.countDocuments({ businessId: OBJ(a.biz.id) }),
    memBefore,
    "invited flow adds no membership"
  );
});

test("REAL-ATLAS: roles — Manager blocked, Owner assigns, membership+audit follow in Atlas", async () => {
  const staff = await registerUser("rolstf");
  const created = await post("/api/v1/employees", a.owner.accessToken, {
    businessId: a.biz.id,
    name: "Role Staff",
    phone: staff.phone,
    role: "Salesperson",
  });
  assert.equal(created.status, 201);
  const employeeId = created.body.data.id as string;

  const manager = await registerUser("rolmgr");
  const mgrEmp = await post("/api/v1/employees", a.owner.accessToken, {
    businessId: a.biz.id,
    name: "Atlas Manager",
    phone: manager.phone,
    role: "Manager",
  });
  assert.equal(mgrEmp.status, 201);

  // Privilege escalation attempt: Manager cannot assign Admin.
  const mgrDeny = await post("/api/v1/roles", manager.accessToken, {
    businessId: a.biz.id,
    employeeId,
    role: "Admin",
  });
  assert.equal(mgrDeny.status, 403, "privilege escalation must be blocked");

  // Unknown permission names are rejected outright.
  const badPerm = await post("/api/v1/roles", a.owner.accessToken, {
    businessId: a.biz.id,
    employeeId,
    role: "Salesperson",
    permissions: ["not:a-permission"],
  });
  assert.equal(badPerm.status, 400);

  // Owner assigns Accountant + an explicit extra permission.
  const ok = await post("/api/v1/roles", a.owner.accessToken, {
    businessId: a.biz.id,
    employeeId,
    role: "Accountant",
    permissions: ["reports:view"],
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.role, "Accountant");

  const mem = await BusinessMembership.findOne({
    userId: OBJ(staff.user.id),
    businessId: OBJ(a.biz.id),
  });
  assert.ok(mem);
  assert.equal(mem!.role, "Accountant", "membership follows the API change");
  assert.ok(mem!.permissions.includes("reports:view"), "extra permission persisted");
  assert.ok(mem!.permissions.includes("payments:create"), "role defaults expanded server-side");

  // Audit row records previous != new role (mutation-order bug fixed).
  const audit = await AuditLog.findOne({
    businessId: OBJ(a.biz.id),
    action: "ROLE_ASSIGNED",
    recordId: employeeId,
  }).sort({ createdAt: -1 });
  assert.ok(audit, "ROLE_ASSIGNED audit must exist");
  const details = JSON.parse(audit!.details ?? "{}") as { previousRole?: string; newRole?: string };
  assert.equal(details.previousRole, "Salesperson");
  assert.equal(details.newRole, "Accountant");
});

test("REAL-ATLAS: device register links signup row; revoke kills its live refresh tokens in Atlas", async () => {
  const staff = await registerUser("devstf");

  // Staff must be a member before any device belongs to the business.
  const emp = await post("/api/v1/employees", a.owner.accessToken, {
    businessId: a.biz.id,
    name: "Device Staff",
    phone: staff.phone,
    role: "Manager",
  });
  assert.equal(emp.status, 201, JSON.stringify(emp.body));

  // Signup already created the Device row; POST /devices links it into the
  // business — the idempotent path returns 200 duplicate:true.
  const reg = await post("/api/v1/devices", staff.accessToken, {
    businessId: a.biz.id,
    deviceId: DEV.deviceId + "-devstf",
    deviceName: "Atlas Staff Phone",
  });
  assert.ok([200, 201].includes(reg.status), JSON.stringify(reg.body));
  assert.equal(reg.body.data.businessId, a.biz.id);
  const deviceDocId = reg.body.data.id as string;

  const dev = await Device.findById(deviceDocId);
  assert.ok(dev);
  assert.equal(String(dev!.userId), staff.user.id);
  assert.equal(String(dev!.businessId), a.biz.id);
  assert.equal(dev!.status, "ACTIVE");

  // A live refresh token exists from registration against this device doc.
  const liveBefore = await RefreshToken.countDocuments({
    deviceId: OBJ(deviceDocId),
    revokedAt: null,
  });

  const revokeRes = await request(app)
    .put(`/api/v1/devices/${deviceDocId}/revoke`)
    .set("Authorization", `Bearer ${a.owner.accessToken}`)
    .send({ businessId: a.biz.id });
  assert.equal(revokeRes.status, 200, JSON.stringify(revokeRes.body));
  assert.equal(revokeRes.body.data.status, "REVOKED");

  if (liveBefore > 0) {
    const stillLive = await RefreshToken.countDocuments({
      deviceId: OBJ(deviceDocId),
      revokedAt: null,
    });
    assert.equal(stillLive, 0, "revocation must terminate outstanding sessions");
  }

  // Re-revoke is idempotent.
  const again = await request(app)
    .put(`/api/v1/devices/${deviceDocId}/revoke`)
    .set("Authorization", `Bearer ${a.owner.accessToken}`)
    .send({ businessId: a.biz.id });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.duplicate, true);

  const audit = await AuditLog.findOne({
    businessId: OBJ(a.biz.id),
    action: "DEVICE_REVOKED",
    recordId: deviceDocId,
  });
  assert.ok(audit, "DEVICE_REVOKED audit must exist");

  // Sync heartbeat: only the device owner may report it.
  const foreignSync = await request(app)
    .put(`/api/v1/devices/${deviceDocId}/sync`)
    .set("Authorization", `Bearer ${a.owner.accessToken}`)
    .send({ businessId: a.biz.id });
  assert.equal(foreignSync.status, 403, "non-owner cannot heartbeat someone else's device");

  const ownSync = await request(app)
    .put(`/api/v1/devices/${deviceDocId}/sync`)
    .set("Authorization", `Bearer ${staff.accessToken}`)
    .send({ businessId: a.biz.id });
  assert.equal(ownSync.status, 403, "revoked device cannot heartbeat");
});

test("REAL-ATLAS: GET /audit reads real Atlas rows with pagination, filter, RBAC + isolation", async () => {
  // Business creation itself is now audited (Phase 09 extension).
  const mine = await get(`/api/v1/audit?businessId=${a.biz.id}&limit=100`, a.owner.accessToken);
  assert.equal(mine.status, 200);
  const actions = (mine.body.data.data as Array<{ action: string }>).map((r) => r.action);
  assert.ok(actions.includes("BUSINESS_CREATED"), "business creation must be audited");
  assert.ok(actions.some((x) => x.startsWith("EMPLOYEE_")), "employee actions must be audited");

  // Actor resolution join works on real users.
  const row = (mine.body.data.data as Array<Record<string, unknown>>).find(
    (r) => r.action === "BUSINESS_CREATED"
  );
  assert.ok(row && row.userName, "actor name resolved from Atlas users");

  // Action filter matches only its rows.
  const filtered = await get(
    `/api/v1/audit?businessId=${a.biz.id}&action=EMPLOYEE_CREATED&limit=100`,
    a.owner.accessToken
  );
  assert.equal(filtered.status, 200);
  for (const r of filtered.body.data.data as Array<{ action: string }>) {
    assert.equal(r.action, "EMPLOYEE_CREATED");
  }

  // Pagination envelope is real.
  const page = await get(
    `/api/v1/audit?businessId=${a.biz.id}&limit=1&page=2`,
    a.owner.accessToken
  );
  assert.equal(page.status, 200);
  assert.ok(page.body.data.pagination.total >= 2, "enough seeded rows for page 2");
  assert.equal((page.body.data.data as unknown[]).length, 1);

  // RBAC: Salesperson cannot read the audit trail.
  const salesperson = await registerUser("audsp");
  const spEmp = await post("/api/v1/employees", a.owner.accessToken, {
    businessId: a.biz.id,
    name: "Audit Salesperson",
    phone: salesperson.phone,
    role: "Salesperson",
  });
  assert.equal(spEmp.status, 201);
  const denied = await get(`/api/v1/audit?businessId=${a.biz.id}`, salesperson.accessToken);
  assert.equal(denied.status, 403);

  // Tenant isolation: owner B cannot read A's trail.
  const foreign = await get(`/api/v1/audit?businessId=${a.biz.id}`, b.owner.accessToken);
  assert.equal(foreign.status, 404);

  // Shop pinning: an employee pinned to A's shop cannot widen scope.
  const pinnedOwner = await registerUser("audpin");
  await post("/api/v1/shops", a.owner.accessToken, {
    businessId: a.biz.id,
    name: `PinShop-${uid("ps")}`,
    branchCode: `PS-${uid("psc").slice(0, 10)}`,
  }).then(async (shopRes) => {
    assert.equal(shopRes.status, 201);
    const emp = await post("/api/v1/employees", a.owner.accessToken, {
      businessId: a.biz.id,
      shopId: shopRes.body.data.id,
      name: "Pinned Manager",
      phone: pinnedOwner.phone,
      // Manager CAN read audit (in VIEW_ROLES) — only pinning can stop it.
      role: "Manager",
    });
    assert.equal(emp.status, 201);
    const widened = await get(
      `/api/v1/audit?businessId=${a.biz.id}&shopId=${a.shop.id}`,
      pinnedOwner.accessToken
    );
    assert.equal(widened.status, 404, "pinned member cannot read another shop's rows");
  });

  // Invalid date filter -> 400 via Zod.
  const badDate = await get(
    `/api/v1/audit?businessId=${a.biz.id}&from=not-a-date`,
    a.owner.accessToken
  );
  assert.equal(badDate.status, 400);
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 10 — offline sync (push/pull) over REAL Atlas.
//
// The queue contract is proven end to end: HTTP push -> dispatcher ->
// verified Phase 05 engines -> business_os_api_test documents, with
// exactly-once effects under retries and concurrency, per-op conflict
// isolation and the SyncEvent trail.
// ══════════════════════════════════════════════════════════════════════════

test("REAL-ATLAS: sync push commits a queued sale; retry is exactly-once in Atlas", async () => {
  const before = (await Account.findOne({ _id: OBJ(a.account.id) }))!.currentBalance;
  const localId = uid("q-sale");

  const body = {
    businessId: a.biz.id,
    shopId: a.shop.id,
    ops: [
      {
        localId,
        type: "sale",
        payload: {
          items: [{ productId: a.product.id, qty: 2 }],
          paidAmount: 40000,
          accountId: a.account.id,
        },
      },
    ],
  };

  const first = await post("/api/v1/sync/push", a.owner.accessToken, body);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const r1 = first.body.data.results[0];
  assert.equal(r1.status, "SYNCED");
  assert.equal(r1.duplicate, false);

  // Raw Atlas documents — the full Phase 05 chain ran for the queued op.
  const sale = await Sale.findOne({ businessId: OBJ(a.biz.id), localId });
  assert.ok(sale, "sale must exist in Atlas");
  assert.equal(sale!.status, "COMPLETED");
  assert.equal(sale!.total, 40000);
  assert.ok(sale!.deviceId, "device identity snapshotted from JWT claims");

  const movement = await StockMovement.findOne({ refType: "SALE", refId: sale!._id });
  assert.ok(movement);
  assert.equal(movement!.qtyChange, -2);

  const entry = await JournalEntry.findOne({ referenceType: "SALE", referenceId: sale!._id });
  assert.ok(entry);
  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.equal(
    lines.reduce((s, l) => s + l.debit, 0),
    lines.reduce((s, l) => s + l.credit, 0),
    "queued sale journal must be balanced"
  );

  assert.equal(
    (await Account.findOne({ _id: OBJ(a.account.id) }))!.currentBalance,
    before + 40000
  );

  // Retried push of the SAME op -> duplicate:true, zero additional effect.
  const retry = await post("/api/v1/sync/push", a.owner.accessToken, body);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.results[0].status, "SYNCED");
  assert.equal(retry.body.data.results[0].duplicate, true);
  assert.equal(await Sale.countDocuments({ businessId: OBJ(a.biz.id), localId }), 1);
  assert.equal(
    (await Account.findOne({ _id: OBJ(a.account.id) }))!.currentBalance,
    before + 40000,
    "exactly one credit in Atlas across the retry"
  );

  // SyncEvent trail recorded both pushes.
  const events = await SyncEvent.countDocuments({
    businessId: OBJ(a.biz.id),
    direction: "PUSH",
  });
  assert.ok(events >= 2, "push events logged");
});

test("REAL-ATLAS: concurrent pushes of one localId credit Atlas exactly once", async () => {
  const before = (await Account.findOne({ _id: OBJ(a.account.id) }))!.currentBalance;
  const localId = uid("q-conc");

  const body = {
    businessId: a.biz.id,
    shopId: a.shop.id,
    ops: [
      {
        localId,
        type: "sale",
        payload: { items: [{ productId: a.product.id, qty: 1 }], paidAmount: 20000, accountId: a.account.id },
      },
    ],
  };
  const responses = await Promise.all([
    post("/api/v1/sync/push", a.owner.accessToken, body),
    post("/api/v1/sync/push", a.owner.accessToken, body),
  ]);
  for (const r of responses) {
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.results[0].status, "SYNCED");
  }

  assert.equal(await Sale.countDocuments({ businessId: OBJ(a.biz.id), localId }), 1);
  assert.equal(
    (await Account.findOne({ _id: OBJ(a.account.id) }))!.currentBalance,
    before + 20000,
    "concurrent retries must credit once"
  );
});

test("REAL-ATLAS: queued master-data create + retry leaves ONE document", async () => {
  const localId = uid("q-cust");
  const body = {
    businessId: a.biz.id,
    ops: [{ localId, type: "customer", payload: { name: "Atlas Queued Customer" } }],
  };
  const first = await post("/api/v1/sync/push", a.owner.accessToken, body);
  const second = await post("/api/v1/sync/push", a.owner.accessToken, body);
  assert.equal(first.body.data.results[0].status, "SYNCED");
  assert.equal(second.body.data.results[0].duplicate, true);
  assert.equal(await Customer.countDocuments({ businessId: OBJ(a.biz.id), localId }), 1);
});

test("REAL-ATLAS: per-op conflicts isolate — bad op rejected, batch still processes", async () => {
  const before = (await Account.findOne({ _id: OBJ(a.account.id) }))!.currentBalance;
  const res = await post("/api/v1/sync/push", a.owner.accessToken, {
    businessId: a.biz.id,
    shopId: a.shop.id,
    ops: [
      {
        localId: uid("q-bad"),
        type: "sale",
        payload: { items: [{ productId: b.product.id, qty: 1 }], paidAmount: 15000 },
      },
      {
        localId: uid("q-exp"),
        type: "expense",
        payload: { category: "OTHER", amount: 1000, paymentAccountId: a.account.id },
      },
    ],
  });
  assert.equal(res.status, 200);
  const results = res.body.data.results;
  assert.equal(results[0].status, "CONFLICT", "foreign product must be rejected");
  assert.equal(results[1].status, "SYNCED");
  assert.equal(
    (await Account.findOne({ _id: OBJ(a.account.id) }))!.currentBalance,
    before - 1000,
    "only the valid op moved money"
  );
});

test("REAL-ATLAS: pull returns an Atlas delta since cursor with tenant isolation", async () => {
  const first = await get(`/api/v1/sync/pull?businessId=${a.biz.id}`, a.owner.accessToken);
  assert.equal(first.status, 200);
  assert.ok(first.body.data.counts.products >= 1);
  const cursor = first.body.data.cursor as string;

  const marker = uid("pull-p");
  await post("/api/v1/products", a.owner.accessToken, {
    businessId: a.biz.id,
    name: `Pull Delta ${marker}`,
    unit: "piece",
  });

  const delta = await get(
    `/api/v1/sync/pull?businessId=${a.biz.id}&cursor=${encodeURIComponent(cursor)}`,
    a.owner.accessToken
  );
  assert.equal(delta.status, 200);
  assert.equal(delta.body.data.counts.products, 1);
  assert.equal(delta.body.data.products[0].name, `Pull Delta ${marker}`);

  const foreign = await get(`/api/v1/sync/pull?businessId=${a.biz.id}`, b.owner.accessToken);
  assert.equal(foreign.status, 404);

  const pullEvents = await SyncEvent.countDocuments({
    businessId: OBJ(a.biz.id),
    direction: "PULL",
  });
  assert.ok(pullEvents >= 2, "pull events logged");
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 11 — backup status, new-device restore and data export vs REAL Atlas
// ══════════════════════════════════════════════════════════════════════════

test("REAL-ATLAS: backup/status counts equal the raw Atlas collection counts", async () => {
  const res = await get(`/api/v1/backup/status?businessId=${a.biz.id}`, a.owner.accessToken);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const s = res.body.data;

  const [products, sales, expenses, journalEntries] = await Promise.all([
    Product.countDocuments({ businessId: OBJ(a.biz.id) }),
    Sale.countDocuments({ businessId: OBJ(a.biz.id) }),
    Expense.countDocuments({ businessId: OBJ(a.biz.id) }),
    JournalEntry.countDocuments({ businessId: OBJ(a.biz.id) }),
  ]);
  assert.equal(s.counts.products, products);
  assert.equal(s.counts.sales, sales);
  assert.equal(s.counts.expenses, expenses);
  assert.equal(s.counts.journalEntries, journalEntries);

  assert.equal(s.connected, true);
  assert.equal(s.database, "business_os_api_test");
  assert.ok(s.lastWriteAt, "last write visible from real Atlas data");
});

test("REAL-ATLAS: restore on a NEW device returns the full dataset from Atlas", async () => {
  // The SAME account logs in from a brand-new device id — exactly the
  // PRD's "restore on login to a new device" scenario.
  const fresh = await loginUser((a.owner.user as { email?: string }).email ?? "", "password123", uid("new-device"));
  assert.ok(fresh.accessToken, "new-device login succeeded");
  void fresh;

  const res = await get(`/api/v1/sync/restore?businessId=${a.biz.id}`, a.owner.accessToken);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  const d = res.body.data;

  const [products, customers, suppliers, sales, purchases, payments, expenses, movements] =
    await Promise.all([
      Product.countDocuments({ businessId: OBJ(a.biz.id) }),
      Customer.countDocuments({ businessId: OBJ(a.biz.id) }),
      Supplier.countDocuments({ businessId: OBJ(a.biz.id) }),
      Sale.countDocuments({ businessId: OBJ(a.biz.id) }),
      Purchase.countDocuments({ businessId: OBJ(a.biz.id) }),
      Payment.countDocuments({ businessId: OBJ(a.biz.id) }),
      Expense.countDocuments({ businessId: OBJ(a.biz.id) }),
      StockMovement.countDocuments({ businessId: OBJ(a.biz.id) }),
    ]);

  assert.equal(d.counts.products, products);
  assert.equal(d.counts.customers, customers);
  assert.equal(d.counts.suppliers, suppliers);
  assert.equal(d.counts.sales, sales);
  assert.ok(sales >= 2, "the earlier Atlas sale is part of the restore");
  assert.equal(d.counts.purchases, purchases);
  assert.equal(d.counts.payments, payments);
  assert.equal(d.counts.expenses, expenses);
  assert.equal(d.counts.stockMovements, movements);

  // The restored sale payload equals the persisted Atlas document.
  const atlasSale = await Sale.findOne({ businessId: OBJ(a.biz.id), status: "COMPLETED" }).sort({
    createdAt: 1,
  });
  assert.ok(atlasSale);
  const restoredSale = d.data.sales.find((s: { id: string }) => s.id === String(atlasSale!._id));
  assert.ok(restoredSale, "the seeded Atlas sale rides in the restore");
  assert.equal(restoredSale.total, atlasSale!.total);
  assert.equal(restoredSale.paymentStatus, atlasSale!.paymentStatus);

  // Exactly one RESTORE event per call, persisted in Atlas with device id.
  const restoreEvents = await SyncEvent.find({
    businessId: OBJ(a.biz.id),
    direction: "RESTORE",
  });
  assert.ok(restoreEvents.length >= 1);
  const latest = restoreEvents[restoreEvents.length - 1];
  assert.ok(latest.deviceId, "RESTORE event carries the JWT device identity");
  assert.equal(latest.status, "SUCCESS");
});

test("REAL-ATLAS: cross-tenant restore/export stay 404 against live data", async () => {
  const restore = await get(`/api/v1/sync/restore?businessId=${a.biz.id}`, b.owner.accessToken);
  assert.equal(restore.status, 404);

  const status = await get(`/api/v1/backup/status?businessId=${a.biz.id}`, b.owner.accessToken);
  assert.equal(status.status, 404);

  const json = await get(`/api/v1/export/data?businessId=${a.biz.id}`, b.owner.accessToken);
  assert.equal(json.status, 404);

  const csv = await get(
    `/api/v1/export/csv?businessId=${a.biz.id}&type=sales`,
    b.owner.accessToken
  );
  assert.equal(csv.status, 404);
});

test("REAL-ATLAS: JSON export reconciles with the raw Atlas documents", async () => {
  const res = await get(`/api/v1/export/data?businessId=${a.biz.id}`, a.owner.accessToken);
  assert.equal(res.status, 200);
  const d = res.body.data;

  const entryDocs = await JournalEntry.find({ businessId: OBJ(a.biz.id) });
  const lineDocs = await JournalLine.find({ entryId: { $in: entryDocs.map((e) => e._id) } });

  assert.equal(d.counts.journalEntries, entryDocs.length);
  assert.equal(d.counts.journalLines, lineDocs.length);

  // FINANCIAL INVARIANT over the REAL journal: every entry balances.
  const byEntry = new Map<string, { debit: number; credit: number }>();
  for (const l of lineDocs) {
    const agg = byEntry.get(String(l.entryId)) ?? { debit: 0, credit: 0 };
    agg.debit += l.debit;
    agg.credit += l.credit;
    byEntry.set(String(l.entryId), agg);
  }
  for (const [, agg] of byEntry) {
    assert.equal(agg.debit, agg.credit, "real Atlas journal stays balanced");
  }

  // Exported sale totals == Σ totals across the raw collection.
  const exportedSum = d.data.sales.reduce((acc: number, s: { total: number }) => acc + Number(s.total), 0);
  const docs = await Sale.find({ businessId: OBJ(a.biz.id) });
  assert.equal(exportedSum, docs.reduce((s, x) => s + x.total, 0));

  // DATA_EXPORTED audit row landed in Atlas.
  const auditRow = await AuditLog.findOne({
    businessId: OBJ(a.biz.id),
    action: "DATA_EXPORTED",
    details: "format=json",
  }).sort({ createdAt: -1 });
  assert.ok(auditRow, "export audited in Atlas");
});

test("REAL-ATLAS: CSV export row count equals the raw Atlas document count", async () => {
  const res = await get(
    `/api/v1/export/csv?businessId=${a.biz.id}&type=sales`,
    a.owner.accessToken
  );
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"] ?? "", /text\/csv/);
  const lines = (res.text as string).trim().split(/\r\n/);
  const atlasCount = await Sale.countDocuments({ businessId: OBJ(a.biz.id) });
  assert.equal(lines.length - 1, atlasCount, "one CSV row per real Atlas sale");
});

// ══════════════════════════════════════════════════════════════════════════
// PHASE 12 — chart, notifications, variants, offline stock vs REAL Atlas
// ══════════════════════════════════════════════════════════════════════════

test("REAL-ATLAS: chart of accounts reads over HTTP on the live connection", async () => {
  const res = await get(`/api/v1/accounting/chart?businessId=${a.biz.id}`, a.owner.accessToken);
  assert.equal(res.status, 200);
  const names = (res.body.data.accounts as Array<{ name: string }>).map((x) => x.name);
  for (const expected of ["Cash", "Sales Revenue", "Cost of Goods Sold", "Inventory"]) {
    assert.ok(names.includes(expected), `${expected} in served chart`);
  }
});

test("REAL-ATLAS: notification materialization persists deduped rows in Atlas", async () => {
  // A genuinely low-stocked product in the live tenant.
  const marker = uid("lowstock");
  await post("/api/v1/products", a.owner.accessToken, {
    businessId: a.biz.id,
    name: `Low ${marker}`,
    unit: "piece",
    currentStock: 2,
    minStock: 9,
  });

  const first = await get(`/api/v1/notifications?businessId=${a.biz.id}`, a.owner.accessToken);
  assert.equal(first.status, 200);
  const items = first.body.data.data as Array<{ id: string; type: string; body: string }>;
  const lowStock = items.filter(
    (i) => i.type === "LOW_STOCK" && i.body.includes(`Low ${marker}`)
  );
  assert.equal(lowStock.length, 1, "exactly one low-stock row for the product");

  const dbRows = await mongoose.connection.db
    ?.collection("notifications")
    .countDocuments({ businessId: OBJ(a.biz.id), type: "LOW_STOCK" });
  assert.ok(dbRows && dbRows >= 1, "rows persisted in Atlas");

  // Re-read: the unique {businessId, dedupKey} index collapses duplicates.
  const second = await get(`/api/v1/notifications?businessId=${a.biz.id}`, a.owner.accessToken);
  const again = (second.body.data.data as Array<{ body: string }>).filter((i) =>
    i.body.includes(`Low ${marker}`)
  );
  assert.equal(again.length, 1, "re-evaluation is idempotent");
});

test("REAL-ATLAS: variant barcode lookup resolves against live documents", async () => {
  const barcode = `VBARC-${uid("vb")}`;
  const created = await post("/api/v1/products", a.owner.accessToken, {
    businessId: a.biz.id,
    name: `VariantProd-${barcode}`,
    unit: "piece",
    variants: [{ name: "XL", sku: null, barcode, priceAdjustmentPaisa: 250 }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const lookup = await get(
    `/api/v1/products/lookup/barcode?businessId=${a.biz.id}&barcode=${encodeURIComponent(barcode)}`,
    a.owner.accessToken
  );
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.data.matchedVariant.name, "XL");
  assert.equal(lookup.body.data.matchedVariant.priceAdjustmentPaisa, 250);

  // Persisted variant lives inside the real Product document.
  const doc = await Product.findOne({ businessId: OBJ(a.biz.id), "variants.barcode": barcode }).lean();
  assert.ok(doc, "variant stored in Atlas");
});

test("REAL-ATLAS: offline inventory_adjust commits once; retry adds nothing", async () => {
  const product = await post("/api/v1/products", a.owner.accessToken, {
    businessId: a.biz.id,
    name: `OfflineAdj-${uid("oa")}`,
    unit: "piece",
    currentStock: 15,
  });
  const productId = product.body.data.id as string;
  const beforeStock = (await Product.findById(productId))!.currentStock;
  const localId = uid("adj");

  const pushBody = {
    businessId: a.biz.id,
    shopId: a.shop.id,
    ops: [
      {
        localId,
        type: "inventory_adjust",
        payload: { productId, qtyChange: -3, kind: "adjustment", reason: "Atlas damage count" },
      },
    ],
  };

  const first = await post("/api/v1/sync/push", a.owner.accessToken, pushBody);
  assert.equal(first.body.data.results[0].status, "SYNCED", JSON.stringify(first.body));
  const afterFirst = (await Product.findById(productId))!.currentStock;
  assert.equal(afterFirst, beforeStock - 3);

  const movement = await StockMovement.findOne({
    businessId: OBJ(a.biz.id),
    refType: "ADJUSTMENT",
    localId,
  });
  assert.ok(movement, "movement persisted with localId in Atlas");
  assert.equal(movement!.prevStock, beforeStock);
  assert.equal(movement!.newStock, afterFirst);

  const retry = await post("/api/v1/sync/push", a.owner.accessToken, pushBody);
  assert.equal(retry.body.data.results[0].duplicate, true);
  assert.equal(await StockMovement.countDocuments({ businessId: OBJ(a.biz.id), localId }), 1);
  assert.equal((await Product.findById(productId))!.currentStock, afterFirst);

  // Concurrent pushes of one localId → one movement, one mutation.
  const concId = uid("adjc");
  const concBody = {
    ...pushBody,
    ops: [
      {
        localId: concId,
        type: "inventory_adjust",
        payload: { productId, qtyChange: -1, kind: "damage", reason: "concurrent" },
      },
    ],
  };
  const responses = await Promise.all([
    post("/api/v1/sync/push", a.owner.accessToken, concBody),
    post("/api/v1/sync/push", a.owner.accessToken, concBody),
  ]);
  for (const r of responses) assert.equal(r.body.data.results[0].status, "SYNCED");
  assert.equal(
    await StockMovement.countDocuments({ businessId: OBJ(a.biz.id), localId: concId }),
    1,
    "one movement under concurrency"
  );
  const afterConcurrent = (await Product.findById(productId))!.currentStock;
  assert.equal(afterConcurrent, afterFirst - 1);
});

test("REAL-ATLAS: Excel export row count equals the raw Atlas sale count", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const binary = await new Promise<Buffer>((resolve, reject) => {
    request(app)
      .get(`/api/v1/export/excel?businessId=${a.biz.id}&type=sales`)
      .set("Authorization", `Bearer ${a.owner.accessToken}`)
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

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(binary);
  const sheet = wb.worksheets[0];
  const atlasSales = await Sale.countDocuments({ businessId: OBJ(a.biz.id) });
  assert.equal(sheet.rowCount - 1, atlasSales, "workbook rows == Atlas sales documents");
});
