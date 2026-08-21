import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Sale } from "../src/models/Sale";
import { Purchase } from "../src/models/Purchase";
import { StockMovement } from "../src/models/StockMovement";
import { Product } from "../src/models/Product";
import { Customer } from "../src/models/Customer";
import { Supplier } from "../src/models/Supplier";
import { Account } from "../src/models/Account";
import { Business } from "../src/models/Business";
import { AuditLog } from "../src/models/AuditLog";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { createSale } from "../src/services/sale.service";
import { createPurchase } from "../src/services/purchase.service";
import { recordPayment } from "../src/services/payment.service";
import { voidSale, voidPurchase, calcAvgCostAfterVoid } from "../src/services/void.service";
import { saleVoidSchema } from "../src/validation/sale.schemas";
import { purchaseVoidSchema } from "../src/validation/purchase.schemas";
import { AccountType, JOURNAL_ACCOUNTS } from "../src/config/accounts";

const DEV = { deviceId: "void-dev", deviceName: "VoidTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Void User",
    email: `vd${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Void Business", type: "retail", ...over });
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
      branchCode: `VD-${Math.random().toString(36).slice(2)}`,
      ...over,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

/**
 * Products, customers, suppliers and accounts are seeded through the models and
 * the sale/purchase documents through their services, so only the void
 * endpoints are exercised over HTTP — that keeps this file under the global
 * rate limiter (100 req/min).
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

async function makeCustomer(businessId: string, over: Record<string, unknown> = {}) {
  return Customer.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `C-${Math.random().toString(36).slice(2)}`,
    currentDue: 0,
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

async function makeAccount(
  businessId: string,
  shopId: string,
  balancePaisa = 1000000,
  type: AccountType = "CASH"
) {
  const acct = await Account.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    shopId: new mongoose.Types.ObjectId(shopId),
    name: `Acct-${Math.random().toString(36).slice(2)}`,
    type,
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

function post(token: string, path: string, body: Record<string, unknown>) {
  return request(app).post(path).set("Authorization", `Bearer ${token}`).send(body);
}

const oid = (id: string) => new mongoose.Types.ObjectId(id);

/** Journal entry a source document posted (never the reversal). */
function originalEntry(businessId: string, referenceType: string, referenceId: string) {
  return JournalEntry.findOne({
    businessId: oid(businessId),
    referenceType,
    referenceId: oid(referenceId),
    isReversal: false,
  });
}

/** The reversal written for a source document's journal entry. */
function reversalEntry(originalId: mongoose.Types.ObjectId) {
  return JournalEntry.findOne({ reversesEntryId: originalId, isReversal: true });
}

async function linesOf(entryId: mongoose.Types.ObjectId) {
  const lines = await JournalLine.find({ entryId }).sort({ accountName: 1 });
  return lines.map((l) => ({
    accountName: l.accountName,
    accountType: l.accountType,
    debit: l.debit,
    credit: l.credit,
  }));
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
  await connectTestDb("business-os-test-void");
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
    role: "Manager",
    status: "ACTIVE",
    permissions: [],
  });
});

after(async () => {
  await disconnectTestDb();
});

/** A COMPLETED sale in shop A, created through the verified 05.07 service. */
async function completedSale(over: Record<string, unknown> = {}, shopId = shopA.id) {
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId,
    items: [],
    ...over,
  } as never);
  assert.equal(sale.status, "COMPLETED");
  return sale;
}

/** A COMPLETED purchase in shop A, created through the verified 05.08 service. */
async function completedPurchase(over: Record<string, unknown> = {}, shopId = shopA.id) {
  const { purchase } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId,
    items: [],
    ...over,
  } as never);
  assert.equal(purchase.status, "COMPLETED");
  return purchase;
}

// ── Sale void ────────────────────────────────────────────────────────────────

test("void: sale void restores stock and writes a reversal StockMovement", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const accountId = await makeAccount(bizA.id, shopA.id, 100000);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 4, unitPrice: 2500 }],
    paidAmount: 10000,
    accountId,
  });
  assert.equal((await Product.findById(product._id))!.currentStock, 6);

  const { sale: voided, duplicate } = await voidSale(
    ownerA.user.id,
    bizA.id,
    shopA.id,
    sale.id,
    { reason: "wrong customer" }
  );
  assert.equal(duplicate, false);
  assert.equal(voided.status, "VOIDED");
  assert.equal((await Product.findById(product._id))!.currentStock, 10);

  // The original movement survives; the reversal is a NEW immutable row.
  const original = await StockMovement.findOne({ refType: "SALE", refId: oid(sale.id) });
  assert.ok(original);
  assert.equal(original!.qtyChange, -4);
  assert.equal(original!.prevStock, 10);
  assert.equal(original!.newStock, 6);

  const reversal = await StockMovement.findOne({ refType: "SALE_VOID", refId: oid(sale.id) });
  assert.ok(reversal);
  assert.equal(reversal!.type, "sale_void");
  assert.equal(reversal!.qtyChange, 4);
  assert.equal(reversal!.prevStock, 6);
  assert.equal(reversal!.newStock, 10);
  assert.equal(reversal!.unitCost, original!.unitCost);
  assert.equal(String(reversal!.productId), String(product._id));
  assert.equal(String(reversal!.businessId), bizA.id);
  assert.equal(String(reversal!.shopId), shopA.id);
  assert.equal(String(reversal!.createdBy), ownerA.user.id);
});

test("void: fully paid sale void reverses the account balance", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 2, unitPrice: 3000 }],
    paidAmount: 6000,
    accountId,
  });
  assert.equal((await Account.findById(accountId))!.currentBalance, 56000);
  assert.equal(sale.paymentAccountId, accountId); // snapshot used by the void

  await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id);
  assert.equal((await Account.findById(accountId))!.currentBalance, 50000);
});

test("void: unpaid credit sale void reverses the customer due", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 8 });
  const customer = await makeCustomer(bizA.id, { currentDue: 2000 });
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 3, unitPrice: 4000 }],
    customerId: String(customer._id),
  });
  assert.equal(sale.paymentStatus, "UNPAID");
  assert.equal(sale.dueAmount, 12000);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 14000);

  await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 2000);
  assert.equal((await Product.findById(product._id))!.currentStock, 8);
});

test("void: partially paid sale void reverses both the account and the due", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 20000);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 5, unitPrice: 2000 }],
    customerId: String(customer._id),
    paidAmount: 4000,
    accountId,
  });
  assert.equal(sale.paymentStatus, "PARTIAL");
  assert.equal((await Customer.findById(customer._id))!.currentDue, 6000);
  assert.equal((await Account.findById(accountId))!.currentBalance, 24000);

  await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);
  assert.equal((await Account.findById(accountId))!.currentBalance, 20000);
  assert.equal((await Product.findById(product._id))!.currentStock, 10);
});

test("void: sale keeps its invoiceNo and amounts as the historical record", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 4 });
  const customer = await makeCustomer(bizA.id);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 7000 }],
    customerId: String(customer._id),
  });
  const { sale: voided } = await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id);

  assert.equal(voided.status, "VOIDED");
  assert.equal(voided.invoiceNo, sale.invoiceNo);
  assert.equal(voided.total, sale.total);
  assert.equal(voided.dueAmount, sale.dueAmount);
  assert.equal(voided.items.length, 1);
  // Never physically deleted.
  const stored = await Sale.findById(sale.id);
  assert.ok(stored);
  assert.equal(stored!.status, "VOIDED");
  assert.equal(stored!.invoiceNo, sale.invoiceNo);
});

test("void: sale journal reversal is symmetric and the original is untouched", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 6, taxRate: 10 });
  const accountId = await makeAccount(bizA.id, shopA.id, 100000);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 2, unitPrice: 5000 }],
    paidAmount: 11000,
    accountId,
  });

  const before = await originalEntry(bizA.id, "SALE", sale.id);
  assert.ok(before);
  const beforeLines = await linesOf(before!._id as mongoose.Types.ObjectId);
  assert.equal(beforeLines.length, 3); // Cash / Sales Revenue / Tax Payable

  await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id);

  // Original untouched: same entry, same lines, still not a reversal.
  const after = await originalEntry(bizA.id, "SALE", sale.id);
  assert.ok(after);
  assert.equal(String(after!._id), String(before!._id));
  assert.equal(after!.isReversal, false);
  assert.deepEqual(await linesOf(after!._id as mongoose.Types.ObjectId), beforeLines);

  // Reversal: linked back, mirrored, balanced.
  const rev = await reversalEntry(before!._id as mongoose.Types.ObjectId);
  assert.ok(rev);
  assert.equal(rev!.referenceType, "REVERSAL");
  assert.equal(String(rev!.referenceId), sale.id);
  assert.equal(String(rev!.shopId), shopA.id);
  const revLines = await linesOf(rev!._id as mongoose.Types.ObjectId);
  assert.deepEqual(
    revLines,
    beforeLines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }))
  );
  assert.equal(
    revLines.reduce((s, l) => s + l.debit, 0),
    revLines.reduce((s, l) => s + l.credit, 0)
  );
  assert.equal(revLines.reduce((s, l) => s + l.debit, 0), 11000);
  const cash = revLines.find((l) => l.accountName === JOURNAL_ACCOUNTS.CASH);
  assert.equal(cash!.credit, 11000); // cash went back out
});

test("void: SALE_VOIDED audit log records the reversal reference", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 3 });
  const customer = await makeCustomer(bizA.id);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 2500 }],
    customerId: String(customer._id),
  });
  await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id, { reason: "duplicate entry" });

  const log = await AuditLog.findOne({
    businessId: oid(bizA.id),
    action: "SALE_VOIDED",
    details: { $regex: sale.id },
  });
  assert.ok(log);
  assert.equal(String(log!.userId), ownerA.user.id);
  const details = JSON.parse(log!.details as string);
  assert.equal(details.saleId, sale.id);
  assert.equal(details.invoiceNo, sale.invoiceNo);
  assert.equal(details.shopId, shopA.id);
  assert.equal(details.customerId, String(customer._id));
  assert.equal(details.total, 2500);
  assert.equal(details.dueAmount, 2500);
  assert.equal(details.reason, "duplicate entry");
  const original = await originalEntry(bizA.id, "SALE", sale.id);
  assert.equal(details.originalEntryId, String(original!._id));
  const rev = await reversalEntry(original!._id as mongoose.Types.ObjectId);
  assert.equal(details.reversalEntryId, String(rev!._id));
  // The finalize audit entry is still there — void never rewrites history.
  assert.ok(
    await AuditLog.findOne({
      businessId: oid(bizA.id),
      action: "SALE_FINALIZED",
      details: { $regex: sale.id },
    })
  );
});

test("void: a DRAFT sale cannot be voided", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const { sale: draft } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
    draft: true,
  });
  await assert.rejects(
    () => voidSale(ownerA.user.id, bizA.id, shopA.id, draft.id),
    /only a completed sale can be voided/i
  );
  const stored = await Sale.findById(draft.id);
  assert.equal(stored!.status, "DRAFT");
  assert.equal((await Product.findById(product._id))!.currentStock, 5);
});

test("void: unknown and malformed sale ids are 404, never a leak", async () => {
  await assert.rejects(
    () => voidSale(ownerA.user.id, bizA.id, shopA.id, new mongoose.Types.ObjectId().toString()),
    /sale not found/i
  );
  await assert.rejects(
    () => voidSale(ownerA.user.id, bizA.id, shopA.id, "not-an-objectid"),
    /sale not found/i
  );
});

test("void: voiding a sale twice applies the reversal exactly once", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 9 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 30000);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 4, unitPrice: 2000 }],
    customerId: String(customer._id),
    paidAmount: 3000,
    accountId,
  });

  const first = await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id);
  assert.equal(first.duplicate, false);
  const second = await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id);
  assert.equal(second.duplicate, true);
  assert.equal(second.sale.status, "VOIDED");
  assert.equal(second.sale.invoiceNo, sale.invoiceNo);

  assert.equal((await Product.findById(product._id))!.currentStock, 9); // not 13
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);
  assert.equal((await Account.findById(accountId))!.currentBalance, 30000);
  assert.equal(await StockMovement.countDocuments({ refType: "SALE_VOID", refId: oid(sale.id) }), 1);
  const original = await originalEntry(bizA.id, "SALE", sale.id);
  assert.equal(
    await JournalEntry.countDocuments({ reversesEntryId: original!._id }),
    1
  );
  assert.equal(
    await AuditLog.countDocuments({ action: "SALE_VOIDED", details: { $regex: sale.id } }),
    1
  );
});

test("void: concurrent double void applies the reversal exactly once", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 7 });
  const customer = await makeCustomer(bizA.id);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 3, unitPrice: 1500 }],
    customerId: String(customer._id),
  });

  const results = await Promise.allSettled([
    voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id),
    voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id),
  ]);
  assert.ok(results.some((r) => r.status === "fulfilled"));

  assert.equal((await Product.findById(product._id))!.currentStock, 7);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);
  assert.equal(await StockMovement.countDocuments({ refType: "SALE_VOID", refId: oid(sale.id) }), 1);
  const original = await originalEntry(bizA.id, "SALE", sale.id);
  assert.equal(await JournalEntry.countDocuments({ reversesEntryId: original!._id }), 1);
  assert.equal((await Sale.findById(sale.id))!.status, "VOIDED");
});

test("void: multi-line sale void restores every line", async () => {
  const p1 = await makeProduct(bizA.id, { currentStock: 10 });
  const p2 = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const sale = await completedSale({
    items: [
      { productId: String(p1._id), qty: 4, unitPrice: 1000 },
      { productId: String(p2._id), qty: 7, unitPrice: 2000 },
    ],
    customerId: String(customer._id),
  });
  assert.equal((await Product.findById(p1._id))!.currentStock, 6);
  assert.equal((await Product.findById(p2._id))!.currentStock, 13);

  await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id);
  assert.equal((await Product.findById(p1._id))!.currentStock, 10);
  assert.equal((await Product.findById(p2._id))!.currentStock, 20);
  assert.equal(await StockMovement.countDocuments({ refType: "SALE_VOID", refId: oid(sale.id) }), 2);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 0);
});

test("void: a sale with recorded settlement payments is refused", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 6 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 10000);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 2, unitPrice: 5000 }],
    customerId: String(customer._id),
  });

  await recordPayment(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    type: "customer_payment",
    customerId: String(customer._id),
    saleId: sale.id,
    amount: 4000,
    method: "CASH",
    accountId,
    idempotencyKey: `void-settle-${sale.id}`,
  });

  await assert.rejects(
    () => voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id),
    /recorded payments/i
  );
  // Nothing moved: the sale is still COMPLETED and stock is untouched.
  assert.equal((await Sale.findById(sale.id))!.status, "COMPLETED");
  assert.equal((await Product.findById(product._id))!.currentStock, 4);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 6000);
  assert.equal((await Account.findById(accountId))!.currentBalance, 14000);
  assert.equal(await StockMovement.countDocuments({ refType: "SALE_VOID", refId: oid(sale.id) }), 0);
});

/**
 * Fault injection: the cash taken at sale time has since been spent, so the
 * guarded account decrement aborts the void AFTER stock and the customer due
 * have already been reversed inside the transaction.
 */
test("void: sale void rolls back completely when the account cannot be debited", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 12 });
  const customer = await makeCustomer(bizA.id, { currentDue: 1000 });
  const accountId = await makeAccount(bizA.id, shopA.id, 0);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 5, unitPrice: 2000 }],
    customerId: String(customer._id),
    paidAmount: 6000,
    accountId,
  });
  assert.equal((await Product.findById(product._id))!.currentStock, 7);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 5000);

  // The money left the till through another (unrelated) transaction.
  await Account.updateOne({ _id: oid(accountId) }, { $set: { currentBalance: 500 } });

  const auditBefore = await AuditLog.countDocuments({
    businessId: oid(bizA.id),
    action: "SALE_VOIDED",
  });

  await assert.rejects(
    () => voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id),
    /insufficient account balance/i
  );

  // Every earlier step of the transaction is gone.
  assert.equal((await Product.findById(product._id))!.currentStock, 7);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 5000);
  assert.equal((await Account.findById(accountId))!.currentBalance, 500);
  assert.equal(await StockMovement.countDocuments({ refType: "SALE_VOID", refId: oid(sale.id) }), 0);
  const stored = await Sale.findById(sale.id);
  assert.equal(stored!.status, "COMPLETED");
  const original = await originalEntry(bizA.id, "SALE", sale.id);
  assert.equal(await JournalEntry.countDocuments({ reversesEntryId: original!._id }), 0);
  assert.equal(
    await AuditLog.countDocuments({ businessId: oid(bizA.id), action: "SALE_VOIDED" }),
    auditBefore
  );
});

test("void: sale void is refused when the customer due was already settled down", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 5000);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 5, unitPrice: 2000 }],
    customerId: String(customer._id),
  });
  assert.equal((await Customer.findById(customer._id))!.currentDue, 10000);

  // A general customer payment (not linked to this sale) settles part of it.
  await recordPayment(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    type: "customer_payment",
    customerId: String(customer._id),
    amount: 6000,
    method: "CASH",
    accountId,
    idempotencyKey: `void-generic-${sale.id}`,
  });
  assert.equal((await Customer.findById(customer._id))!.currentDue, 4000);

  await assert.rejects(
    () => voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id),
    /reverse the customer payment first/i
  );
  // The stock restore that ran before the due guard is rolled back.
  assert.equal((await Product.findById(product._id))!.currentStock, 5);
  assert.equal((await Customer.findById(customer._id))!.currentDue, 4000);
  assert.equal((await Sale.findById(sale.id))!.status, "COMPLETED");
  assert.equal(await StockMovement.countDocuments({ refType: "SALE_VOID", refId: oid(sale.id) }), 0);
});

test("void: cross-tenant and cross-shop sale void attempts are 404", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 6 });
  const customer = await makeCustomer(bizA.id);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 2, unitPrice: 1000 }],
    customerId: String(customer._id),
  });

  // Another tenant cannot void business A's sale.
  const foreign = await post(userB.accessToken, `/api/v1/sales/${sale.id}/void`, {
    businessId: bizA.id,
    shopId: shopA.id,
  });
  assert.equal(foreign.status, 404);

  // Business A paired with business B's shop.
  const crossShop = await post(ownerA.accessToken, `/api/v1/sales/${sale.id}/void`, {
    businessId: bizA.id,
    shopId: shopB.id,
  });
  assert.equal(crossShop.status, 404);

  // A shop of business A that does not own the sale.
  const otherShop = await post(ownerA.accessToken, `/api/v1/sales/${sale.id}/void`, {
    businessId: bizA.id,
    shopId: shopA2.id,
  });
  assert.equal(otherShop.status, 404);

  assert.equal((await Sale.findById(sale.id))!.status, "COMPLETED");
  assert.equal((await Product.findById(product._id))!.currentStock, 4);
});

test("void: business A cannot void business B's sale even within its own scope", async () => {
  const foreignProduct = await makeProduct(bizB.id, { currentStock: 5 });
  const foreignAccount = await makeAccount(bizB.id, shopB.id, 5000);
  const { sale: foreignSale } = await createSale(userB.user.id, {
    businessId: bizB.id,
    shopId: shopB.id,
    items: [{ productId: String(foreignProduct._id), qty: 2, unitPrice: 1000 }],
    paidAmount: 2000,
    accountId: foreignAccount,
  });
  assert.equal(foreignSale.status, "COMPLETED");

  await assert.rejects(
    () => voidSale(ownerA.user.id, bizA.id, shopA.id, foreignSale.id),
    /sale not found/i
  );
  assert.equal((await Sale.findById(foreignSale.id))!.status, "COMPLETED");
  assert.equal((await Product.findById(foreignProduct._id))!.currentStock, 3);
});

test("void: Owner, Admin and Manager may void a sale over HTTP", async () => {
  for (const role of ["Owner", "Admin", "Manager"]) {
    await setRole(roleUser.user.id, bizA.id, role);
    const product = await makeProduct(bizA.id, { currentStock: 4 });
    const customer = await makeCustomer(bizA.id);
    const sale = await completedSale({
      items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
      customerId: String(customer._id),
    });
    const res = await post(roleUser.accessToken, `/api/v1/sales/${sale.id}/void`, {
      businessId: bizA.id,
      shopId: shopA.id,
    });
    assert.equal(res.status, 200, `role ${role} should be allowed (got ${res.status})`);
    assert.equal(res.body.data.status, "VOIDED");
    assert.equal(res.body.data.duplicate, false);
    assert.equal((await Product.findById(product._id))!.currentStock, 4);
  }
});

test("void: Salesperson, Accountant, Inventory Manager and Viewer cannot void a sale", async () => {
  for (const role of ["Salesperson", "Accountant", "Inventory Manager", "Viewer"]) {
    await setRole(roleUser.user.id, bizA.id, role);
    const product = await makeProduct(bizA.id, { currentStock: 4 });
    const customer = await makeCustomer(bizA.id);
    const sale = await completedSale({
      items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
      customerId: String(customer._id),
    });
    const res = await post(roleUser.accessToken, `/api/v1/sales/${sale.id}/void`, {
      businessId: bizA.id,
      shopId: shopA.id,
    });
    assert.equal(res.status, 403, `role ${role} should be denied`);
    assert.equal((await Sale.findById(sale.id))!.status, "COMPLETED");
    assert.equal((await Product.findById(product._id))!.currentStock, 3);
  }
});

test("void: sale void RBAC is enforced at the service level, not just the route", async () => {
  await setRole(roleUser.user.id, bizA.id, "Salesperson");
  const product = await makeProduct(bizA.id, { currentStock: 4 });
  const customer = await makeCustomer(bizA.id);
  const sale = await completedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
    customerId: String(customer._id),
  });
  await assert.rejects(
    () => voidSale(roleUser.user.id, bizA.id, shopA.id, sale.id),
    /insufficient role/i
  );
  assert.equal((await Sale.findById(sale.id))!.status, "COMPLETED");
  assert.equal((await Product.findById(product._id))!.currentStock, 3);
  await setRole(roleUser.user.id, bizA.id, "Manager");
});

test("void: the void body is strictly validated", () => {
  const base = { businessId: bizA.id, shopId: shopA.id };
  for (const schema of [saleVoidSchema, purchaseVoidSchema]) {
    assert.equal(schema.safeParse(base).success, true);
    assert.equal(schema.safeParse({ ...base, reason: "mistake" }).success, true);
    assert.equal(schema.safeParse({ shopId: shopA.id }).success, false);
    assert.equal(schema.safeParse({ businessId: bizA.id }).success, false);
    // A client must not be able to steer the reversal.
    assert.equal(schema.safeParse({ ...base, accountId: bizA.id }).success, false);
    assert.equal(schema.safeParse({ ...base, paidAmount: 0 }).success, false);
    assert.equal(schema.safeParse({ ...base, status: "COMPLETED" }).success, false);
    assert.equal(schema.safeParse({ ...base, currentStock: 5 }).success, false);
    assert.equal(schema.safeParse({ ...base, reason: "x".repeat(501) }).success, false);
  }
});

// ── Purchase void ────────────────────────────────────────────────────────────

test("void: calcAvgCostAfterVoid derives the restored cost from inventory value", () => {
  // 20 units at 5000 less a 10-unit receipt worth 60000 → 40000 / 10 = 4000
  assert.equal(calcAvgCostAfterVoid(20, 5000, 10, 60000), 4000);
  // Rounding drift is absorbed: 4 × 1001 − 1003 = 3001 over 3 → 1000
  assert.equal(calcAvgCostAfterVoid(4, 1001, 1, 1003), 1000);
  // Nothing left in stock → the average is undefined, so it collapses to 0
  assert.equal(calcAvgCostAfterVoid(3, 1000, 3, 3000), 0);
  assert.equal(calcAvgCostAfterVoid(10, 5000, 10, 50000), 0);
  // Value already consumed by later cheaper receipts/sales → clamped, never negative
  assert.equal(calcAvgCostAfterVoid(5, 2500, 5, 15000), 0);
  assert.equal(calcAvgCostAfterVoid(8, 1000, 2, 9000), 0);
  assert.throws(() => calcAvgCostAfterVoid(10, 1000, 0, 1000), /qty must be > 0/i);
});

test("void: purchase void removes the received stock and restores avgCost exactly", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 10, avgCost: 4000 });
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 10, unitPrice: 6000 }],
  });
  let fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 20);
  assert.equal(fresh!.avgCost, 5000); // (10×4000 + 60000) / 20

  const { purchase: voided, duplicate } = await voidPurchase(
    ownerA.user.id,
    bizA.id,
    shopA.id,
    purchase.id
  );
  assert.equal(duplicate, false);
  assert.equal(voided.status, "VOIDED");
  fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 10);
  assert.equal(fresh!.avgCost, 4000); // exactly back to the pre-purchase average
});

test("void: purchase void writes a purchase_void reversal movement", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 6, avgCost: 1000 });
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 4, unitPrice: 2500 }],
  });

  await voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id);

  const original = await StockMovement.findOne({ refType: "PURCHASE", refId: oid(purchase.id) });
  assert.ok(original);
  assert.equal(original!.qtyChange, 4);
  assert.equal(original!.newStock, 10);

  const reversal = await StockMovement.findOne({
    refType: "PURCHASE_VOID",
    refId: oid(purchase.id),
  });
  assert.ok(reversal);
  assert.equal(reversal!.type, "purchase_void");
  assert.equal(reversal!.qtyChange, -4);
  assert.equal(reversal!.prevStock, 10);
  assert.equal(reversal!.newStock, 6);
  assert.equal(reversal!.unitCost, 2500);
  assert.equal(String(reversal!.shopId), shopA.id);
});

test("void: unpaid purchase void reverses the supplier payable", async () => {
  const supplier = await makeSupplier(bizA.id, { currentPayable: 3000 });
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 5, unitPrice: 2000 }],
  });
  assert.equal(purchase.paymentStatus, "UNPAID");
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 13000);

  await voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 3000);
  assert.equal((await Product.findById(product._id))!.currentStock, 0);
});

test("void: fully paid purchase void refunds the original account", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 4, unitPrice: 2500 }],
    paidAmount: 10000,
    accountId,
  });
  assert.equal(purchase.paymentStatus, "PAID");
  assert.equal(purchase.paymentAccountId, accountId);
  assert.equal((await Account.findById(accountId))!.currentBalance, 40000);

  await voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id);
  assert.equal((await Account.findById(accountId))!.currentBalance, 50000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
});

test("void: partially paid purchase void reverses the account and the payable", async () => {
  const supplier = await makeSupplier(bizA.id, { currentPayable: 1000 });
  const product = await makeProduct(bizA.id, { currentStock: 2, avgCost: 3000 });
  const accountId = await makeAccount(bizA.id, shopA.id, 30000);
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 8, unitPrice: 2000 }],
    paidAmount: 6000,
    accountId,
  });
  assert.equal(purchase.paymentStatus, "PARTIAL");
  assert.equal((await Account.findById(accountId))!.currentBalance, 24000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 11000);

  await voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id);
  assert.equal((await Account.findById(accountId))!.currentBalance, 30000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 1000);
  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 2);
  assert.equal(fresh!.avgCost, 3000);
});

test("void: purchase keeps its invoiceNo and the journal reversal is symmetric", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 10 });
  const accountId = await makeAccount(bizA.id, shopA.id, 100000);
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 10, unitPrice: 5000 }],
    paidAmount: 20000,
    accountId,
  });

  const before = await originalEntry(bizA.id, "PURCHASE", purchase.id);
  assert.ok(before);
  const beforeLines = await linesOf(before!._id as mongoose.Types.ObjectId);
  assert.equal(beforeLines.length, 4); // Inventory / Tax Receivable / Cash / Supplier Payable

  const { purchase: voided } = await voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id);
  assert.equal(voided.status, "VOIDED");
  assert.equal(voided.invoiceNo, purchase.invoiceNo);
  assert.match(voided.invoiceNo as string, /^PUR-/);

  const after = await originalEntry(bizA.id, "PURCHASE", purchase.id);
  assert.equal(String(after!._id), String(before!._id));
  assert.equal(after!.isReversal, false);
  assert.deepEqual(await linesOf(after!._id as mongoose.Types.ObjectId), beforeLines);

  const rev = await reversalEntry(before!._id as mongoose.Types.ObjectId);
  assert.ok(rev);
  assert.equal(rev!.referenceType, "REVERSAL");
  assert.equal(String(rev!.referenceId), purchase.id);
  const revLines = await linesOf(rev!._id as mongoose.Types.ObjectId);
  assert.deepEqual(
    revLines,
    beforeLines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }))
  );
  const inventory = revLines.find((l) => l.accountName === JOURNAL_ACCOUNTS.INVENTORY);
  assert.equal(inventory!.credit, 50000); // inventory asset released
  const payable = revLines.find((l) => l.accountName === JOURNAL_ACCOUNTS.SUPPLIER_PAYABLE);
  assert.equal(payable!.debit, 35000);
  assert.equal(
    revLines.reduce((s, l) => s + l.debit, 0),
    revLines.reduce((s, l) => s + l.credit, 0)
  );
  assert.equal(revLines.reduce((s, l) => s + l.debit, 0), 55000);
});

test("void: PURCHASE_VOIDED audit log records the reversal reference", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 2, unitPrice: 3000 }],
  });
  await voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id, { reason: "wrong supplier" });

  const log = await AuditLog.findOne({
    businessId: oid(bizA.id),
    action: "PURCHASE_VOIDED",
    details: { $regex: purchase.id },
  });
  assert.ok(log);
  assert.equal(String(log!.userId), ownerA.user.id);
  const details = JSON.parse(log!.details as string);
  assert.equal(details.purchaseId, purchase.id);
  assert.equal(details.invoiceNo, purchase.invoiceNo);
  assert.equal(details.shopId, shopA.id);
  assert.equal(details.supplierId, String(supplier._id));
  assert.equal(details.total, 6000);
  assert.equal(details.reason, "wrong supplier");
  const original = await originalEntry(bizA.id, "PURCHASE", purchase.id);
  assert.equal(details.originalEntryId, String(original!._id));
  assert.ok(
    await AuditLog.findOne({ action: "PURCHASE_FINALIZED", details: { $regex: purchase.id } })
  );
});

test("void: a DRAFT purchase cannot be voided", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 4 });
  const { purchase: draft } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
    draft: true,
  });
  await assert.rejects(
    () => voidPurchase(ownerA.user.id, bizA.id, shopA.id, draft.id),
    /only a completed purchase can be voided/i
  );
  assert.equal((await Purchase.findById(draft.id))!.status, "DRAFT");
  assert.equal((await Product.findById(product._id))!.currentStock, 4);
});

test("void: unknown and malformed purchase ids are 404", async () => {
  await assert.rejects(
    () =>
      voidPurchase(ownerA.user.id, bizA.id, shopA.id, new mongoose.Types.ObjectId().toString()),
    /purchase not found/i
  );
  await assert.rejects(
    () => voidPurchase(ownerA.user.id, bizA.id, shopA.id, "nope"),
    /purchase not found/i
  );
});

test("void: voiding a purchase twice applies the reversal exactly once", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 5, avgCost: 2000 });
  const accountId = await makeAccount(bizA.id, shopA.id, 20000);
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 5, unitPrice: 4000 }],
    paidAmount: 5000,
    accountId,
  });

  const first = await voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id);
  assert.equal(first.duplicate, false);
  const second = await voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id);
  assert.equal(second.duplicate, true);
  assert.equal(second.purchase.status, "VOIDED");
  assert.equal(second.purchase.invoiceNo, purchase.invoiceNo);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 5); // not 0
  assert.equal(fresh!.avgCost, 2000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
  assert.equal((await Account.findById(accountId))!.currentBalance, 20000);
  assert.equal(
    await StockMovement.countDocuments({ refType: "PURCHASE_VOID", refId: oid(purchase.id) }),
    1
  );
  const original = await originalEntry(bizA.id, "PURCHASE", purchase.id);
  assert.equal(await JournalEntry.countDocuments({ reversesEntryId: original!._id }), 1);
  assert.equal(
    await AuditLog.countDocuments({ action: "PURCHASE_VOIDED", details: { $regex: purchase.id } }),
    1
  );
});

test("void: concurrent purchase void applies the reversal exactly once", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 3, avgCost: 1000 });
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 3, unitPrice: 2000 }],
  });

  const results = await Promise.allSettled([
    voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id),
    voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id),
  ]);
  assert.ok(results.some((r) => r.status === "fulfilled"));

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 3);
  assert.equal(fresh!.avgCost, 1000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
  assert.equal(
    await StockMovement.countDocuments({ refType: "PURCHASE_VOID", refId: oid(purchase.id) }),
    1
  );
  assert.equal((await Purchase.findById(purchase.id))!.status, "VOIDED");
});

test("void: purchase void is refused when the goods were already sold on", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 5, unitPrice: 2000 }],
  });
  assert.equal((await Product.findById(product._id))!.currentStock, 5);

  // Three of the five received units leave on a sale.
  const customer = await makeCustomer(bizA.id);
  await completedSale({
    items: [{ productId: String(product._id), qty: 3, unitPrice: 4000 }],
    customerId: String(customer._id),
  });
  assert.equal((await Product.findById(product._id))!.currentStock, 2);

  await assert.rejects(
    () => voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id),
    /insufficient stock to void this purchase/i
  );
  // Default policy: nothing is unwound rather than inventing negative stock.
  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 2);
  assert.equal(fresh!.avgCost, 2000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 10000);
  assert.equal((await Purchase.findById(purchase.id))!.status, "COMPLETED");
  assert.equal(
    await StockMovement.countDocuments({ refType: "PURCHASE_VOID", refId: oid(purchase.id) }),
    0
  );
});

test("void: allowNegativeStock=true lets a purchase void drive stock negative", async () => {
  const negBiz = await createBusiness(ownerA.accessToken, { name: "Void Neg Stock" });
  const negShop = await createShop(ownerA.accessToken, negBiz.id);
  await Business.updateOne({ _id: oid(negBiz.id) }, { allowNegativeStock: true });
  const supplier = await makeSupplier(negBiz.id);
  const product = await makeProduct(negBiz.id, { currentStock: 0 });

  const { purchase } = await createPurchase(ownerA.user.id, {
    businessId: negBiz.id,
    shopId: negShop.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 5, unitPrice: 2000 }],
  });
  const customer = await makeCustomer(negBiz.id);
  await createSale(ownerA.user.id, {
    businessId: negBiz.id,
    shopId: negShop.id,
    items: [{ productId: String(product._id), qty: 3, unitPrice: 4000 }],
    customerId: String(customer._id),
  });
  assert.equal((await Product.findById(product._id))!.currentStock, 2);

  const { purchase: voided } = await voidPurchase(
    ownerA.user.id,
    negBiz.id,
    negShop.id,
    purchase.id
  );
  assert.equal(voided.status, "VOIDED");
  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, -3);
  assert.equal(fresh!.avgCost, 0); // no stock left to carry an average
  const movement = await StockMovement.findOne({
    refType: "PURCHASE_VOID",
    refId: oid(purchase.id),
  });
  assert.equal(movement!.prevStock, 2);
  assert.equal(movement!.newStock, -3);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
});

test("void: a purchase with recorded settlement payments is refused", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const accountId = await makeAccount(bizA.id, shopA.id, 20000);
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 3, unitPrice: 3000 }],
  });

  await recordPayment(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    type: "supplier_payment",
    supplierId: String(supplier._id),
    purchaseId: purchase.id,
    amount: 5000,
    method: "CASH",
    accountId,
    idempotencyKey: `void-psettle-${purchase.id}`,
  });

  await assert.rejects(
    () => voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id),
    /recorded payments/i
  );
  assert.equal((await Purchase.findById(purchase.id))!.status, "COMPLETED");
  assert.equal((await Product.findById(product._id))!.currentStock, 3);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 4000);
  assert.equal((await Account.findById(accountId))!.currentBalance, 15000);
});

test("void: purchase void is refused when the payable was already settled down", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const accountId = await makeAccount(bizA.id, shopA.id, 20000);
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 4, unitPrice: 2500 }],
  });
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 10000);

  // A general supplier payment (not linked to this purchase) settles part of it.
  await recordPayment(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    type: "supplier_payment",
    supplierId: String(supplier._id),
    amount: 6000,
    method: "CASH",
    accountId,
    idempotencyKey: `void-pgeneric-${purchase.id}`,
  });
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 4000);

  await assert.rejects(
    () => voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id),
    /reverse the supplier payment first/i
  );
  // The stock removal and avgCost rewrite that ran first are rolled back.
  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 4);
  assert.equal(fresh!.avgCost, 2500);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 4000);
  assert.equal((await Purchase.findById(purchase.id))!.status, "COMPLETED");
  assert.equal(
    await StockMovement.countDocuments({ refType: "PURCHASE_VOID", refId: oid(purchase.id) }),
    0
  );
});

/**
 * Fault injection mid-loop: line 1 is unwound successfully, then line 2's stock
 * guard aborts the transaction. Proves line 1's stock AND its avgCost rewrite
 * are rolled back, not compensated.
 */
test("void: a failing second line rolls back the first line's stock and avgCost", async () => {
  const supplier = await makeSupplier(bizA.id, { currentPayable: 500 });
  const p1 = await makeProduct(bizA.id, { currentStock: 10, avgCost: 1000 });
  const p2 = await makeProduct(bizA.id, { currentStock: 0 });
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [
      { productId: String(p1._id), qty: 10, unitPrice: 3000 },
      { productId: String(p2._id), qty: 6, unitPrice: 5000 },
    ],
  });
  const afterPurchaseP1 = await Product.findById(p1._id);
  assert.equal(afterPurchaseP1!.currentStock, 20);
  assert.equal(afterPurchaseP1!.avgCost, 2000); // (10×1000 + 30000) / 20

  // The second line's units are sold on, so voiding cannot un-receive them.
  const customer = await makeCustomer(bizA.id);
  await completedSale({
    items: [{ productId: String(p2._id), qty: 4, unitPrice: 7000 }],
    customerId: String(customer._id),
  });
  assert.equal((await Product.findById(p2._id))!.currentStock, 2);

  await assert.rejects(
    () => voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id),
    /insufficient stock to void this purchase/i
  );

  const p1After = await Product.findById(p1._id);
  assert.equal(p1After!.currentStock, 20); // line 1 not unwound
  assert.equal(p1After!.avgCost, 2000); // avgCost rewrite rolled back too
  assert.equal((await Product.findById(p2._id))!.currentStock, 2);
  assert.equal(
    await StockMovement.countDocuments({ refType: "PURCHASE_VOID", refId: oid(purchase.id) }),
    0
  );
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 60500);
  assert.equal((await Purchase.findById(purchase.id))!.status, "COMPLETED");
});

/**
 * Fault injection at the LATEST point before commit: the journal reversal. The
 * original entry is deleted so `reverseJournal` cannot find it, which aborts the
 * transaction after stock, avgCost, supplier payable AND the account refund have
 * all been written.
 */
test("void: a failing journal reversal rolls back stock, avgCost, payable and account", async () => {
  const supplier = await makeSupplier(bizA.id, { currentPayable: 2000 });
  const product = await makeProduct(bizA.id, { currentStock: 4, avgCost: 1500 });
  const accountId = await makeAccount(bizA.id, shopA.id, 40000);
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 6, unitPrice: 2500 }],
    paidAmount: 5000,
    accountId,
  });
  const afterPurchase = await Product.findById(product._id);
  assert.equal(afterPurchase!.currentStock, 10);
  assert.equal(afterPurchase!.avgCost, 2100); // (4×1500 + 15000) / 10
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 12000);
  assert.equal((await Account.findById(accountId))!.currentBalance, 35000);

  const original = await originalEntry(bizA.id, "PURCHASE", purchase.id);
  assert.ok(original);
  await JournalEntry.deleteOne({ _id: original!._id });

  const auditBefore = await AuditLog.countDocuments({
    businessId: oid(bizA.id),
    action: "PURCHASE_VOIDED",
  });

  await assert.rejects(
    () => voidPurchase(ownerA.user.id, bizA.id, shopA.id, purchase.id),
    /no PURCHASE journal entry was found to reverse/i
  );

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 10);
  assert.equal(fresh!.avgCost, 2100);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 12000);
  assert.equal((await Account.findById(accountId))!.currentBalance, 35000);
  assert.equal((await Purchase.findById(purchase.id))!.status, "COMPLETED");
  assert.equal(
    await StockMovement.countDocuments({ refType: "PURCHASE_VOID", refId: oid(purchase.id) }),
    0
  );
  assert.equal(
    await AuditLog.countDocuments({ businessId: oid(bizA.id), action: "PURCHASE_VOIDED" }),
    auditBefore
  );
});

test("void: cross-tenant and cross-shop purchase void attempts are 404", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 2, unitPrice: 1000 }],
  });

  const foreign = await post(userB.accessToken, `/api/v1/purchases/${purchase.id}/void`, {
    businessId: bizA.id,
    shopId: shopA.id,
  });
  assert.equal(foreign.status, 404);

  const crossShop = await post(ownerA.accessToken, `/api/v1/purchases/${purchase.id}/void`, {
    businessId: bizA.id,
    shopId: shopB.id,
  });
  assert.equal(crossShop.status, 404);

  const otherShop = await post(ownerA.accessToken, `/api/v1/purchases/${purchase.id}/void`, {
    businessId: bizA.id,
    shopId: shopA2.id,
  });
  assert.equal(otherShop.status, 404);

  assert.equal((await Purchase.findById(purchase.id))!.status, "COMPLETED");
  assert.equal((await Product.findById(product._id))!.currentStock, 2);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 2000);
});

test("void: business A cannot void business B's purchase", async () => {
  const foreignSupplier = await makeSupplier(bizB.id);
  const foreignProduct = await makeProduct(bizB.id, { currentStock: 0 });
  const { purchase: foreignPurchase } = await createPurchase(userB.user.id, {
    businessId: bizB.id,
    shopId: shopB.id,
    supplierId: String(foreignSupplier._id),
    items: [{ productId: String(foreignProduct._id), qty: 3, unitPrice: 1000 }],
  });

  await assert.rejects(
    () => voidPurchase(ownerA.user.id, bizA.id, shopA.id, foreignPurchase.id),
    /purchase not found/i
  );
  assert.equal((await Purchase.findById(foreignPurchase.id))!.status, "COMPLETED");
  assert.equal((await Product.findById(foreignProduct._id))!.currentStock, 3);
  assert.equal((await Supplier.findById(foreignSupplier._id))!.currentPayable, 3000);
});

test("void: Manager may void a purchase but Inventory Manager may not", async () => {
  const supplier = await makeSupplier(bizA.id);

  await setRole(roleUser.user.id, bizA.id, "Inventory Manager");
  const blockedProduct = await makeProduct(bizA.id, { currentStock: 0 });
  const blocked = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(blockedProduct._id), qty: 2, unitPrice: 1000 }],
  });
  const denied = await post(roleUser.accessToken, `/api/v1/purchases/${blocked.id}/void`, {
    businessId: bizA.id,
    shopId: shopA.id,
  });
  // Inventory Manager records purchases (05.08) but must not unwind one.
  assert.equal(denied.status, 403);
  assert.equal((await Purchase.findById(blocked.id))!.status, "COMPLETED");
  assert.equal((await Product.findById(blockedProduct._id))!.currentStock, 2);

  await setRole(roleUser.user.id, bizA.id, "Manager");
  const allowedProduct = await makeProduct(bizA.id, { currentStock: 0 });
  const allowed = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(allowedProduct._id), qty: 2, unitPrice: 1000 }],
  });
  const ok = await post(roleUser.accessToken, `/api/v1/purchases/${allowed.id}/void`, {
    businessId: bizA.id,
    shopId: shopA.id,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.status, "VOIDED");
  assert.equal(ok.body.data.duplicate, false);
  assert.equal((await Product.findById(allowedProduct._id))!.currentStock, 0);
});

test("void: purchase void RBAC is enforced at the service level, not just the route", async () => {
  await setRole(roleUser.user.id, bizA.id, "Inventory Manager");
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const purchase = await completedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 2, unitPrice: 1000 }],
  });
  await assert.rejects(
    () => voidPurchase(roleUser.user.id, bizA.id, shopA.id, purchase.id),
    /insufficient role/i
  );
  assert.equal((await Purchase.findById(purchase.id))!.status, "COMPLETED");
  assert.equal((await Product.findById(product._id))!.currentStock, 2);
  await setRole(roleUser.user.id, bizA.id, "Manager");
});

test("void: unauthenticated void requests are 401", async () => {
  const sale = await request(app).post(`/api/v1/sales/${new mongoose.Types.ObjectId()}/void`).send({
    businessId: bizA.id,
    shopId: shopA.id,
  });
  assert.equal(sale.status, 401);
  const purchase = await request(app)
    .post(`/api/v1/purchases/${new mongoose.Types.ObjectId()}/void`)
    .send({ businessId: bizA.id, shopId: shopA.id });
  assert.equal(purchase.status, 401);
});
