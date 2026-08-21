import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Purchase } from "../src/models/Purchase";
import { Payment } from "../src/models/Payment";
import { Product } from "../src/models/Product";
import { Supplier } from "../src/models/Supplier";
import { Account } from "../src/models/Account";
import { AuditLog } from "../src/models/AuditLog";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { createPurchase } from "../src/services/purchase.service";
import { voidPurchase } from "../src/services/void.service";
import { recordPurchasePayment, listPurchasePayments } from "../src/services/settlement.service";
import { purchasePaymentSchema } from "../src/validation/purchase.schemas";
import { JOURNAL_ACCOUNTS } from "../src/config/accounts";

const DEV = { deviceId: "pp-dev", deviceName: "PurchasePayTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Purchase Pay User",
    email: `pp${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Purchase Pay Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: "Main",
      branchCode: `PP-${Math.random().toString(36).slice(2, 8)}`,
      ...over,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

/**
 * Products, suppliers, accounts and the purchases themselves are seeded through
 * the models and the verified 05.08 service so only the settlement endpoint is
 * exercised over HTTP — that keeps this file under the global rate limiter
 * (100 req/min).
 */
async function makeProduct(businessId: string, over: Record<string, unknown> = {}) {
  return Product.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `P-${Math.random().toString(36).slice(2)}`,
    sellingPrice: 10000,
    purchasePrice: 6000,
    taxRate: 0,
    currentStock: 0,
    avgCost: 0,
    status: "ACTIVE",
    ...over,
  });
}

async function makeSupplier(businessId: string, over: Record<string, unknown> = {}) {
  return Supplier.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `S-${Math.random().toString(36).slice(2)}`,
    currentPayable: 0,
    ...over,
  });
}

async function makeAccount(businessId: string, shopId: string, balancePaisa = 1000000) {
  const acct = await Account.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    shopId: new mongoose.Types.ObjectId(shopId),
    name: `Acct-${Math.random().toString(36).slice(2)}`,
    type: "CASH",
    currentBalance: balancePaisa,
  });
  return String(acct._id);
}

async function setRole(userId: string, businessId: string, role: string) {
  await BusinessMembership.findOneAndUpdate(
    {
      userId: new mongoose.Types.ObjectId(userId),
      businessId: new mongoose.Types.ObjectId(businessId),
    },
    { role }
  );
}

const oid = (id: string) => new mongoose.Types.ObjectId(id);
const key = () => `pp-${Math.random().toString(36).slice(2)}`;

function post(token: string, path: string, body: Record<string, unknown>) {
  return request(app).post(path).set("Authorization", `Bearer ${token}`).send(body);
}

function get(token: string, path: string) {
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

let ownerA: any;
let bizA: any;
let shopA: any;
let shopA2: any;
let userB: any;
let bizB: any;
let shopB: any;
let roleUser: any;

before(async () => {
  await connectTestDb("business-os-test-purchase-payment");
  ownerA = await registerUser();
  bizA = await createBusiness(ownerA.accessToken);
  shopA = await createShop(ownerA.accessToken, bizA.id);
  shopA2 = await createShop(ownerA.accessToken, bizA.id, { name: "Second Branch" });
  userB = await registerUser();
  bizB = await createBusiness(userB.accessToken);
  shopB = await createShop(userB.accessToken, bizB.id);
  roleUser = await registerUser();
  await BusinessMembership.create({
    userId: oid(roleUser.user.id),
    businessId: oid(bizA.id),
    shopId: null,
    role: "Accountant",
    status: "ACTIVE",
    permissions: [],
  });
});

after(async () => {
  await disconnectTestDb();
});

/** A COMPLETED fully-credit purchase of `total` paisa in shop A. */
async function creditPurchase(
  total = 10000,
  over: Record<string, unknown> = {},
  shopId = shopA.id,
  accountBalance = 1000000
) {
  const product = await makeProduct(bizA.id);
  const supplier = await makeSupplier(bizA.id);
  const accountId = await makeAccount(bizA.id, shopId, accountBalance);
  const { purchase } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: total }],
    ...over,
  } as never);
  return { purchase, supplier, accountId, product };
}

function payBody(accountId: string, amount: number, over: Record<string, unknown> = {}) {
  return {
    businessId: bizA.id,
    shopId: shopA.id,
    amount,
    method: "CASH",
    accountId,
    idempotencyKey: key(),
    ...over,
  };
}

const payPath = (purchaseId: string) => `/api/v1/purchases/${purchaseId}/payments`;

async function journalFor(paymentId: string) {
  const entry = await JournalEntry.findOne({
    referenceType: "PAYMENT",
    referenceId: oid(paymentId),
  });
  if (!entry) return null;
  const lines = await JournalLine.find({ entryId: entry._id }).sort({ accountName: 1 });
  return { entry, lines };
}

// ── Happy path ───────────────────────────────────────────────────────────────

test("purchase payment: a full settlement clears the bill, the payable and the till", async () => {
  const { purchase, supplier, accountId } = await creditPurchase(10000);
  assert.equal(purchase.paymentStatus, "UNPAID");
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 10000);
  const balanceBefore = (await Account.findById(oid(accountId)))!.currentBalance;

  const res = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 10000));
  assert.equal(res.status, 201);
  assert.equal(res.body.data.duplicate, false);

  assert.equal(res.body.data.purchase.paidAmount, 10000);
  assert.equal(res.body.data.purchase.dueAmount, 0);
  assert.equal(res.body.data.purchase.paymentStatus, "PAID");
  const stored = await Purchase.findById(oid(purchase.id));
  assert.equal(stored!.paidAmount, 10000);
  assert.equal(stored!.dueAmount, 0);
  assert.equal(stored!.paymentStatus, "PAID");
  assert.equal(stored!.status, "COMPLETED");

  const payments = await Payment.find({ purchaseId: oid(purchase.id) });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].type, "supplier_payment");
  assert.equal(String(payments[0].supplierId), String(supplier._id));
  assert.equal(payments[0].customerId, null);

  // Paying a supplier DECREASES the till.
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
  assert.equal((await Account.findById(oid(accountId)))!.currentBalance, balanceBefore - 10000);

  const journal = await journalFor(String(payments[0]._id));
  assert.ok(journal);
  const debit = journal!.lines.reduce((s, l) => s + l.debit, 0);
  const credit = journal!.lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debit, credit);
  assert.equal(debit, 10000);
  assert.deepEqual(
    journal!.lines.map((l) => [l.accountName, l.debit, l.credit]),
    [
      [JOURNAL_ACCOUNTS.CASH, 0, 10000],
      [JOURNAL_ACCOUNTS.SUPPLIER_PAYABLE, 10000, 0],
    ]
  );
});

test("purchase payment: the settlement audit row records the bill and the new figures", async () => {
  const { purchase, accountId } = await creditPurchase(8000);
  const res = await post(
    ownerA.accessToken,
    payPath(purchase.id),
    payBody(accountId, 3000, { note: "instalment" })
  );
  assert.equal(res.status, 201);
  const paymentId = res.body.data.payment.id;

  assert.ok(
    await AuditLog.findOne({
      businessId: oid(bizA.id),
      action: "PAYMENT_RECORDED",
      details: { $regex: `"amount":3000` },
    }),
    "the 05.05 engine still records PAYMENT_RECORDED"
  );
  const log = await AuditLog.findOne({
    businessId: oid(bizA.id),
    action: "PURCHASE_PAYMENT_RECORDED",
    details: { $regex: paymentId },
  });
  assert.ok(log);
  const details = JSON.parse(log!.details!);
  assert.equal(details.purchaseId, purchase.id);
  assert.equal(details.invoiceNo, purchase.invoiceNo);
  assert.equal(details.amount, 3000);
  assert.equal(details.dueAmount, 5000);
  assert.equal(details.paymentStatus, "PARTIAL");
});

test("purchase payment: paymentStatus walks UNPAID → PARTIAL → PAID across instalments", async () => {
  const { purchase, supplier, accountId } = await creditPurchase(9000);

  const first = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 4000));
  assert.equal(first.body.data.purchase.paymentStatus, "PARTIAL");
  assert.equal(first.body.data.purchase.dueAmount, 5000);
  const second = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 2500));
  assert.equal(second.body.data.purchase.paidAmount, 6500);
  const third = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 2500));
  assert.equal(third.body.data.purchase.paymentStatus, "PAID");
  assert.equal(third.body.data.purchase.dueAmount, 0);

  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 3);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
});

test("purchase payment: a bill partly paid on receipt can be settled later", async () => {
  const product = await makeProduct(bizA.id);
  const supplier = await makeSupplier(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id);
  const { purchase } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: 10000 }],
    paidAmount: 6000,
    accountId,
  } as never);
  assert.equal(purchase.dueAmount, 4000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 4000);

  const res = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 4000));
  assert.equal(res.status, 201);
  assert.equal(res.body.data.purchase.paymentStatus, "PAID");
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
});

// ── Overpayment, invalid state and the never-negative till ───────────────────

test("purchase payment: overpayment is refused with zero side effects", async () => {
  const { purchase, supplier, accountId } = await creditPurchase(5000);
  const balanceBefore = (await Account.findById(oid(accountId)))!.currentBalance;

  const res = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 5001));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /exceeds the purchase outstanding due/i);

  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 0);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 5000);
  assert.equal((await Account.findById(oid(accountId)))!.currentBalance, balanceBefore);
  const stored = await Purchase.findById(oid(purchase.id));
  assert.equal(stored!.paidAmount, 0);
  assert.equal(stored!.paymentStatus, "UNPAID");
});

test("purchase payment: a till without the cash refuses the settlement", async () => {
  const { purchase, supplier, accountId } = await creditPurchase(9000, {}, shopA.id, 2000);

  const res = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 9000));
  assert.equal(res.status, 400);
  assert.equal((await Account.findById(oid(accountId)))!.currentBalance, 2000, "never negative");
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 9000);
  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 0);
  assert.equal((await Purchase.findById(oid(purchase.id)))!.paidAmount, 0);
});

test("purchase payment: a fully paid bill cannot be paid again", async () => {
  const { purchase, accountId } = await creditPurchase(3000);
  assert.equal(
    (await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 3000))).status,
    201
  );
  const res = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 1));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /already fully paid/i);
  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 1);
});

test("purchase payment: a DRAFT purchase cannot be settled", async () => {
  const product = await makeProduct(bizA.id);
  const supplier = await makeSupplier(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id);
  const { purchase } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: 4000 }],
    draft: true,
  } as never);

  const res = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 1000));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /draft purchase cannot be settled/i);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 0);
});

test("purchase payment: a VOIDED purchase cannot be settled", async () => {
  const { purchase, supplier, accountId } = await creditPurchase(6000);
  await voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);

  const res = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 1000));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /voided purchase cannot be settled/i);
  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 0);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
});

// ── Idempotency ──────────────────────────────────────────────────────────────

test("purchase payment: a replayed idempotencyKey applies the payment exactly once", async () => {
  const { purchase, supplier, accountId } = await creditPurchase(7000);
  const balanceBefore = (await Account.findById(oid(accountId)))!.currentBalance;
  const body = payBody(accountId, 7000);

  const first = await post(ownerA.accessToken, payPath(purchase.id), body);
  assert.equal(first.status, 201);
  const replay = await post(ownerA.accessToken, payPath(purchase.id), body);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data.duplicate, true);
  assert.equal(replay.body.data.payment.id, first.body.data.payment.id);

  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 1, "ONE payment");
  assert.equal(
    await JournalEntry.countDocuments({
      referenceType: "PAYMENT",
      referenceId: oid(first.body.data.payment.id),
    }),
    1,
    "ONE journal"
  );
  assert.equal(
    await AuditLog.countDocuments({
      businessId: oid(bizA.id),
      action: "PURCHASE_PAYMENT_RECORDED",
      details: { $regex: first.body.data.payment.id },
    }),
    1,
    "ONE settlement audit event"
  );
  assert.equal((await Purchase.findById(oid(purchase.id)))!.paidAmount, 7000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
  assert.equal((await Account.findById(oid(accountId)))!.currentBalance, balanceBefore - 7000);
});

test("purchase payment: concurrent duplicate settlements apply the payment exactly once", async () => {
  const { purchase, supplier, accountId } = await creditPurchase(6000);
  const balanceBefore = (await Account.findById(oid(accountId)))!.currentBalance;
  const input = {
    businessId: bizA.id,
    shopId: shopA.id,
    amount: 6000,
    method: "CASH" as const,
    accountId,
    idempotencyKey: key(),
  };

  const settled = await Promise.allSettled([
    recordPurchasePayment(ownerA.user.id, bizA.id, shopA.id, purchase.id, input),
    recordPurchasePayment(ownerA.user.id, bizA.id, shopA.id, purchase.id, input),
  ]);
  assert.ok(settled.some((r) => r.status === "fulfilled"));

  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 1);
  assert.equal((await Purchase.findById(oid(purchase.id)))!.paidAmount, 6000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
  assert.equal((await Account.findById(oid(accountId)))!.currentBalance, balanceBefore - 6000);
});

test("purchase payment: two DIFFERENT concurrent payments cannot together overpay the bill", async () => {
  const { purchase, supplier, accountId } = await creditPurchase(10000);
  const base = { businessId: bizA.id, shopId: shopA.id, method: "CASH" as const, accountId };

  const settled = await Promise.allSettled([
    recordPurchasePayment(ownerA.user.id, bizA.id, shopA.id, purchase.id, {
      ...base,
      amount: 8000,
      idempotencyKey: key(),
    }),
    recordPurchasePayment(ownerA.user.id, bizA.id, shopA.id, purchase.id, {
      ...base,
      amount: 8000,
      idempotencyKey: key(),
    }),
  ]);
  assert.equal(settled.filter((r) => r.status === "fulfilled").length, 1);

  const stored = await Purchase.findById(oid(purchase.id));
  assert.equal(stored!.paidAmount, 8000);
  assert.equal(stored!.dueAmount, 2000);
  assert.ok(stored!.dueAmount >= 0);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 2000);
  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 1);
});

// ── Transaction rollback (fault injection AFTER the money moved) ─────────────

test("purchase payment: a failure after the money moved leaves zero side effects", async () => {
  const { purchase, supplier, accountId } = await creditPurchase(9000);
  const balanceBefore = (await Account.findById(oid(accountId)))!.currentBalance;
  const journalBefore = await JournalEntry.countDocuments({ businessId: oid(bizA.id) });
  const auditBefore = await AuditLog.countDocuments({ businessId: oid(bizA.id) });

  // A `notes` value past the model's 500-char limit, written WITHOUT validation,
  // so the purchase's own save() — the last write, after the Payment, the
  // payable, the till, the journal and the audit — throws.
  await Purchase.updateOne({ _id: oid(purchase.id) }, { $set: { notes: "x".repeat(600) } });

  await assert.rejects(() =>
    recordPurchasePayment(ownerA.user.id, bizA.id, shopA.id, purchase.id, {
      businessId: bizA.id,
      shopId: shopA.id,
      amount: 9000,
      method: "CASH",
      accountId,
      idempotencyKey: key(),
    })
  );

  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 0);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 9000, "payable restored");
  assert.equal(
    (await Account.findById(oid(accountId)))!.currentBalance,
    balanceBefore,
    "the till was restored"
  );
  assert.equal(await JournalEntry.countDocuments({ businessId: oid(bizA.id) }), journalBefore);
  assert.equal(await AuditLog.countDocuments({ businessId: oid(bizA.id) }), auditBefore);
  const stored = await Purchase.findById(oid(purchase.id));
  assert.equal(stored!.paidAmount, 0);
  assert.equal(stored!.dueAmount, 9000);
  assert.equal(stored!.paymentStatus, "UNPAID");
});

// ── Isolation ────────────────────────────────────────────────────────────────

test("purchase payment: a foreign account is 404 and its balance is untouched", async () => {
  const { purchase, supplier } = await creditPurchase(5000);
  const foreignAccount = await makeAccount(bizB.id, shopB.id, 500000);

  const res = await post(ownerA.accessToken, payPath(purchase.id), payBody(foreignAccount, 1000));
  assert.equal(res.status, 404);
  assert.match(res.body.error.message, /Account not found/i);
  assert.equal((await Account.findById(oid(foreignAccount)))!.currentBalance, 500000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 5000);
  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 0);
});

test("purchase payment: an account from another branch of the same business is 404", async () => {
  const { purchase } = await creditPurchase(5000);
  const otherBranchAccount = await makeAccount(bizA.id, shopA2.id, 500000);
  const res = await post(
    ownerA.accessToken,
    payPath(purchase.id),
    payBody(otherBranchAccount, 1000)
  );
  assert.equal(res.status, 404);
  assert.equal((await Account.findById(oid(otherBranchAccount)))!.currentBalance, 500000);
});

test("purchase payment: cross-tenant and cross-shop settlement attempts are 404", async () => {
  const { purchase, accountId } = await creditPurchase(5000);

  const bAccount = await makeAccount(bizB.id, shopB.id);
  const foreignScope = await post(userB.accessToken, payPath(purchase.id), {
    businessId: bizB.id,
    shopId: shopB.id,
    amount: 1000,
    method: "CASH",
    accountId: bAccount,
    idempotencyKey: key(),
  });
  assert.equal(foreignScope.status, 404);

  const spoof = await post(userB.accessToken, payPath(purchase.id), payBody(accountId, 1000));
  assert.equal(spoof.status, 404);
  assert.match(spoof.body.error.message, /Business not found/i);

  const crossShop = await post(ownerA.accessToken, payPath(purchase.id), {
    ...payBody(accountId, 1000),
    shopId: shopA2.id,
  });
  assert.equal(crossShop.status, 404);
  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 0);
});

test("purchase payment: unknown and malformed purchase ids are 404", async () => {
  const accountId = await makeAccount(bizA.id, shopA.id);
  const ghost = await post(
    ownerA.accessToken,
    payPath(new mongoose.Types.ObjectId().toString()),
    payBody(accountId, 1000)
  );
  assert.equal(ghost.status, 404);
  assert.match(ghost.body.error.message, /Purchase not found/i);
  const malformed = await post(
    ownerA.accessToken,
    payPath("12345"),
    payBody(accountId, 1000)
  );
  assert.equal(malformed.status, 404);
});

// ── RBAC ─────────────────────────────────────────────────────────────────────

test("purchase payment: Owner, Admin, Manager and Accountant may pay a supplier bill", async () => {
  const { purchase, accountId } = await creditPurchase(4000);
  for (const role of ["Admin", "Manager", "Accountant"]) {
    await setRole(roleUser.user.id, bizA.id, role);
    const res = await post(roleUser.accessToken, payPath(purchase.id), payBody(accountId, 1000));
    assert.equal(res.status, 201, `${role} may pay`);
  }
  const owner = await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 1000));
  assert.equal(owner.status, 201);
  assert.equal((await Purchase.findById(oid(purchase.id)))!.paymentStatus, "PAID");
});

test("purchase payment: an Inventory Manager may receive goods but not release money", async () => {
  const { purchase, accountId } = await creditPurchase(4000);
  for (const role of ["Inventory Manager", "Salesperson", "Viewer"]) {
    await setRole(roleUser.user.id, bizA.id, role);
    const res = await post(roleUser.accessToken, payPath(purchase.id), payBody(accountId, 1000));
    assert.equal(res.status, 403, `${role} may not pay`);
  }
  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 0);
});

test("purchase payment: RBAC is enforced at the service level, not just the route", async () => {
  const { purchase, accountId } = await creditPurchase(4000);
  await setRole(roleUser.user.id, bizA.id, "Inventory Manager");
  await assert.rejects(
    () =>
      recordPurchasePayment(roleUser.user.id, bizA.id, shopA.id, purchase.id, {
        businessId: bizA.id,
        shopId: shopA.id,
        amount: 1000,
        method: "CASH",
        accountId,
        idempotencyKey: key(),
      }),
    /Insufficient role/
  );
  await setRole(roleUser.user.id, bizA.id, "Accountant");
});

// ── Validation ───────────────────────────────────────────────────────────────

test("purchase payment: the request body is strictly validated", async () => {
  const accountId = "0".repeat(24);
  const ok = {
    businessId: bizA.id,
    shopId: shopA.id,
    amount: 1000,
    method: "CASH",
    accountId,
    idempotencyKey: "k1",
  };
  assert.equal(purchasePaymentSchema.safeParse(ok).success, true);

  const rejected: Record<string, unknown>[] = [
    { ...ok, type: "supplier_payment" },
    { ...ok, supplierId: accountId },
    { ...ok, customerId: accountId },
    { ...ok, purchaseId: accountId },
    { ...ok, saleId: accountId },
    { ...ok, paidAmount: 500 },
    { ...ok, dueAmount: 0 },
    { ...ok, paymentStatus: "PAID" },
    { ...ok, status: "COMPLETED" },
    { ...ok, createdBy: accountId },
    { ...ok, amount: 0 },
    { ...ok, amount: -100 },
    { ...ok, amount: 1000.5 },
    { ...ok, amount: 1e16 },
    { ...ok, method: "CHEQUE" },
    { ...ok, accountId: "nope" },
    { ...ok, idempotencyKey: "" },
    { ...ok, paymentDate: "20-08-2026" },
    { ...ok, note: "n".repeat(501) },
    { ...ok, localId: "l".repeat(81) },
    { businessId: bizA.id, shopId: shopA.id, amount: 1000, method: "CASH", accountId },
  ];
  for (const body of rejected) {
    assert.equal(
      purchasePaymentSchema.safeParse(body).success,
      false,
      `expected rejection: ${JSON.stringify(body)}`
    );
  }
});

test("purchase payment: a spoofed supplierId is rejected over HTTP", async () => {
  const { purchase, accountId } = await creditPurchase(5000);
  const otherSupplier = await makeSupplier(bizA.id, { currentPayable: 999999 });
  const res = await post(ownerA.accessToken, payPath(purchase.id), {
    ...payBody(accountId, 1000),
    supplierId: String(otherSupplier._id),
  });
  assert.equal(res.status, 400);
  assert.equal((await Supplier.findById(otherSupplier._id))!.currentPayable, 999999);
  assert.equal(await Payment.countDocuments({ purchaseId: oid(purchase.id) }), 0);
});

// ── Listing settlements ──────────────────────────────────────────────────────

test("purchase payment: GET /purchases/:id/payments lists that bill's payments", async () => {
  const { purchase, accountId } = await creditPurchase(9000);
  const other = await creditPurchase(5000);
  await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 2000, { note: "first" }));
  await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 3000, { note: "second" }));
  await post(ownerA.accessToken, payPath(other.purchase.id), payBody(other.accountId, 1000));

  const res = await get(
    ownerA.accessToken,
    `/api/v1/purchases/${purchase.id}/payments?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 2);
  assert.deepEqual(
    res.body.data.map((p: any) => [p.amount, p.note]),
    [
      [2000, "first"],
      [3000, "second"],
    ]
  );
  assert.equal(
    res.body.data.every(
      (p: any) => p.purchaseId === purchase.id && p.type === "supplier_payment"
    ),
    true
  );

  await setRole(roleUser.user.id, bizA.id, "Viewer");
  const viewer = await get(
    roleUser.accessToken,
    `/api/v1/purchases/${purchase.id}/payments?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(viewer.status, 200);
  assert.equal(viewer.body.data.length, 2);
  await setRole(roleUser.user.id, bizA.id, "Accountant");
});

test("purchase payment: settlement history is tenant and shop scoped", async () => {
  const { purchase } = await creditPurchase(5000);
  const foreign = await get(
    userB.accessToken,
    `/api/v1/purchases/${purchase.id}/payments?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(foreign.status, 404);
  const crossShop = await get(
    ownerA.accessToken,
    `/api/v1/purchases/${purchase.id}/payments?businessId=${bizA.id}&shopId=${shopA2.id}`
  );
  assert.equal(crossShop.status, 404);
  await assert.rejects(
    () => listPurchasePayments(ownerA.user.id, bizA.id, shopA.id, "not-an-objectid"),
    /Purchase not found/
  );
});

test("purchase payment: a settled bill can no longer be voided (05.09 composes)", async () => {
  const { purchase, accountId } = await creditPurchase(5000);
  assert.equal(
    (await post(ownerA.accessToken, payPath(purchase.id), payBody(accountId, 2000))).status,
    201
  );
  await assert.rejects(
    () => voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id),
    /payment/i
  );
  assert.equal((await Purchase.findById(oid(purchase.id)))!.status, "COMPLETED");
});

test("purchase payment: unauthenticated settlement requests are 401", async () => {
  const res = await request(app)
    .post(payPath(new mongoose.Types.ObjectId().toString()))
    .send({ businessId: bizA.id, shopId: shopA.id, amount: 100 });
  assert.equal(res.status, 401);
  const list = await request(app).get(
    `/api/v1/purchases/${new mongoose.Types.ObjectId()}/payments?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(list.status, 401);
});
