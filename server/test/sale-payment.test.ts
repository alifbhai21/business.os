import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Sale } from "../src/models/Sale";
import { Payment } from "../src/models/Payment";
import { Product } from "../src/models/Product";
import { Customer } from "../src/models/Customer";
import { Account } from "../src/models/Account";
import { AuditLog } from "../src/models/AuditLog";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { createSale } from "../src/services/sale.service";
import { voidSale } from "../src/services/void.service";
import { recordSalePayment, listSalePayments } from "../src/services/settlement.service";
import { salePaymentSchema } from "../src/validation/sale.schemas";
import { JOURNAL_ACCOUNTS } from "../src/config/accounts";

const DEV = { deviceId: "sp-dev", deviceName: "SalePayTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Sale Pay User",
    email: `sp${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Sale Pay Business", type: "retail", ...over });
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
      branchCode: `SP-${Math.random().toString(36).slice(2, 8)}`,
      ...over,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

/**
 * Products, customers, accounts and the sales themselves are seeded through the
 * models and the verified 05.07 service so only the settlement endpoint is
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
    currentStock: 1000,
    avgCost: 0,
    status: "ACTIVE",
    ...over,
  });
}

async function makeCustomer(businessId: string, over: Record<string, unknown> = {}) {
  return Customer.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `C-${Math.random().toString(36).slice(2)}`,
    currentDue: 0,
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
const key = () => `sp-${Math.random().toString(36).slice(2)}`;

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
  await connectTestDb("business-os-test-sale-payment");
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

/**
 * A COMPLETED credit sale of `total` paisa in shop A with a fresh customer and
 * a fresh cash account, so every test starts from known balances.
 */
async function creditSale(total = 10000, over: Record<string, unknown> = {}, shopId = shopA.id) {
  const product = await makeProduct(bizA.id);
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopId);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: total }],
    ...over,
  } as never);
  return { sale, customer, accountId, product };
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

const payPath = (saleId: string) => `/api/v1/sales/${saleId}/payments`;

/** The journal entry a payment posted, with its lines. */
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

test("sale payment: a full settlement pays the invoice, the customer and the till", async () => {
  const { sale, customer, accountId } = await creditSale(10000);
  assert.equal(sale.paymentStatus, "UNPAID");
  assert.equal((await Customer.findById(customer._id))!.currentDue, 10000);
  const balanceBefore = (await Account.findById(oid(accountId)))!.currentBalance;

  const res = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 10000));
  assert.equal(res.status, 201);
  assert.equal(res.body.data.duplicate, false);

  // The invoice
  assert.equal(res.body.data.sale.paidAmount, 10000);
  assert.equal(res.body.data.sale.dueAmount, 0);
  assert.equal(res.body.data.sale.paymentStatus, "PAID");
  const stored = await Sale.findById(oid(sale.id));
  assert.equal(stored!.paidAmount, 10000);
  assert.equal(stored!.dueAmount, 0);
  assert.equal(stored!.paymentStatus, "PAID");
  assert.equal(stored!.status, "COMPLETED", "settling never changes the document status");

  // The Payment document links both the customer and the invoice.
  const payments = await Payment.find({ saleId: oid(sale.id) });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].type, "customer_payment");
  assert.equal(String(payments[0].customerId), String(customer._id));
  assert.equal(payments[0].amount, 10000);
  assert.equal(String(payments[0].accountId), accountId);

  // The party and the till
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);
  assert.equal((await Account.findById(oid(accountId)))!.currentBalance, balanceBefore + 10000);

  // One balanced journal from the 05.05 engine — not a second implementation.
  const journal = await journalFor(String(payments[0]._id));
  assert.ok(journal);
  const debit = journal!.lines.reduce((s, l) => s + l.debit, 0);
  const credit = journal!.lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debit, credit);
  assert.equal(debit, 10000);
  assert.deepEqual(
    journal!.lines.map((l) => [l.accountName, l.debit, l.credit]),
    [
      [JOURNAL_ACCOUNTS.CASH, 10000, 0],
      [JOURNAL_ACCOUNTS.CUSTOMER_RECEIVABLE, 0, 10000],
    ]
  );
});

test("sale payment: both audit rows are written — the payment and the settlement", async () => {
  const { sale, accountId } = await creditSale(8000);
  const res = await post(
    ownerA.accessToken,
    payPath(sale.id),
    payBody(accountId, 3000, { note: "part one" })
  );
  assert.equal(res.status, 201);
  const paymentId = res.body.data.payment.id;

  const paymentLog = await AuditLog.findOne({
    businessId: oid(bizA.id),
    action: "PAYMENT_RECORDED",
    details: { $regex: `"amount":3000` },
  });
  assert.ok(paymentLog, "the 05.05 engine still records PAYMENT_RECORDED");

  const settlementLog = await AuditLog.findOne({
    businessId: oid(bizA.id),
    action: "SALE_PAYMENT_RECORDED",
    details: { $regex: paymentId },
  });
  assert.ok(settlementLog);
  const details = JSON.parse(settlementLog!.details!);
  assert.equal(details.saleId, sale.id);
  assert.equal(details.invoiceNo, sale.invoiceNo);
  assert.equal(details.amount, 3000);
  assert.equal(details.paidAmount, 3000);
  assert.equal(details.dueAmount, 5000);
  assert.equal(details.paymentStatus, "PARTIAL");
  assert.equal(String(settlementLog!.userId), ownerA.user.id);
});

test("sale payment: paymentStatus walks UNPAID → PARTIAL → PAID across several receipts", async () => {
  const { sale, customer, accountId } = await creditSale(9000);

  const first = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 4000));
  assert.equal(first.status, 201);
  assert.equal(first.body.data.sale.paymentStatus, "PARTIAL");
  assert.equal(first.body.data.sale.dueAmount, 5000);

  const second = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 2500));
  assert.equal(second.body.data.sale.paymentStatus, "PARTIAL");
  assert.equal(second.body.data.sale.paidAmount, 6500);

  const third = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 2500));
  assert.equal(third.body.data.sale.paymentStatus, "PAID");
  assert.equal(third.body.data.sale.dueAmount, 0);

  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 3);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);
  const stored = await Sale.findById(oid(sale.id));
  assert.equal(stored!.paidAmount, stored!.total);
});

test("sale payment: a sale settled at finalization can still be topped up", async () => {
  const product = await makeProduct(bizA.id);
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: 10000 }],
    paidAmount: 6000,
    accountId,
  } as never);
  assert.equal(sale.paymentStatus, "PARTIAL");
  assert.equal(sale.dueAmount, 4000);

  const res = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 4000));
  assert.equal(res.status, 201);
  assert.equal(res.body.data.sale.paymentStatus, "PAID");
  assert.equal(res.body.data.sale.paidAmount, 10000);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);
});

// ── Overpayment and invalid state ────────────────────────────────────────────

test("sale payment: overpayment is refused with zero side effects", async () => {
  const { sale, customer, accountId } = await creditSale(5000);
  const balanceBefore = (await Account.findById(oid(accountId)))!.currentBalance;

  const res = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 5001));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /exceeds the sale outstanding due/i);

  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 0);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 5000);
  assert.equal((await Account.findById(oid(accountId)))!.currentBalance, balanceBefore);
  const stored = await Sale.findById(oid(sale.id));
  assert.equal(stored!.paidAmount, 0);
  assert.equal(stored!.dueAmount, 5000);
  assert.equal(stored!.paymentStatus, "UNPAID");
});

test("sale payment: a fully paid invoice cannot be paid again", async () => {
  const { sale, accountId } = await creditSale(3000);
  assert.equal((await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 3000))).status, 201);

  const res = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 1));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /already fully paid/i);
  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 1);
});

test("sale payment: a DRAFT sale cannot be settled", async () => {
  const product = await makeProduct(bizA.id);
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: 4000 }],
    draft: true,
  } as never);

  const res = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 1000));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /draft sale cannot be settled/i);
  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 0);
  // The draft never recorded a due against the customer, so nothing moved.
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);
});

test("sale payment: a VOIDED sale cannot be settled", async () => {
  const { sale, customer, accountId } = await creditSale(6000);
  await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);

  const res = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 1000));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /voided sale cannot be settled/i);
  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 0);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);
});

test("sale payment: a walk-in sale has no customer to settle against", async () => {
  const product = await makeProduct(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerName: "Walk-in",
    items: [{ productId: String(product._id), qty: 1, unitPrice: 2000 }],
    paidAmount: 2000,
    accountId,
  } as never);
  // Force an outstanding due onto the walk-in sale that 05.07 would never allow,
  // so the settlement guard itself is what refuses the request.
  await Sale.updateOne(
    { _id: oid(sale.id) },
    { $set: { paidAmount: 0, dueAmount: 2000, paymentStatus: "UNPAID" } }
  );

  const res = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 1000));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /walk-in sale has no customer/i);
  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 0);
});

// ── Idempotency ──────────────────────────────────────────────────────────────

test("sale payment: a replayed idempotencyKey applies the receipt exactly once", async () => {
  const { sale, customer, accountId } = await creditSale(7000);
  const body = payBody(accountId, 7000);

  const first = await post(ownerA.accessToken, payPath(sale.id), body);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.duplicate, false);

  // The invoice is now fully paid — the replay must still return the original
  // payment rather than failing the "already fully paid" guard.
  const replay = await post(ownerA.accessToken, payPath(sale.id), body);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data.duplicate, true);
  assert.equal(replay.body.data.payment.id, first.body.data.payment.id);

  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 1, "ONE payment");
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
      action: "SALE_PAYMENT_RECORDED",
      details: { $regex: first.body.data.payment.id },
    }),
    1,
    "ONE settlement audit event"
  );
  const stored = await Sale.findById(oid(sale.id));
  assert.equal(stored!.paidAmount, 7000, "ONE balance mutation");
  assert.equal(stored!.dueAmount, 0);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);
});

test("sale payment: concurrent duplicate settlements apply the receipt exactly once", async () => {
  const { sale, customer, accountId } = await creditSale(6000);
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
    recordSalePayment(ownerA.user.id, bizA.id, shopA.id, sale.id, input),
    recordSalePayment(ownerA.user.id, bizA.id, shopA.id, sale.id, input),
  ]);
  const fulfilled = settled.filter((r) => r.status === "fulfilled");
  assert.ok(fulfilled.length >= 1, "at least one call succeeds");

  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 1, "ONE payment");
  const payment = (await Payment.findOne({ saleId: oid(sale.id) }))!;
  assert.equal(
    await JournalEntry.countDocuments({
      referenceType: "PAYMENT",
      referenceId: payment._id,
    }),
    1,
    "ONE journal"
  );
  const stored = await Sale.findById(oid(sale.id));
  assert.equal(stored!.paidAmount, 6000, "the invoice moved once");
  assert.equal(stored!.dueAmount, 0);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0, "the due moved once");
  assert.equal(
    (await Account.findById(oid(accountId)))!.currentBalance,
    balanceBefore + 6000,
    "the till moved once"
  );
});

test("sale payment: two DIFFERENT concurrent receipts cannot together overpay the invoice", async () => {
  const { sale, customer, accountId } = await creditSale(10000);
  const base = { businessId: bizA.id, shopId: shopA.id, method: "CASH" as const, accountId };

  const settled = await Promise.allSettled([
    recordSalePayment(ownerA.user.id, bizA.id, shopA.id, sale.id, {
      ...base,
      amount: 8000,
      idempotencyKey: key(),
    }),
    recordSalePayment(ownerA.user.id, bizA.id, shopA.id, sale.id, {
      ...base,
      amount: 8000,
      idempotencyKey: key(),
    }),
  ]);
  const applied = settled.filter((r) => r.status === "fulfilled").length;
  assert.equal(applied, 1, "only one of two overlapping 8000 receipts can land");

  const stored = await Sale.findById(oid(sale.id));
  assert.equal(stored!.paidAmount, 8000);
  assert.equal(stored!.dueAmount, 2000);
  assert.ok(stored!.dueAmount >= 0, "the invoice due never goes negative");
  assert.equal((await Customer.findById(customer._id))!.currentDue, 2000);
  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 1);
});

// ── Transaction rollback (fault injection AFTER the money moved) ─────────────

test("sale payment: a failure after the money moved leaves zero side effects", async () => {
  const { sale, customer, accountId } = await creditSale(9000);
  const balanceBefore = (await Account.findById(oid(accountId)))!.currentBalance;
  const journalBefore = await JournalEntry.countDocuments({ businessId: oid(bizA.id) });
  const auditBefore = await AuditLog.countDocuments({ businessId: oid(bizA.id) });

  // Squat a `notes` value past the model's 500-char limit WITHOUT validation, so
  // the sale's own save() — the very last write of the settlement, after the
  // Payment, the customer due, the till, the journal and the audit — throws.
  await Sale.updateOne({ _id: oid(sale.id) }, { $set: { notes: "x".repeat(600) } });

  await assert.rejects(() =>
    recordSalePayment(ownerA.user.id, bizA.id, shopA.id, sale.id, {
      businessId: bizA.id,
      shopId: shopA.id,
      amount: 9000,
      method: "CASH",
      accountId,
      idempotencyKey: key(),
    })
  );

  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 0, "no Payment survived");
  assert.equal(
    (await Customer.findById(customer._id))!.currentDue,
    9000,
    "the customer due was restored"
  );
  assert.equal(
    (await Account.findById(oid(accountId)))!.currentBalance,
    balanceBefore,
    "the till was restored"
  );
  assert.equal(await JournalEntry.countDocuments({ businessId: oid(bizA.id) }), journalBefore);
  assert.equal(await AuditLog.countDocuments({ businessId: oid(bizA.id) }), auditBefore);
  const stored = await Sale.findById(oid(sale.id));
  assert.equal(stored!.paidAmount, 0);
  assert.equal(stored!.dueAmount, 9000);
  assert.equal(stored!.paymentStatus, "UNPAID");
});

// ── Isolation ────────────────────────────────────────────────────────────────

test("sale payment: a foreign account is 404 and its balance is untouched", async () => {
  const { sale, customer } = await creditSale(5000);
  const foreignAccount = await makeAccount(bizB.id, shopB.id, 500000);
  const foreignBefore = (await Account.findById(oid(foreignAccount)))!.currentBalance;

  const res = await post(
    ownerA.accessToken,
    payPath(sale.id),
    payBody(foreignAccount, 1000)
  );
  assert.equal(res.status, 404);
  assert.match(res.body.error.message, /Account not found/i);
  assert.equal((await Account.findById(oid(foreignAccount)))!.currentBalance, foreignBefore);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 5000);
  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 0);
});

test("sale payment: an account belonging to another branch of the same business is 404", async () => {
  const { sale, accountId } = await creditSale(5000);
  const otherBranchAccount = await makeAccount(bizA.id, shopA2.id, 500000);
  assert.ok(accountId);

  const res = await post(
    ownerA.accessToken,
    payPath(sale.id),
    payBody(otherBranchAccount, 1000)
  );
  assert.equal(res.status, 404);
  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 0);
});

test("sale payment: cross-tenant and cross-shop settlement attempts are 404", async () => {
  const { sale, accountId } = await creditSale(5000);

  // Business B, using its own scope, cannot reach A's invoice.
  const bAccount = await makeAccount(bizB.id, shopB.id);
  const foreignScope = await post(userB.accessToken, payPath(sale.id), {
    businessId: bizB.id,
    shopId: shopB.id,
    amount: 1000,
    method: "CASH",
    accountId: bAccount,
    idempotencyKey: key(),
  });
  assert.equal(foreignScope.status, 404);

  // Business B, spoofing A's ids, has no membership at all.
  const spoof = await post(userB.accessToken, payPath(sale.id), payBody(accountId, 1000));
  assert.equal(spoof.status, 404);
  assert.match(spoof.body.error.message, /Business not found/i);

  // A's own other branch does not own the invoice.
  const crossShop = await post(ownerA.accessToken, payPath(sale.id), {
    ...payBody(accountId, 1000),
    shopId: shopA2.id,
  });
  assert.equal(crossShop.status, 404);
  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 0);
});

test("sale payment: unknown and malformed sale ids are 404", async () => {
  const accountId = await makeAccount(bizA.id, shopA.id);
  const ghost = await post(
    ownerA.accessToken,
    payPath(new mongoose.Types.ObjectId().toString()),
    payBody(accountId, 1000)
  );
  assert.equal(ghost.status, 404);
  assert.match(ghost.body.error.message, /Sale not found/i);

  const malformed = await post(
    ownerA.accessToken,
    payPath("not-an-objectid"),
    payBody(accountId, 1000)
  );
  assert.equal(malformed.status, 404);
});

// ── RBAC ─────────────────────────────────────────────────────────────────────

test("sale payment: Owner, Admin, Manager and Accountant may settle an invoice", async () => {
  const { sale, accountId } = await creditSale(4000);
  for (const role of ["Admin", "Manager", "Accountant"]) {
    await setRole(roleUser.user.id, bizA.id, role);
    const res = await post(roleUser.accessToken, payPath(sale.id), payBody(accountId, 1000));
    assert.equal(res.status, 201, `${role} may settle`);
  }
  const owner = await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 1000));
  assert.equal(owner.status, 201, "Owner may settle");
  assert.equal((await Sale.findById(oid(sale.id)))!.paymentStatus, "PAID");
});

test("sale payment: Salesperson, Inventory Manager and Viewer are refused 403", async () => {
  const { sale, accountId } = await creditSale(4000);
  for (const role of ["Salesperson", "Inventory Manager", "Viewer"]) {
    await setRole(roleUser.user.id, bizA.id, role);
    const res = await post(roleUser.accessToken, payPath(sale.id), payBody(accountId, 1000));
    assert.equal(res.status, 403, `${role} may not settle`);
  }
  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 0);
});

test("sale payment: RBAC is enforced at the service level, not just the route", async () => {
  const { sale, accountId } = await creditSale(4000);
  await setRole(roleUser.user.id, bizA.id, "Salesperson");
  await assert.rejects(
    () =>
      recordSalePayment(roleUser.user.id, bizA.id, shopA.id, sale.id, {
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

test("sale payment: the request body is strictly validated", async () => {
  const accountId = "0".repeat(24);
  const ok = {
    businessId: bizA.id,
    shopId: shopA.id,
    amount: 1000,
    method: "CASH",
    accountId,
    idempotencyKey: "k1",
  };
  assert.equal(salePaymentSchema.safeParse(ok).success, true);

  const rejected: Record<string, unknown>[] = [
    // The counterparty and the link are derived from the sale, never accepted.
    { ...ok, type: "customer_payment" },
    { ...ok, customerId: accountId },
    { ...ok, supplierId: accountId },
    { ...ok, saleId: accountId },
    { ...ok, purchaseId: accountId },
    // The document's own figures can never be restated by the client.
    { ...ok, paidAmount: 500 },
    { ...ok, dueAmount: 0 },
    { ...ok, paymentStatus: "PAID" },
    { ...ok, status: "COMPLETED" },
    { ...ok, createdBy: accountId },
    // Money policy
    { ...ok, amount: 0 },
    { ...ok, amount: -100 },
    { ...ok, amount: 1000.5 },
    { ...ok, amount: 1e16 },
    // Required / typed fields
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
      salePaymentSchema.safeParse(body).success,
      false,
      `expected rejection: ${JSON.stringify(body)}`
    );
  }
});

test("sale payment: a spoofed customerId is rejected over HTTP, not silently ignored", async () => {
  const { sale, accountId } = await creditSale(5000);
  const otherCustomer = await makeCustomer(bizA.id, { currentDue: 999999 });
  const res = await post(ownerA.accessToken, payPath(sale.id), {
    ...payBody(accountId, 1000),
    customerId: String(otherCustomer._id),
  });
  assert.equal(res.status, 400);
  assert.equal((await Customer.findById(otherCustomer._id))!.currentDue, 999999);
  assert.equal(await Payment.countDocuments({ saleId: oid(sale.id) }), 0);
});

// ── Listing settlements ──────────────────────────────────────────────────────

test("sale payment: GET /sales/:id/payments lists that invoice's receipts in order", async () => {
  const { sale, accountId } = await creditSale(9000);
  const other = await creditSale(5000);
  await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 2000, { note: "first" }));
  await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 3000, { note: "second" }));
  await post(ownerA.accessToken, payPath(other.sale.id), payBody(other.accountId, 1000));

  const res = await get(
    ownerA.accessToken,
    `/api/v1/sales/${sale.id}/payments?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 2, "another invoice's receipt does not leak in");
  assert.deepEqual(
    res.body.data.map((p: any) => [p.amount, p.note]),
    [
      [2000, "first"],
      [3000, "second"],
    ]
  );
  assert.equal(
    res.body.data.every((p: any) => p.saleId === sale.id && p.type === "customer_payment"),
    true
  );
  for (const p of res.body.data) {
    assert.ok(Number.isSafeInteger(p.amount), "money stays integer paisa");
  }

  // A Viewer may read the settlement history — same contract as GET /sales/:id.
  await setRole(roleUser.user.id, bizA.id, "Viewer");
  const viewer = await get(
    roleUser.accessToken,
    `/api/v1/sales/${sale.id}/payments?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(viewer.status, 200);
  assert.equal(viewer.body.data.length, 2);
  await setRole(roleUser.user.id, bizA.id, "Accountant");
});

test("sale payment: settlement history is tenant and shop scoped", async () => {
  const { sale } = await creditSale(5000);
  const foreign = await get(
    userB.accessToken,
    `/api/v1/sales/${sale.id}/payments?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(foreign.status, 404);

  const crossShop = await get(
    ownerA.accessToken,
    `/api/v1/sales/${sale.id}/payments?businessId=${bizA.id}&shopId=${shopA2.id}`
  );
  assert.equal(crossShop.status, 404);

  await assert.rejects(
    () => listSalePayments(ownerA.user.id, bizA.id, shopA.id, "not-an-objectid"),
    /Sale not found/
  );
});

test("sale payment: a settled invoice can no longer be voided (05.09 composes)", async () => {
  const { sale, accountId } = await creditSale(5000);
  assert.equal((await post(ownerA.accessToken, payPath(sale.id), payBody(accountId, 2000))).status, 201);

  await assert.rejects(
    () => voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id),
    /payment/i,
    "a document with settlement payments is refused rather than double-refunded"
  );
  assert.equal((await Sale.findById(oid(sale.id)))!.status, "COMPLETED");
});

test("sale payment: unauthenticated settlement requests are 401", async () => {
  const res = await request(app)
    .post(payPath(new mongoose.Types.ObjectId().toString()))
    .send({ businessId: bizA.id, shopId: shopA.id, amount: 100 });
  assert.equal(res.status, 401);
  const list = await request(app).get(
    `/api/v1/sales/${new mongoose.Types.ObjectId()}/payments?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(list.status, 401);
});
