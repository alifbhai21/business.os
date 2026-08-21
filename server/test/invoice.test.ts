import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Sale } from "../src/models/Sale";
import { Purchase } from "../src/models/Purchase";
import { Product } from "../src/models/Product";
import { Customer } from "../src/models/Customer";
import { Supplier } from "../src/models/Supplier";
import { Account } from "../src/models/Account";
import { Business } from "../src/models/Business";
import { AuditLog } from "../src/models/AuditLog";
import { JournalEntry } from "../src/models/JournalEntry";
import { BusinessCounter } from "../src/models/BusinessCounter";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { createSale } from "../src/services/sale.service";
import { createPurchase } from "../src/services/purchase.service";
import { voidSale } from "../src/services/void.service";
import {
  serializeSaleInvoice,
  normalizeInvoiceType,
  getSaleInvoice,
  getPurchaseInvoice,
  listSaleInvoices,
} from "../src/services/invoice.service";
import { AccountType } from "../src/config/accounts";

const DEV = { deviceId: "inv-dev", deviceName: "InvTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Invoice User",
    email: `iv${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Invoice Business", type: "retail", ...over });
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
      branchCode: `IV-${Math.random().toString(36).slice(2, 8)}`,
      ...over,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

/**
 * Products, parties, accounts and the sale/purchase documents themselves are
 * seeded through the models and the verified 05.07/05.08 services so only the
 * invoice endpoints are exercised over HTTP — that keeps this file under the
 * global rate limiter (100 req/min).
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

const oid = (id: string) => new mongoose.Types.ObjectId(id);

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
let regBiz: any;
let regShop: any;

before(async () => {
  await connectTestDb("business-os-test-invoice");
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
    role: "Viewer",
    status: "ACTIVE",
    permissions: [],
  });
  // A dedicated tenant for the register tests so document counts are exact.
  regBiz = await createBusiness(ownerA.accessToken, { name: "Register Business" });
  regShop = await createShop(ownerA.accessToken, regBiz.id, { name: "RegShop" });
});

after(async () => {
  await disconnectTestDb();
});

/**
 * A credit sale needs a customer (05.07 refuses a walk-in with an outstanding
 * due), so seeded sales get one unless the test supplies its own party.
 */
const defaultCustomers = new Map<string, string>();
async function defaultCustomerFor(businessId: string): Promise<string> {
  const cached = defaultCustomers.get(businessId);
  if (cached) return cached;
  const customer = await makeCustomer(businessId, { name: "Default Buyer" });
  defaultCustomers.set(businessId, String(customer._id));
  return String(customer._id);
}

/** A sale in shop A through the verified 05.07 service. */
async function seedSale(over: Record<string, unknown> = {}, shopId = shopA.id) {
  const party =
    over.customerId || over.customerName
      ? {}
      : { customerId: await defaultCustomerFor(bizA.id) };
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId,
    items: [],
    ...party,
    ...over,
  } as never);
  return sale;
}

/** A purchase in shop A through the verified 05.08 service. */
async function seedPurchase(over: Record<string, unknown> = {}, shopId = shopA.id) {
  const { purchase } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId,
    items: [],
    ...over,
  } as never);
  return purchase;
}

function invoicePath(type: string, id: string, businessId: string, shopId: string) {
  return `/api/v1/invoices/${type}/${id}?businessId=${businessId}&shopId=${shopId}`;
}

// ── Sale invoice ─────────────────────────────────────────────────────────────

test("invoice: a sale invoice reproduces the stored invoiceNo and the header blocks", async () => {
  await Business.updateOne(
    { _id: oid(bizA.id) },
    { address: "12 Ledger Road", phone: "0123456789", email: "biz@example.com", logo: null }
  );
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const customer = await makeCustomer(bizA.id, { phone: "0177777777", address: "Buyer Lane" });
  const accountId = await makeAccount(bizA.id, shopA.id);
  const sale = await seedSale({
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 2, unitPrice: 5000 }],
    paidAmount: 10000,
    accountId,
  });

  const res = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(res.status, 200);
  const inv = res.body.data;

  assert.equal(inv.type, "SALE");
  assert.equal(inv.documentId, sale.id);
  // Exactly what the 05.07 finalizer stored — no second numbering scheme.
  assert.equal(inv.invoiceNo, sale.invoiceNo);
  assert.match(inv.invoiceNo, /^INV-\d{4}-.+-\d{4}$/);
  assert.ok(inv.invoiceNo.includes(shopA.branchCode));
  assert.equal(inv.supplierInvoiceNo, null);
  assert.equal(inv.status, "COMPLETED");
  assert.equal(inv.paymentStatus, "PAID");
  assert.equal(inv.currency, "BDT");

  assert.equal(inv.business.id, bizA.id);
  assert.equal(inv.business.address, "12 Ledger Road");
  assert.equal(inv.business.phone, "0123456789");
  assert.equal(inv.shop.id, shopA.id);
  assert.equal(inv.shop.branchCode, shopA.branchCode);

  assert.equal(inv.counterparty.kind, "CUSTOMER");
  assert.equal(inv.counterparty.id, String(customer._id));
  assert.equal(inv.counterparty.name, customer.name);
  assert.equal(inv.counterparty.phone, "0177777777");
  assert.equal(inv.counterparty.address, "Buyer Lane");
});

test("invoice: sale lines and totals are copied from the sale, never re-derived", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20, taxRate: 10 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id);
  const sale = await seedSale({
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 3, unitPrice: 10000, discountAmount: 1000 }],
    discountAmount: 500,
    paidAmount: 10000,
    accountId,
  });

  const res = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(res.status, 200);
  const inv = res.body.data;

  assert.equal(inv.items.length, 1);
  const line = inv.items[0];
  assert.equal(line.productId, String(product._id));
  assert.equal(line.productName, product.name);
  assert.equal(line.qty, 3);
  assert.equal(line.unitPrice, 10000);
  assert.equal(line.discountAmount, 1000);
  assert.equal(line.taxAmount, sale.items[0].taxAmount);
  assert.equal(line.lineTotal, sale.items[0].lineTotal);
  // netAmount is the stored decomposition lineTotal − taxAmount, not qty × price.
  assert.equal(line.netAmount, sale.items[0].lineTotal - sale.items[0].taxAmount);
  // The internal margin snapshot is never shared with the buyer.
  assert.equal("costPrice" in line, false);

  assert.deepEqual(inv.totals, {
    subtotal: sale.subtotal,
    discountAmount: sale.discountAmount,
    taxAmount: sale.taxAmount,
    total: sale.total,
    paidAmount: sale.paidAmount,
    dueAmount: sale.dueAmount,
  });
  // subtotal − discount + tax === total holds on the invoice as posted.
  assert.equal(inv.totals.subtotal - inv.totals.discountAmount + inv.totals.taxAmount, inv.totals.total);
  assert.ok(inv.totals.taxAmount > 0);
  for (const value of Object.values(inv.totals) as number[]) {
    assert.ok(Number.isSafeInteger(value), "every invoice money value stays integer paisa");
  }
});

test("invoice: a partly settled credit sale reports paid, due and PARTIAL", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id);
  const sale = await seedSale({
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 2, unitPrice: 5000 }],
    paidAmount: 4000,
    accountId,
  });
  assert.equal(sale.paymentStatus, "PARTIAL");

  const res = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.paymentStatus, "PARTIAL");
  assert.equal(res.body.data.totals.paidAmount, 4000);
  assert.equal(res.body.data.totals.dueAmount, 6000);
});

test("invoice: a walk-in sale invoice has a null counterparty id", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const accountId = await makeAccount(bizA.id, shopA.id);
  const sale = await seedSale({
    customerName: "Walk-in Buyer",
    items: [{ productId: String(product._id), qty: 1, unitPrice: 3000 }],
    paidAmount: 3000,
    accountId,
  });

  const res = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.counterparty.id, null);
  assert.equal(res.body.data.counterparty.name, "Walk-in Buyer");
  assert.equal(res.body.data.counterparty.kind, "CUSTOMER");
  assert.equal(res.body.data.totals.dueAmount, 0);
});

test("invoice: a later customer rename does not rewrite an issued invoice", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const customer = await makeCustomer(bizA.id, { name: "Original Name" });
  const sale = await seedSale({
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: 4000 }],
  });
  await Customer.updateOne({ _id: customer._id }, { name: "Renamed Later" });

  const res = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.counterparty.name, "Original Name");
});

test("invoice: a DRAFT sale has no invoice yet", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const sale = await seedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 4000 }],
    draft: true,
  });
  assert.equal(sale.status, "DRAFT");
  assert.equal(sale.invoiceNo, null);

  const res = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /draft sale has no invoice/i);
});

test("invoice: a VOIDED sale keeps its invoice and its original number", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const accountId = await makeAccount(bizA.id, shopA.id);
  const sale = await seedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 4000 }],
    paidAmount: 4000,
    accountId,
  });
  await voidSale(ownerA.user.id, bizA.id, shopA.id, sale.id);

  const res = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, "VOIDED");
  assert.equal(res.body.data.invoiceNo, sale.invoiceNo);
  assert.equal(res.body.data.totals.total, sale.total);
});

// ── Purchase invoice ─────────────────────────────────────────────────────────

test("invoice: a purchase invoice reproduces the PUR- number and the supplier block", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 5 });
  const supplier = await makeSupplier(bizA.id, {
    phone: "0188888888",
    company: "Wholesale Ltd",
    address: "Depot Road",
  });
  const accountId = await makeAccount(bizA.id, shopA.id);
  const purchase = await seedPurchase({
    supplierId: String(supplier._id),
    supplierInvoiceNo: "SUP-9001",
    items: [{ productId: String(product._id), qty: 4, unitPrice: 6000 }],
    paidAmount: 10000,
    accountId,
  });

  const res = await get(
    ownerA.accessToken,
    invoicePath("purchase", purchase.id, bizA.id, shopA.id)
  );
  assert.equal(res.status, 200);
  const inv = res.body.data;

  assert.equal(inv.type, "PURCHASE");
  assert.equal(inv.documentId, purchase.id);
  assert.equal(inv.invoiceNo, purchase.invoiceNo);
  assert.match(inv.invoiceNo, /^PUR-\d{4}-.+-\d{4}$/);
  assert.ok(inv.invoiceNo.includes(shopA.branchCode));
  assert.equal(inv.supplierInvoiceNo, "SUP-9001");
  assert.equal(inv.status, "COMPLETED");
  assert.equal(inv.paymentStatus, "PARTIAL");

  assert.equal(inv.counterparty.kind, "SUPPLIER");
  assert.equal(inv.counterparty.id, String(supplier._id));
  assert.equal(inv.counterparty.name, supplier.name);
  assert.equal(inv.counterparty.phone, "0188888888");
  assert.equal(inv.counterparty.company, "Wholesale Ltd");

  assert.deepEqual(inv.totals, {
    subtotal: purchase.subtotal,
    discountAmount: purchase.discountAmount,
    taxAmount: purchase.taxAmount,
    total: purchase.total,
    paidAmount: purchase.paidAmount,
    dueAmount: purchase.dueAmount,
  });
  assert.equal(
    inv.totals.subtotal - inv.totals.discountAmount + inv.totals.taxAmount,
    inv.totals.total
  );
});

test("invoice: purchase lines hide the average-cost machinery", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const supplier = await makeSupplier(bizA.id);
  const purchase = await seedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 5, unitPrice: 2000 }],
    discountAmount: 1000,
  });

  const res = await get(
    ownerA.accessToken,
    invoicePath("purchase", purchase.id, bizA.id, shopA.id)
  );
  assert.equal(res.status, 200);
  const line = res.body.data.items[0];
  assert.equal(line.qty, 5);
  assert.equal(line.unitPrice, 2000);
  assert.equal(line.lineTotal, purchase.items[0].lineTotal);
  assert.equal(line.netAmount, purchase.items[0].lineTotal - purchase.items[0].taxAmount);
  assert.equal("costAmount" in line, false);
  assert.equal("netUnitCost" in line, false);
  // The header discount is reported on the header, not smeared into the lines.
  assert.equal(res.body.data.totals.discountAmount, purchase.discountAmount);
});

test("invoice: a DRAFT purchase has no invoice yet", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const supplier = await makeSupplier(bizA.id);
  const purchase = await seedPurchase({
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: 2000 }],
    draft: true,
  });
  assert.equal(purchase.invoiceNo, null);

  const res = await get(
    ownerA.accessToken,
    invoicePath("purchase", purchase.id, bizA.id, shopA.id)
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /draft purchase has no invoice/i);
});

// ── Numbering ────────────────────────────────────────────────────────────────

test("invoice: sale and purchase numbers run on independent BusinessCounter keys", async () => {
  const biz = await createBusiness(ownerA.accessToken, { name: "Numbering Biz" });
  const shop = await createShop(ownerA.accessToken, biz.id, { name: "NumShop" });
  const product = await Product.create({
    businessId: oid(biz.id),
    name: "NumProduct",
    sellingPrice: 5000,
    purchasePrice: 3000,
    taxRate: 0,
    currentStock: 50,
    avgCost: 0,
    status: "ACTIVE",
  });
  const supplier = await makeSupplier(biz.id);
  const buyer = await defaultCustomerFor(biz.id);

  const s1 = await createSale(ownerA.user.id, {
    businessId: biz.id,
    shopId: shop.id,
    customerId: buyer,
    items: [{ productId: String(product._id), qty: 1, unitPrice: 5000 }],
  } as never);
  const s2 = await createSale(ownerA.user.id, {
    businessId: biz.id,
    shopId: shop.id,
    customerId: buyer,
    items: [{ productId: String(product._id), qty: 1, unitPrice: 5000 }],
  } as never);
  const p1 = await createPurchase(ownerA.user.id, {
    businessId: biz.id,
    shopId: shop.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: 3000 }],
  } as never);

  assert.equal(s1.sale.invoiceNo!.endsWith("-0001"), true);
  assert.equal(s2.sale.invoiceNo!.endsWith("-0002"), true);
  // The purchase register starts at 1 again — a separate counter key.
  assert.equal(p1.purchase.invoiceNo!.endsWith("-0001"), true);
  assert.ok(s1.sale.invoiceNo!.startsWith("INV-"));
  assert.ok(p1.purchase.invoiceNo!.startsWith("PUR-"));

  const saleInv = await getSaleInvoice(ownerA.user.id, biz.id, shop.id, s2.sale.id);
  assert.equal(saleInv.invoiceNo, s2.sale.invoiceNo);
  const purchaseInv = await getPurchaseInvoice(ownerA.user.id, biz.id, shop.id, p1.purchase.id);
  assert.equal(purchaseInv.invoiceNo, p1.purchase.invoiceNo);
});

test("invoice: two shops in one business issue distinct numbers for the same sequence", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const a = await seedSale({ items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }] });
  const b = await seedSale(
    { items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }] },
    shopA2.id
  );

  const invA = await getSaleInvoice(ownerA.user.id, bizA.id, shopA.id, a.id);
  const invB = await getSaleInvoice(ownerA.user.id, bizA.id, shopA2.id, b.id);
  assert.notEqual(invA.invoiceNo, invB.invoiceNo);
  assert.ok(invA.invoiceNo!.includes(shopA.branchCode));
  assert.ok(invB.invoiceNo!.includes(shopA2.branchCode));
  assert.equal(invB.shop.branchCode, shopA2.branchCode);
});

test("invoice: concurrently finalized sales get distinct numbers and each invoice reports its own", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 40 });
  const drafts = await Promise.all([
    seedSale({ items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }], draft: true }),
    seedSale({ items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }], draft: true }),
    seedSale({ items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }], draft: true }),
  ]);
  const { finalizeSale } = await import("../src/services/sale.service");
  const settled = await Promise.allSettled(
    drafts.map((d) => finalizeSale(ownerA.user.id, bizA.id, shopA.id, d.id))
  );
  const ok = settled.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 3, "all three concurrent finalizations succeed");

  const invoices = await Promise.all(
    drafts.map((d) => getSaleInvoice(ownerA.user.id, bizA.id, shopA.id, d.id))
  );
  const numbers = invoices.map((i) => i.invoiceNo);
  assert.equal(new Set(numbers).size, 3, "no two invoices share a number");
  for (const inv of invoices) {
    const stored = await Sale.findById(oid(inv.documentId));
    assert.equal(inv.invoiceNo, stored!.invoiceNo);
  }
});

test("invoice: reading an invoice repeatedly is a pure read — no counter, journal or audit effect", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const accountId = await makeAccount(bizA.id, shopA.id);
  const sale = await seedSale({
    items: [{ productId: String(product._id), qty: 2, unitPrice: 2500 }],
    paidAmount: 5000,
    accountId,
  });

  const counterBefore = await BusinessCounter.find({ businessId: oid(bizA.id) }).lean();
  const journalBefore = await JournalEntry.countDocuments({ businessId: oid(bizA.id) });
  const auditBefore = await AuditLog.countDocuments({ businessId: oid(bizA.id) });
  const updatedAtBefore = (await Sale.findById(oid(sale.id)))!.updatedAt.getTime();

  const first = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  const second = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  const third = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(first.status, 200);
  assert.deepEqual(second.body.data, first.body.data);
  assert.deepEqual(third.body.data, first.body.data);

  const counterAfter = await BusinessCounter.find({ businessId: oid(bizA.id) }).lean();
  assert.deepEqual(
    counterAfter.map((c) => [c.key, c.shopId ? String(c.shopId) : null, c.sequence]),
    counterBefore.map((c) => [c.key, c.shopId ? String(c.shopId) : null, c.sequence]),
    "an invoice read never advances a BusinessCounter"
  );
  assert.equal(await JournalEntry.countDocuments({ businessId: oid(bizA.id) }), journalBefore);
  assert.equal(await AuditLog.countDocuments({ businessId: oid(bizA.id) }), auditBefore);
  assert.equal((await Sale.findById(oid(sale.id)))!.updatedAt.getTime(), updatedAtBefore);
});

// ── Missing documents, malformed ids and unknown types ───────────────────────

test("invoice: an unknown document id is 404", async () => {
  const ghost = new mongoose.Types.ObjectId().toString();
  const sale = await get(ownerA.accessToken, invoicePath("sale", ghost, bizA.id, shopA.id));
  assert.equal(sale.status, 404);
  assert.match(sale.body.error.message, /Sale not found/i);
  const purchase = await get(ownerA.accessToken, invoicePath("purchase", ghost, bizA.id, shopA.id));
  assert.equal(purchase.status, 404);
  assert.match(purchase.body.error.message, /Purchase not found/i);
});

test("invoice: a malformed document id is 404, never a cast error", async () => {
  const res = await get(
    ownerA.accessToken,
    invoicePath("sale", "not-an-objectid", bizA.id, shopA.id)
  );
  assert.equal(res.status, 404);
  const purchase = await get(
    ownerA.accessToken,
    invoicePath("purchase", "12345", bizA.id, shopA.id)
  );
  assert.equal(purchase.status, 404);
});

test("invoice: an unknown invoice type is 404 and reveals nothing", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const sale = await seedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
  });
  const res = await get(ownerA.accessToken, invoicePath("expense", sale.id, bizA.id, shopA.id));
  assert.equal(res.status, 404);
  assert.match(res.body.error.message, /Invoice not found/i);
  assert.throws(() => normalizeInvoiceType("journal"), /Invoice not found/);
  assert.equal(normalizeInvoiceType("sales"), "SALE");
  assert.equal(normalizeInvoiceType("Sale"), "SALE");
  assert.equal(normalizeInvoiceType("PURCHASES"), "PURCHASE");
  assert.equal(normalizeInvoiceType("purchase"), "PURCHASE");
});

test("invoice: the plural and mixed-case type aliases resolve over HTTP", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const sale = await seedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
  });
  const plural = await get(ownerA.accessToken, invoicePath("sales", sale.id, bizA.id, shopA.id));
  assert.equal(plural.status, 200);
  assert.equal(plural.body.data.type, "SALE");
  const mixed = await get(ownerA.accessToken, invoicePath("SaLe", sale.id, bizA.id, shopA.id));
  assert.equal(mixed.status, 200);
  assert.equal(mixed.body.data.documentId, sale.id);
});

// ── Tenant and shop isolation ────────────────────────────────────────────────

test("invoice: business B cannot read business A's sale invoice", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const sale = await seedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
  });

  // B asks within its own scope for A's document.
  const own = await get(userB.accessToken, invoicePath("sale", sale.id, bizB.id, shopB.id));
  assert.equal(own.status, 404);
  // B asks with A's ids — there is no membership, so the business itself is 404.
  const spoof = await get(userB.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(spoof.status, 404);
  assert.match(spoof.body.error.message, /Business not found/i);
});

test("invoice: a foreign shop paired with the caller's business is 404", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const sale = await seedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
  });
  // A's business + B's shop: assertShopAccess refuses the pairing.
  const foreign = await get(ownerA.accessToken, invoicePath("sale", sale.id, bizA.id, shopB.id));
  assert.equal(foreign.status, 404);
  assert.match(foreign.body.error.message, /Shop not found/i);
  // A's own second branch does not own the document.
  const otherBranch = await get(
    ownerA.accessToken,
    invoicePath("sale", sale.id, bizA.id, shopA2.id)
  );
  assert.equal(otherBranch.status, 404);
});

test("invoice: a shop-pinned membership cannot read another branch's invoice", async () => {
  const pinned = await registerUser();
  await BusinessMembership.create({
    userId: oid(pinned.user.id),
    businessId: oid(bizA.id),
    shopId: oid(shopA2.id),
    role: "Manager",
    status: "ACTIVE",
    permissions: [],
  });
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const sale = await seedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
  });

  const res = await get(pinned.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(res.status, 404);
  assert.match(res.body.error.message, /Shop not found/i);
  // Service level too — not only the route middleware.
  await assert.rejects(
    () => getSaleInvoice(pinned.user.id, bizA.id, shopA.id, sale.id),
    /Shop not found/
  );
});

test("invoice: unauthenticated invoice requests are 401", async () => {
  const res = await request(app).get(
    `/api/v1/invoices/sale/${new mongoose.Types.ObjectId()}?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(res.status, 401);
  const register = await request(app).get(`/api/v1/invoices/sales?businessId=${bizA.id}`);
  assert.equal(register.status, 401);
});

test("invoice: a Viewer may read an invoice — read parity with GET /sales/:id", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const sale = await seedSale({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
  });
  await setRole(roleUser.user.id, bizA.id, "Viewer");

  const res = await get(roleUser.accessToken, invoicePath("sale", sale.id, bizA.id, shopA.id));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.invoiceNo, sale.invoiceNo);
});

// ── Registers ────────────────────────────────────────────────────────────────

test("invoice: the sale register lists issued sales newest first and excludes DRAFTs", async () => {
  const product = await Product.create({
    businessId: oid(regBiz.id),
    name: "RegProduct",
    sellingPrice: 1000,
    purchasePrice: 500,
    taxRate: 0,
    currentStock: 100,
    avgCost: 0,
    status: "ACTIVE",
  });
  const customer = await makeCustomer(regBiz.id);
  const mk = (over: Record<string, unknown> = {}) =>
    createSale(ownerA.user.id, {
      businessId: regBiz.id,
      shopId: regShop.id,
      customerId: String(customer._id),
      items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
      ...over,
    } as never);

  const older = await mk({ saleDate: new Date("2026-01-10T10:00:00.000Z").toISOString() });
  const newer = await mk({ saleDate: new Date("2026-03-10T10:00:00.000Z").toISOString() });
  const draft = await mk({ draft: true });

  const res = await get(
    ownerA.accessToken,
    `/api/v1/invoices/sales?businessId=${regBiz.id}&shopId=${regShop.id}`
  );
  assert.equal(res.status, 200);
  const ids = res.body.data.map((r: any) => r.documentId);
  assert.equal(ids.length, 2, "the DRAFT is not an invoice");
  assert.deepEqual(ids, [newer.sale.id, older.sale.id], "newest issued invoice first");
  assert.equal(ids.includes(draft.sale.id), false);

  const row = res.body.data[0];
  assert.equal(row.type, "SALE");
  assert.equal(row.invoiceNo, newer.sale.invoiceNo);
  assert.equal(row.counterpartyName, customer.name);
  assert.equal(row.currency, "BDT");
  assert.equal(row.total, newer.sale.total);
  assert.equal(row.dueAmount, newer.sale.dueAmount);
  assert.deepEqual(res.body.pagination, { total: 2, page: 1, limit: 20, totalPages: 1 });
});

test("invoice: the sale register paginates and filters by status, paymentStatus and date", async () => {
  const base = `/api/v1/invoices/sales?businessId=${regBiz.id}&shopId=${regShop.id}`;

  const page1 = await get(ownerA.accessToken, `${base}&page=1&limit=1`);
  assert.equal(page1.status, 200);
  assert.equal(page1.body.data.length, 1);
  assert.deepEqual(page1.body.pagination, { total: 2, page: 1, limit: 1, totalPages: 2 });
  const page2 = await get(ownerA.accessToken, `${base}&page=2&limit=1`);
  assert.equal(page2.body.data.length, 1);
  assert.notEqual(page2.body.data[0].documentId, page1.body.data[0].documentId);

  // A DRAFT filter cannot smuggle unissued documents into the register.
  const draftFilter = await get(ownerA.accessToken, `${base}&status=DRAFT`);
  assert.equal(draftFilter.status, 200);
  assert.equal(draftFilter.body.data.length, 2);
  assert.equal(
    draftFilter.body.data.every((r: any) => r.status === "COMPLETED"),
    true
  );

  const unpaid = await get(ownerA.accessToken, `${base}&paymentStatus=UNPAID`);
  assert.equal(unpaid.body.data.length, 2);
  const paid = await get(ownerA.accessToken, `${base}&paymentStatus=PAID`);
  assert.equal(paid.body.data.length, 0);

  const ranged = await get(
    ownerA.accessToken,
    `${base}&dateFrom=2026-02-01T00:00:00.000Z&dateTo=2026-04-01T00:00:00.000Z`
  );
  assert.equal(ranged.body.data.length, 1);
  assert.equal(new Date(ranged.body.data[0].date).getUTCMonth(), 2);
});

test("invoice: the purchase register lists issued purchases and excludes DRAFTs", async () => {
  const product = await Product.create({
    businessId: oid(regBiz.id),
    name: "RegPurchaseProduct",
    sellingPrice: 2000,
    purchasePrice: 1000,
    taxRate: 0,
    currentStock: 0,
    avgCost: 0,
    status: "ACTIVE",
  });
  const supplier = await makeSupplier(regBiz.id);
  const mk = (over: Record<string, unknown> = {}) =>
    createPurchase(ownerA.user.id, {
      businessId: regBiz.id,
      shopId: regShop.id,
      supplierId: String(supplier._id),
      items: [{ productId: String(product._id), qty: 2, unitPrice: 1000 }],
      ...over,
    } as never);

  const issued = await mk();
  const draft = await mk({ draft: true });

  const res = await get(
    ownerA.accessToken,
    `/api/v1/invoices/purchases?businessId=${regBiz.id}&shopId=${regShop.id}`
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  const row = res.body.data[0];
  assert.equal(row.type, "PURCHASE");
  assert.equal(row.documentId, issued.purchase.id);
  assert.equal(row.invoiceNo, issued.purchase.invoiceNo);
  assert.ok(row.invoiceNo.startsWith("PUR-"));
  assert.equal(row.counterpartyName, supplier.name);
  assert.equal(row.total, issued.purchase.total);
  assert.notEqual(row.documentId, draft.purchase.id);
});

test("invoice: the registers are tenant and shop scoped", async () => {
  // Business B sees nothing of A's register even though A has issued invoices.
  const foreign = await get(userB.accessToken, `/api/v1/invoices/sales?businessId=${regBiz.id}`);
  assert.equal(foreign.status, 404);
  assert.match(foreign.body.error.message, /Business not found/i);

  const wrongShop = await get(
    ownerA.accessToken,
    `/api/v1/invoices/sales?businessId=${regBiz.id}&shopId=${shopB.id}`
  );
  assert.equal(wrongShop.status, 404);
  assert.match(wrongShop.body.error.message, /Shop not found/i);

  // The other branch of the same business holds no invoices.
  const otherBranch = await get(
    ownerA.accessToken,
    `/api/v1/invoices/sales?businessId=${bizA.id}&shopId=${shopA2.id}`
  );
  assert.equal(otherBranch.status, 200);
  assert.equal(
    otherBranch.body.data.every((r: any) => r.documentId),
    true
  );
  const shopA2Ids = new Set(
    (await Sale.find({ shopId: oid(shopA2.id) })).map((s) => String(s._id))
  );
  for (const row of otherBranch.body.data) {
    assert.ok(shopA2Ids.has(row.documentId), "no row from another branch leaks in");
  }

  // A business-wide membership with no shopId sees every shop it owns.
  const businessWide = await get(ownerA.accessToken, `/api/v1/invoices/sales?businessId=${bizA.id}`);
  assert.equal(businessWide.status, 200);
  assert.ok(businessWide.body.pagination.total >= otherBranch.body.pagination.total);
});

test("invoice: the register requires a businessId", async () => {
  const res = await get(ownerA.accessToken, "/api/v1/invoices/sales");
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /businessId is required/i);
});

// ── Serializer purity ────────────────────────────────────────────────────────

test("invoice: serializeSaleInvoice is pure — it mutates none of its arguments", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const customer = await makeCustomer(bizA.id);
  const sale = await seedSale({
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
  });

  const business = (await Business.findById(oid(bizA.id)))!;
  const shopDoc = (await mongoose.model("Shop").findById(oid(shopA.id))) as any;
  const publicSale = await getSaleInvoice(ownerA.user.id, bizA.id, shopA.id, sale.id);
  const before = JSON.stringify(publicSale);

  const invoice = serializeSaleInvoice(
    { ...sale, saleDate: new Date(sale.saleDate), createdAt: new Date(sale.createdAt) } as never,
    business,
    shopDoc,
    customer
  );
  assert.equal(invoice.invoiceNo, sale.invoiceNo);
  assert.equal(invoice.totals.total, sale.total);
  assert.equal(JSON.stringify(publicSale), before, "no argument was mutated");
  // Calling it twice yields an identical projection.
  const again = serializeSaleInvoice(
    { ...sale, saleDate: new Date(sale.saleDate), createdAt: new Date(sale.createdAt) } as never,
    business,
    shopDoc,
    customer
  );
  assert.deepEqual(again, invoice);
});

test("invoice: a voided sale still appears in the register with status VOIDED", async () => {
  const product = await Product.create({
    businessId: oid(regBiz.id),
    name: "RegVoidProduct",
    sellingPrice: 3000,
    purchasePrice: 1000,
    taxRate: 0,
    currentStock: 10,
    avgCost: 0,
    status: "ACTIVE",
  });
  const { sale } = await createSale(ownerA.user.id, {
    businessId: regBiz.id,
    shopId: regShop.id,
    customerId: await defaultCustomerFor(regBiz.id),
    items: [{ productId: String(product._id), qty: 1, unitPrice: 3000 }],
  } as never);
  await voidSale(ownerA.user.id, regBiz.id, regShop.id, sale.id);

  const { items } = await listSaleInvoices(ownerA.user.id, regBiz.id, regShop.id, {});
  const row = items.find((r) => r.documentId === sale.id);
  assert.ok(row, "a voided invoice is still a fact and stays in the register");
  assert.equal(row!.status, "VOIDED");
  assert.equal(row!.invoiceNo, sale.invoiceNo);
  // Every register row is an issued document with a real number.
  assert.equal(
    items.every((r) => typeof r.invoiceNo === "string" && r.status !== "DRAFT"),
    true
  );
});
