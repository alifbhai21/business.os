import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Sale } from "../src/models/Sale";
import { StockMovement } from "../src/models/StockMovement";
import { Product } from "../src/models/Product";
import { Customer } from "../src/models/Customer";
import { Account } from "../src/models/Account";
import { Business } from "../src/models/Business";
import { AuditLog } from "../src/models/AuditLog";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { createSale, finalizeSale } from "../src/services/sale.service";
import { fiscalYearOf, formatDocumentNo } from "../src/utils/invoice";
import { AccountType, JOURNAL_ACCOUNTS } from "../src/config/accounts";

const DEV = { deviceId: "sale-dev", deviceName: "SaleTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Sale User",
    email: `sale${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Sale Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `SL-${Math.random().toString(36).slice(2)}`, ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

/**
 * Products, customers and accounts are seeded straight through the models.
 * Only the sale endpoints themselves are exercised over HTTP, which keeps this
 * file comfortably under the global rate limiter (100 req/min).
 */
async function makeProduct(businessId: string, over: Record<string, unknown> = {}) {
  const product = await Product.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `P-${Math.random().toString(36).slice(2)}`,
    sellingPrice: 10000,
    purchasePrice: 6000,
    taxRate: 10,
    currentStock: 100,
    status: "ACTIVE",
    ...over,
  });
  return product;
}

async function makeCustomer(businessId: string, over: Record<string, unknown> = {}) {
  const customer = await Customer.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `C-${Math.random().toString(36).slice(2)}`,
    currentDue: 0,
    ...over,
  });
  return customer;
}

async function makeAccount(
  businessId: string,
  shopId: string,
  balancePaisa = 0,
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
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { role }
  );
}

function post(token: string, path: string, body: Record<string, unknown>) {
  return request(app).post(path).set("Authorization", `Bearer ${token}`).send(body);
}

function get(token: string, path: string) {
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

function saleBody(businessId: string, shopId: string, over: Record<string, unknown> = {}) {
  return { businessId, shopId, items: [], ...over };
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
  await connectTestDb("business-os-test-sale");
  ownerA = await registerUser();
  bizA = await createBusiness(ownerA.accessToken);
  shopA = await createShop(ownerA.accessToken, bizA.id);
  shopA2 = await createShop(ownerA.accessToken, bizA.id, { name: "Second Branch" });
  userB = await registerUser();
  bizB = await createBusiness(userB.accessToken);
  shopB = await createShop(userB.accessToken, bizB.id);
  roleUser = await registerUser();
  await BusinessMembership.create({
    userId: new mongoose.Types.ObjectId(roleUser.user.id),
    businessId: new mongoose.Types.ObjectId(bizA.id),
    shopId: null,
    role: "Salesperson",
    status: "ACTIVE",
    permissions: [],
  });
});

after(async () => {
  await disconnectTestDb();
});

test("sale: fiscal-year label derives from the business fiscal year setting", () => {
  // "1 July - 30 June" → a sale in August 2026 belongs to fiscal year 2026,
  // a sale in March 2026 belongs to fiscal year 2025.
  assert.equal(fiscalYearOf(new Date("2026-08-20T12:00:00Z"), "1 July - 30 June"), 2026);
  assert.equal(fiscalYearOf(new Date("2026-03-20T12:00:00Z"), "1 July - 30 June"), 2025);
  assert.equal(fiscalYearOf(new Date("2026-03-20T12:00:00Z"), "1 January - 31 December"), 2026);
  assert.equal(formatDocumentNo("INV", 2026, 1), "INV-2026-0001");
  assert.equal(formatDocumentNo("INV", 2026, 42), "INV-2026-0042");
  // invoiceNo is unique per BUSINESS while the counter is per shop, so the
  // shop's (business-unique) branchCode scopes the number.
  assert.equal(formatDocumentNo("INV", 2026, 1, "MAIN"), "INV-2026-MAIN-0001");
  assert.equal(formatDocumentNo("INV", 2026, 7, "WH2"), "INV-2026-WH2-0007");
});

test("sale: create draft — no invoice number, no stock, no financial effect", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 50 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(product._id), qty: 2 }], draft: true })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, "DRAFT");
  assert.equal(res.body.data.invoiceNo, null);
  assert.equal(res.body.data.paymentStatus, "UNPAID");
  assert.equal(res.body.data.total, 22000); // 2 × 10000 + 10% tax
  assert.equal(res.body.data.dueAmount, 22000);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 50); // untouched
  assert.equal(await StockMovement.countDocuments({ refId: new mongoose.Types.ObjectId(res.body.data.id) }), 0);
  assert.equal(
    await JournalEntry.countDocuments({ referenceType: "SALE", referenceId: new mongoose.Types.ObjectId(res.body.data.id) }),
    0
  );

  const log = await AuditLog.findOne({ action: "SALE_CREATED", details: { $regex: res.body.data.id } });
  assert.ok(log);
});

test("sale: finalize cash sale — PAID, stock decreases, account increases", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 40 });
  const accountId = await makeAccount(bizA.id, shopA.id, 5000);
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 2 }],
      paidAmount: 22000,
      accountId,
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, "COMPLETED");
  assert.equal(res.body.data.paymentStatus, "PAID");
  assert.equal(res.body.data.paidAmount, 22000);
  assert.equal(res.body.data.dueAmount, 0);
  assert.match(res.body.data.invoiceNo, /^INV-\d{4}-.+-\d{4}$/);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 38);

  const acct = await Account.findById(accountId);
  assert.equal(acct!.currentBalance, 27000); // 5000 + 22000
});

test("sale: finalize credit sale — UNPAID and customer due increases", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 30 });
  const customer = await makeCustomer(bizA.id, { currentDue: 1000 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 1 }],
      customerId: String(customer._id),
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.paymentStatus, "UNPAID");
  assert.equal(res.body.data.paidAmount, 0);
  assert.equal(res.body.data.dueAmount, 11000);
  assert.equal(res.body.data.customerName, customer.name); // snapshot

  const fresh = await Customer.findById(customer._id);
  assert.equal(fresh!.currentDue, 12000); // 1000 + 11000
});

test("sale: partial payment — PARTIAL status, split between cash and due", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 30 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 0);
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 2 }],
      customerId: String(customer._id),
      paidAmount: 10000,
      accountId,
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.paymentStatus, "PARTIAL");
  assert.equal(res.body.data.paidAmount, 10000);
  assert.equal(res.body.data.dueAmount, 12000);

  const acct = await Account.findById(accountId);
  assert.equal(acct!.currentBalance, 10000);
  const fresh = await Customer.findById(customer._id);
  assert.equal(fresh!.currentDue, 12000);
});

test("sale: overpayment rejected (400)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 30 });
  const accountId = await makeAccount(bizA.id, shopA.id, 0);
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 1 }],
      paidAmount: 99999,
      accountId,
    })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /cannot exceed the sale total/i);
});

test("sale: server recalculates every money field from the product record", async () => {
  const product = await makeProduct(bizA.id, {
    sellingPrice: 10000,
    purchasePrice: 6000,
    taxRate: 10,
    currentStock: 20,
  });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 3, discountAmount: 3000 }],
      discountPercent: 10,
      draft: true,
    })
  );
  assert.equal(res.status, 201);
  const line = res.body.data.items[0];
  assert.equal(line.unitPrice, 10000); // taken from the product
  assert.equal(line.discountAmount, 3000);
  assert.equal(line.taxAmount, 2700); // 10% of (30000 − 3000), rounded per line
  assert.equal(line.lineTotal, 29700); // 27000 + 2700
  assert.equal(line.costPrice, 6000); // snapshot of purchasePrice (avgCost is 0)

  assert.equal(res.body.data.subtotal, 30000);
  // line discount 3000 + header 10% of 27000 = 2700
  assert.equal(res.body.data.discountAmount, 5700);
  assert.equal(res.body.data.taxAmount, 2700);
  assert.equal(res.body.data.total, 27000); // 30000 − 5700 + 2700
});

test("sale: client cannot spoof total", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 1 }],
      total: 1,
      draft: true,
    })
  );
  assert.equal(res.status, 400);
});

test("sale: client cannot spoof tax", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 1, taxAmount: 0 }],
      draft: true,
    })
  );
  assert.equal(res.status, 400);
});

test("sale: client cannot spoof costPrice", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20, purchasePrice: 6000 });
  const spoofed = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 1, costPrice: 1 }],
      draft: true,
    })
  );
  assert.equal(spoofed.status, 400);

  // and the accepted form always snapshots the product's own cost
  const ok = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(product._id), qty: 1 }], draft: true })
  );
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.items[0].costPrice, 6000);
});

test("sale: duplicate productId in items rejected (400)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [
        { productId: String(product._id), qty: 1 },
        { productId: String(product._id), qty: 2 },
      ],
      draft: true,
    })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /duplicate productid/i);
});

test("sale: StockMovement written with prev/new stock and SALE reference", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 25, purchasePrice: 6000 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(product._id), qty: 4 }], customerId: null, paidAmount: 44000, accountId: await makeAccount(bizA.id, shopA.id, 0) })
  );
  assert.equal(res.status, 201);

  const movements = await StockMovement.find({
    refType: "SALE",
    refId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  assert.equal(movements.length, 1);
  const m = movements[0];
  assert.equal(m.type, "sale");
  assert.equal(m.qtyChange, -4);
  assert.equal(m.prevStock, 25);
  assert.equal(m.newStock, 21);
  assert.equal(m.unitCost, 6000);
  assert.equal(String(m.productId), String(product._id));
  assert.equal(String(m.businessId), bizA.id);
  assert.equal(String(m.shopId), shopA.id);
});

test("sale: insufficient stock rejected (400) and nothing is written", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 1 });
  const salesBefore = await Sale.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id) });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(product._id), qty: 5 }], paidAmount: 0, customerId: String((await makeCustomer(bizA.id))._id) })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /insufficient stock/i);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 1);
  assert.equal(
    await Sale.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id) }),
    salesBefore
  );
  assert.equal(await StockMovement.countDocuments({ productId: product._id }), 0);
});

test("sale: allowNegativeStock=true permits stock to go negative", async () => {
  const negBiz = await createBusiness(ownerA.accessToken, { name: "Neg Stock Business" });
  const negShop = await createShop(ownerA.accessToken, negBiz.id);
  await Business.updateOne(
    { _id: new mongoose.Types.ObjectId(negBiz.id) },
    { allowNegativeStock: true }
  );
  const product = await makeProduct(negBiz.id, { currentStock: 1 });
  const accountId = await makeAccount(negBiz.id, negShop.id, 0);

  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(negBiz.id, negShop.id, {
      items: [{ productId: String(product._id), qty: 5 }],
      paidAmount: 55000,
      accountId,
    })
  );
  assert.equal(res.status, 201);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, -4);
  const movement = await StockMovement.findOne({ refId: new mongoose.Types.ObjectId(res.body.data.id) });
  assert.equal(movement!.prevStock, 1);
  assert.equal(movement!.newStock, -4);
});

test("sale: walk-in customer (no customerId) works when fully paid", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const accountId = await makeAccount(bizA.id, shopA.id, 0);
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 1 }],
      customerName: "Walk-in Rahim",
      paidAmount: 11000,
      accountId,
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.customerId, null);
  assert.equal(res.body.data.customerName, "Walk-in Rahim");
  assert.equal(res.body.data.paymentStatus, "PAID");
  // No Customer record is created for a walk-in.
  assert.equal(await Customer.countDocuments({ name: "Walk-in Rahim" }), 0);
});

test("sale: walk-in credit sale rejected — a due requires a customer (400)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 1 }],
      customerName: "Walk-in Karim",
    })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /credit sale requires a customer/i);
});

test("sale: inactive product rejected (400)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20, status: "INACTIVE" });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(product._id), qty: 1 }], draft: true })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /not active/i);
});

test("sale: foreign-business product rejected (404)", async () => {
  const foreignProduct = await makeProduct(bizB.id, { currentStock: 50 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(foreignProduct._id), qty: 1 }], draft: true })
  );
  assert.equal(res.status, 404);
  assert.match(res.body.error.message, /product not found/i);

  const fresh = await Product.findById(foreignProduct._id);
  assert.equal(fresh!.currentStock, 50); // untouched
});

test("sale: foreign-business customer rejected (404)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const foreignCustomer = await makeCustomer(bizB.id, { currentDue: 0 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 1 }],
      customerId: String(foreignCustomer._id),
    })
  );
  assert.equal(res.status, 404);
  assert.match(res.body.error.message, /customer not found/i);

  const fresh = await Customer.findById(foreignCustomer._id);
  assert.equal(fresh!.currentDue, 0);
});

test("sale: cross-shop rejected — businessId=A + shopId=B's shop (404)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopB.id, { items: [{ productId: String(product._id), qty: 1 }], draft: true })
  );
  assert.equal(res.status, 404);
});

test("sale: cross-tenant rejected — B cannot sell in A's shop (404)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const res = await post(
    userB.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(product._id), qty: 1 }], draft: true })
  );
  assert.equal(res.status, 404);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 20);
});

test("sale: Salesperson allowed (201)", async () => {
  await setRole(roleUser.user.id, bizA.id, "Salesperson");
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const accountId = await makeAccount(bizA.id, shopA.id, 0);
  const res = await post(
    roleUser.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 1 }],
      paidAmount: 11000,
      accountId,
    })
  );
  assert.equal(res.status, 201);
});

test("sale: Viewer denied (403)", async () => {
  await setRole(roleUser.user.id, bizA.id, "Viewer");
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const res = await post(
    roleUser.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(product._id), qty: 1 }], draft: true })
  );
  assert.equal(res.status, 403);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 20);
});

test("sale: Accountant denied — not in the sale write matrix (403)", async () => {
  await setRole(roleUser.user.id, bizA.id, "Accountant");
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const res = await post(
    roleUser.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(product._id), qty: 1 }], draft: true })
  );
  assert.equal(res.status, 403);
});

test("sale: RBAC is enforced at the service level, not just the route", async () => {
  await setRole(roleUser.user.id, bizA.id, "Viewer");
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  await assert.rejects(
    () =>
      createSale(roleUser.user.id, {
        businessId: bizA.id,
        shopId: shopA.id,
        items: [{ productId: String(product._id), qty: 1 }],
        draft: true,
      }),
    /insufficient role/i
  );

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 20);
});

test("sale: journal is balanced — DEBIT cash + receivable / CREDIT revenue + tax", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20, sellingPrice: 10000, taxRate: 10 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 0);
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 2 }],
      customerId: String(customer._id),
      paidAmount: 10000,
      accountId,
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.total, 22000);

  const entry = await JournalEntry.findOne({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    referenceType: "SALE",
    referenceId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  assert.ok(entry);
  assert.equal(String(entry!.shopId), shopA.id);

  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.equal(lines.length, 4);
  const cash = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.CASH);
  const recv = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.CUSTOMER_RECEIVABLE);
  const revenue = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.SALES_REVENUE);
  const tax = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.TAX_PAYABLE);
  assert.ok(cash && recv && revenue && tax);
  assert.equal(cash!.debit, 10000);
  assert.equal(recv!.debit, 12000);
  assert.equal(revenue!.credit, 20000);
  assert.equal(revenue!.accountType, "REVENUE");
  assert.equal(tax!.credit, 2000);
  assert.equal(tax!.accountType, "LIABILITY");

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, totalCredit);
  assert.equal(totalDebit, 22000);
});

test("sale: AuditLog SALE_FINALIZED is written with the invoice reference", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const accountId = await makeAccount(bizA.id, shopA.id, 0);
  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 1 }],
      paidAmount: 11000,
      accountId,
    })
  );
  assert.equal(res.status, 201);

  const log = await AuditLog.findOne({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    action: "SALE_FINALIZED",
    details: { $regex: res.body.data.id },
  });
  assert.ok(log);
  assert.equal(String(log!.userId), ownerA.user.id);
  const details = JSON.parse(log!.details as string);
  assert.equal(details.saleId, res.body.data.id);
  assert.equal(details.invoiceNo, res.body.data.invoiceNo);
  assert.equal(details.shopId, shopA.id);
  assert.equal(details.total, 11000);
});

test("sale: invoice numbers come from the atomic counter and increment per shop", async () => {
  const seqShop = await createShop(ownerA.accessToken, bizA.id, {
    name: "Seq Branch",
    branchCode: "SEQ",
  });
  const accountId = await makeAccount(bizA.id, seqShop.id, 0);
  const numbers: string[] = [];
  for (let i = 0; i < 3; i++) {
    const product = await makeProduct(bizA.id, { currentStock: 10 });
    const { sale } = await createSale(ownerA.user.id, {
      businessId: bizA.id,
      shopId: seqShop.id,
      items: [{ productId: String(product._id), qty: 1 }],
      paidAmount: 11000,
      accountId,
    });
    numbers.push(sale.invoiceNo as string);
  }
  const fy = fiscalYearOf(new Date(), "1 July - 30 June");
  assert.deepEqual(numbers, [
    formatDocumentNo("INV", fy, 1, "SEQ"),
    formatDocumentNo("INV", fy, 2, "SEQ"),
    formatDocumentNo("INV", fy, 3, "SEQ"),
  ]);

  // A second shop in the SAME business restarts at sequence 1 without
  // colliding on the business-wide unique {businessId, invoiceNo} index.
  const otherShop = await createShop(ownerA.accessToken, bizA.id, {
    name: "Seq Branch 2",
    branchCode: "SEQ2",
  });
  const otherAccount = await makeAccount(bizA.id, otherShop.id, 0);
  const otherProduct = await makeProduct(bizA.id, { currentStock: 10 });
  const { sale: otherSale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: otherShop.id,
    items: [{ productId: String(otherProduct._id), qty: 1 }],
    paidAmount: 11000,
    accountId: otherAccount,
  });
  assert.equal(otherSale.invoiceNo, formatDocumentNo("INV", fy, 1, "SEQ2"));
});

test("sale: concurrent finalizations never share an invoice number", async () => {
  const concShop = await createShop(ownerA.accessToken, bizA.id, { name: "Conc Branch" });
  const accountId = await makeAccount(bizA.id, concShop.id, 0);
  const products = await Promise.all([
    makeProduct(bizA.id, { currentStock: 10 }),
    makeProduct(bizA.id, { currentStock: 10 }),
    makeProduct(bizA.id, { currentStock: 10 }),
  ]);

  const results = await Promise.allSettled(
    products.map((product) =>
      createSale(ownerA.user.id, {
        businessId: bizA.id,
        shopId: concShop.id,
        items: [{ productId: String(product._id), qty: 1 }],
        paidAmount: 11000,
        accountId,
      })
    )
  );
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<{ sale: { invoiceNo: string | null } }> =>
      r.status === "fulfilled"
  );
  assert.equal(fulfilled.length, 3);
  const invoiceNos = fulfilled.map((r) => r.value.sale.invoiceNo);
  assert.equal(new Set(invoiceNos).size, 3, `expected 3 distinct invoice numbers, got ${invoiceNos.join(", ")}`);
});

test("sale: finalize route applies effects and is idempotent on repeat", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 30 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 0);

  const draft = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [{ productId: String(product._id), qty: 2 }],
      customerId: String(customer._id),
      draft: true,
    })
  );
  assert.equal(draft.status, 201);
  assert.equal(draft.body.data.status, "DRAFT");
  const saleId = draft.body.data.id;

  const first = await post(
    ownerA.accessToken,
    `/api/v1/sales/${saleId}/finalize`,
    { businessId: bizA.id, shopId: shopA.id, paidAmount: 10000, accountId }
  );
  assert.equal(first.status, 200);
  assert.equal(first.body.data.status, "COMPLETED");
  assert.equal(first.body.data.paymentStatus, "PARTIAL");
  assert.equal(first.body.data.duplicate, false);
  assert.ok(first.body.data.invoiceNo);

  const second = await post(
    ownerA.accessToken,
    `/api/v1/sales/${saleId}/finalize`,
    { businessId: bizA.id, shopId: shopA.id, paidAmount: 10000, accountId }
  );
  assert.equal(second.status, 200);
  assert.equal(second.body.data.duplicate, true);
  assert.equal(second.body.data.invoiceNo, first.body.data.invoiceNo);

  // Effects applied exactly once.
  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 28);
  assert.equal(await StockMovement.countDocuments({ refId: new mongoose.Types.ObjectId(saleId) }), 1);
  assert.equal(
    await JournalEntry.countDocuments({
      referenceType: "SALE",
      referenceId: new mongoose.Types.ObjectId(saleId),
    }),
    1
  );
  const freshCustomer = await Customer.findById(customer._id);
  assert.equal(freshCustomer!.currentDue, 12000);
  const acct = await Account.findById(accountId);
  assert.equal(acct!.currentBalance, 10000);
});

test("sale: duplicate create with the same localId returns the first sale", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 30 });
  const accountId = await makeAccount(bizA.id, shopA.id, 0);
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const body = saleBody(bizA.id, shopA.id, {
    items: [{ productId: String(product._id), qty: 2 }],
    paidAmount: 22000,
    accountId,
    localId,
  });

  const first = await post(ownerA.accessToken, "/api/v1/sales", body);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.duplicate, false);

  const second = await post(ownerA.accessToken, "/api/v1/sales", body);
  assert.equal(second.status, 200);
  assert.equal(second.body.data.duplicate, true);
  assert.equal(second.body.data.id, first.body.data.id);

  assert.equal(
    await Sale.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id), localId }),
    1
  );
  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 28); // decremented once
  const acct = await Account.findById(accountId);
  assert.equal(acct!.currentBalance, 22000); // credited once
});

test("sale: transaction rollback — a failing second line undoes the first line's stock", async () => {
  const ok = await makeProduct(bizA.id, { currentStock: 10 });
  const short = await makeProduct(bizA.id, { currentStock: 0 });
  const customer = await makeCustomer(bizA.id, { currentDue: 500 });
  const accountId = await makeAccount(bizA.id, shopA.id, 7000);

  const salesBefore = await Sale.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id) });
  const entriesBefore = await JournalEntry.countDocuments({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    referenceType: "SALE",
  });
  const auditBefore = await AuditLog.countDocuments({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    action: "SALE_FINALIZED",
  });

  const res = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, {
      items: [
        { productId: String(ok._id), qty: 2 },
        { productId: String(short._id), qty: 1 },
      ],
      customerId: String(customer._id),
      paidAmount: 5000,
      accountId,
    })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /insufficient stock/i);

  // First line's stock decrement and its StockMovement must both be gone.
  assert.equal((await Product.findById(ok._id))!.currentStock, 10);
  assert.equal((await Product.findById(short._id))!.currentStock, 0);
  assert.equal(await StockMovement.countDocuments({ productId: ok._id }), 0);
  assert.equal(await StockMovement.countDocuments({ productId: short._id }), 0);
  // No sale, no journal, no audit, no account or due movement.
  assert.equal(
    await Sale.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id) }),
    salesBefore
  );
  assert.equal(
    await JournalEntry.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      referenceType: "SALE",
    }),
    entriesBefore
  );
  assert.equal(
    await AuditLog.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      action: "SALE_FINALIZED",
    }),
    auditBefore
  );
  assert.equal((await Customer.findById(customer._id))!.currentDue, 500);
  assert.equal((await Account.findById(accountId))!.currentBalance, 7000);
});

test("sale: a VOIDED sale cannot be finalized (400)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const draft = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(product._id), qty: 1 }], draft: true })
  );
  assert.equal(draft.status, 201);
  await Sale.updateOne({ _id: new mongoose.Types.ObjectId(draft.body.data.id) }, { status: "VOIDED" });

  const res = await post(
    ownerA.accessToken,
    `/api/v1/sales/${draft.body.data.id}/finalize`,
    { businessId: bizA.id, shopId: shopA.id }
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /voided sale cannot be finalized/i);
  assert.equal((await Product.findById(product._id))!.currentStock, 20);
});

test("sale: list is business + shop scoped, paginated and status-filterable", async () => {
  const listShop = await createShop(ownerA.accessToken, bizA.id, { name: "List Branch" });
  const accountId = await makeAccount(bizA.id, listShop.id, 0);
  for (let i = 0; i < 2; i++) {
    const product = await makeProduct(bizA.id, { currentStock: 10 });
    const created = await post(
      ownerA.accessToken,
      "/api/v1/sales",
      saleBody(bizA.id, listShop.id, {
        items: [{ productId: String(product._id), qty: 1 }],
        paidAmount: 11000,
        accountId,
      })
    );
    assert.equal(created.status, 201);
  }
  const draftProduct = await makeProduct(bizA.id, { currentStock: 10 });
  const draft = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, listShop.id, {
      items: [{ productId: String(draftProduct._id), qty: 1 }],
      draft: true,
    })
  );
  assert.equal(draft.status, 201);

  const page1 = await get(
    ownerA.accessToken,
    `/api/v1/sales?businessId=${bizA.id}&shopId=${listShop.id}&page=1&limit=2`
  );
  assert.equal(page1.status, 200);
  assert.equal(page1.body.data.length, 2);
  assert.equal(page1.body.pagination.total, 3);
  assert.equal(page1.body.pagination.totalPages, 2);
  assert.ok(page1.body.data.every((s: { shopId: string }) => s.shopId === listShop.id));

  const drafts = await get(
    ownerA.accessToken,
    `/api/v1/sales?businessId=${bizA.id}&shopId=${listShop.id}&status=DRAFT`
  );
  assert.equal(drafts.status, 200);
  assert.equal(drafts.body.data.length, 1);
  assert.equal(drafts.body.data[0].id, draft.body.data.id);

  const paid = await get(
    ownerA.accessToken,
    `/api/v1/sales?businessId=${bizA.id}&shopId=${listShop.id}&paymentStatus=PAID`
  );
  assert.equal(paid.body.data.length, 2);

  // Another tenant cannot list business A's sales.
  const foreign = await get(
    userB.accessToken,
    `/api/v1/sales?businessId=${bizA.id}&shopId=${listShop.id}`
  );
  assert.equal(foreign.status, 404);
});

test("sale: list supports saleDate range filtering", async () => {
  const dateShop = await createShop(ownerA.accessToken, bizA.id, { name: "Date Branch" });
  const oldProduct = await makeProduct(bizA.id, { currentStock: 10 });
  const newProduct = await makeProduct(bizA.id, { currentStock: 10 });

  const old = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, dateShop.id, {
      items: [{ productId: String(oldProduct._id), qty: 1 }],
      saleDate: "2025-01-15T10:00:00.000Z",
      draft: true,
    })
  );
  assert.equal(old.status, 201);
  const recent = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, dateShop.id, {
      items: [{ productId: String(newProduct._id), qty: 1 }],
      saleDate: "2026-06-15T10:00:00.000Z",
      draft: true,
    })
  );
  assert.equal(recent.status, 201);

  const all = await get(ownerA.accessToken, `/api/v1/sales?businessId=${bizA.id}&shopId=${dateShop.id}`);
  assert.equal(all.body.pagination.total, 2);

  const from2026 = await get(
    ownerA.accessToken,
    `/api/v1/sales?businessId=${bizA.id}&shopId=${dateShop.id}&dateFrom=2026-01-01T00:00:00.000Z`
  );
  assert.equal(from2026.body.pagination.total, 1);
  assert.equal(from2026.body.data[0].id, recent.body.data.id);

  const upTo2025 = await get(
    ownerA.accessToken,
    `/api/v1/sales?businessId=${bizA.id}&shopId=${dateShop.id}&dateTo=2025-12-31T23:59:59.000Z`
  );
  assert.equal(upTo2025.body.pagination.total, 1);
  assert.equal(upTo2025.body.data[0].id, old.body.data.id);
});

test("sale: get by id is shop-scoped (404 from another shop's scope)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const created = await post(
    ownerA.accessToken,
    "/api/v1/sales",
    saleBody(bizA.id, shopA.id, { items: [{ productId: String(product._id), qty: 1 }], draft: true })
  );
  assert.equal(created.status, 201);

  const same = await get(
    ownerA.accessToken,
    `/api/v1/sales/${created.body.data.id}?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(same.status, 200);
  assert.equal(same.body.data.id, created.body.data.id);

  const wrongShop = await get(
    ownerA.accessToken,
    `/api/v1/sales/${created.body.data.id}?businessId=${bizA.id}&shopId=${shopA2.id}`
  );
  assert.equal(wrongShop.status, 404);
});

test("sale: unauthenticated denied (401)", async () => {
  const res = await request(app).get(`/api/v1/sales?businessId=${bizA.id}&shopId=${shopA.id}`);
  assert.equal(res.status, 401);
});

