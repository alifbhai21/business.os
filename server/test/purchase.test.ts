import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Purchase } from "../src/models/Purchase";
import { StockMovement } from "../src/models/StockMovement";
import { Product } from "../src/models/Product";
import { Supplier } from "../src/models/Supplier";
import { Account } from "../src/models/Account";
import { AuditLog } from "../src/models/AuditLog";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { Business } from "../src/models/Business";
import {
  createPurchase,
  finalizePurchase,
  calcNewAvgCost,
} from "../src/services/purchase.service";
import {
  purchaseCreateSchema,
  purchaseFinalizeSchema,
} from "../src/validation/purchase.schemas";
import { fiscalYearOf, formatDocumentNo } from "../src/utils/invoice";
import { AccountType, JOURNAL_ACCOUNTS } from "../src/config/accounts";

const DEV = { deviceId: "pur-dev", deviceName: "PurTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Purchase User",
    email: `pur${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Purchase Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `PR-${Math.random().toString(36).slice(2)}`, ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

/**
 * Products, suppliers and accounts are seeded straight through the models so
 * only the purchase endpoints are exercised over HTTP — this keeps the file
 * under the global rate limiter (100 req/min).
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

function purchaseBody(
  businessId: string,
  shopId: string,
  supplierId: string,
  over: Record<string, unknown> = {}
) {
  return { businessId, shopId, supplierId, items: [], ...over };
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
  await connectTestDb("business-os-test-purchase");
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
    role: "Inventory Manager",
    status: "ACTIVE",
    permissions: [],
  });
});

after(async () => {
  await disconnectTestDb();
});

test("purchase: calcNewAvgCost weighted average, zero stock and undefined cases", () => {
  // existing stock: (10 × 4000 + 60000) / 20 = 5000
  assert.equal(calcNewAvgCost(10, 4000, 10, 60000), 5000);
  // zero previous stock: 10000 / 4 = 2500
  assert.equal(calcNewAvgCost(0, 0, 4, 10000), 2500);
  // rounding: (3 × 1000 + 1003) / 4 = 1000.75 → 1001
  assert.equal(calcNewAvgCost(3, 1000, 1, 1003), 1001);
  // rounding down: (3 × 1000 + 1001) / 4 = 1000.25 → 1000
  assert.equal(calcNewAvgCost(3, 1000, 1, 1001), 1000);
  // negative stock fully offset → fall back to this purchase's own unit cost
  assert.equal(calcNewAvgCost(-5, 900, 5, 6000), 1200);
  assert.equal(calcNewAvgCost(-8, 900, 5, 6000), 1200);
});

test("purchase: create draft — no invoice number, no stock, no financial effect", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 7, avgCost: 3000, taxRate: 10 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 10, unitPrice: 5000 }],
      draft: true,
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, "DRAFT");
  assert.equal(res.body.data.invoiceNo, null);
  assert.equal(res.body.data.paymentStatus, "UNPAID");
  assert.equal(res.body.data.subtotal, 50000);
  assert.equal(res.body.data.taxAmount, 5000);
  assert.equal(res.body.data.total, 55000);
  assert.equal(res.body.data.supplierName, supplier.name);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 7); // untouched
  assert.equal(fresh!.avgCost, 3000); // untouched
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0);
  assert.equal(await StockMovement.countDocuments({ refId: new mongoose.Types.ObjectId(res.body.data.id) }), 0);
  assert.equal(
    await JournalEntry.countDocuments({
      referenceType: "PURCHASE",
      referenceId: new mongoose.Types.ObjectId(res.body.data.id),
    }),
    0
  );

  const log = await AuditLog.findOne({ action: "PURCHASE_CREATED", details: { $regex: res.body.data.id } });
  assert.ok(log);
});

test("purchase: finalize cash purchase — PAID, stock up, avgCost set, account down", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, avgCost: 0, taxRate: 10 });
  const accountId = await makeAccount(bizA.id, shopA.id, 100000);

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 10, unitPrice: 5000 }],
      paidAmount: 55000,
      accountId,
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, "COMPLETED");
  assert.equal(res.body.data.paymentStatus, "PAID");
  assert.equal(res.body.data.paidAmount, 55000);
  assert.equal(res.body.data.dueAmount, 0);
  assert.match(res.body.data.invoiceNo, /^PUR-\d{4}-.+-\d{4}$/);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 10);
  assert.equal(fresh!.avgCost, 5000); // 50000 net / 10, tax excluded

  assert.equal((await Account.findById(accountId))!.currentBalance, 45000); // 100000 − 55000
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 0); // nothing owed
});

test("purchase: finalize credit purchase — UNPAID and supplier payable increases", async () => {
  const supplier = await makeSupplier(bizA.id, { currentPayable: 2000 });
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 10 });

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 10, unitPrice: 5000 }],
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.paymentStatus, "UNPAID");
  assert.equal(res.body.data.paidAmount, 0);
  assert.equal(res.body.data.dueAmount, 55000);

  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 57000); // 2000 + 55000
  assert.equal((await Product.findById(product._id))!.currentStock, 10);
});

test("purchase: partial payment — PARTIAL, split between account and payable", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 10 });
  const accountId = await makeAccount(bizA.id, shopA.id, 100000);

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 10, unitPrice: 5000 }],
      paidAmount: 20000,
      accountId,
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.paymentStatus, "PARTIAL");
  assert.equal(res.body.data.paidAmount, 20000);
  assert.equal(res.body.data.dueAmount, 35000);

  assert.equal((await Account.findById(accountId))!.currentBalance, 80000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 35000);
});

test("purchase: overpayment rejected (400)", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const accountId = await makeAccount(bizA.id, shopA.id, 1000000);

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 5000 }],
      paidAmount: 99999,
      accountId,
    })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /cannot exceed the purchase total/i);
  assert.equal((await Product.findById(product._id))!.currentStock, 0);
});

test("purchase: avgCost blends with existing stock", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 10, avgCost: 4000, taxRate: 0 });

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 10, unitPrice: 6000 }],
    })
  );
  assert.equal(res.status, 201);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 20);
  assert.equal(fresh!.avgCost, 5000); // (10×4000 + 60000) / 20
});

test("purchase: repeated purchases keep blending avgCost", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, avgCost: 0, taxRate: 0 });

  const first = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 10, unitPrice: 1000 }],
    })
  );
  assert.equal(first.status, 201);
  let fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 10);
  assert.equal(fresh!.avgCost, 1000);

  const second = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 10, unitPrice: 2000 }],
    })
  );
  assert.equal(second.status, 201);
  fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 20);
  assert.equal(fresh!.avgCost, 1500); // (10×1000 + 20000) / 20
});

test("purchase: multiple lines each recalculate their own stock, avgCost and movement", async () => {
  const supplier = await makeSupplier(bizA.id);
  const p1 = await makeProduct(bizA.id, { currentStock: 0, avgCost: 0, taxRate: 0 });
  const p2 = await makeProduct(bizA.id, { currentStock: 10, avgCost: 2000, taxRate: 0 });

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [
        { productId: String(p1._id), qty: 5, unitPrice: 1000 },
        { productId: String(p2._id), qty: 10, unitPrice: 3000 },
      ],
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.subtotal, 35000); // 5000 + 30000
  assert.equal(res.body.data.total, 35000);
  assert.equal(res.body.data.items.length, 2);

  const f1 = await Product.findById(p1._id);
  assert.equal(f1!.currentStock, 5);
  assert.equal(f1!.avgCost, 1000);
  const f2 = await Product.findById(p2._id);
  assert.equal(f2!.currentStock, 20);
  assert.equal(f2!.avgCost, 2500); // (10×2000 + 30000) / 20

  const movements = await StockMovement.find({
    refType: "PURCHASE",
    refId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  assert.equal(movements.length, 2);
});

test("purchase: StockMovement records the increase with prev/new stock", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 6, avgCost: 1000, taxRate: 0 });

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 4, unitPrice: 2500 }],
    })
  );
  assert.equal(res.status, 201);

  const movements = await StockMovement.find({
    refType: "PURCHASE",
    refId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  assert.equal(movements.length, 1);
  const m = movements[0];
  assert.equal(m.type, "purchase");
  assert.equal(m.qtyChange, 4);
  assert.equal(m.prevStock, 6);
  assert.equal(m.newStock, 10);
  assert.equal(m.unitCost, 2500);
  assert.equal(String(m.productId), String(product._id));
  assert.equal(String(m.businessId), bizA.id);
  assert.equal(String(m.shopId), shopA.id);
});

test("purchase: server recalculates every money field from the product record", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, purchasePrice: 6000, taxRate: 10 });

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 3, discountAmount: 3000 }],
      draft: true,
    })
  );
  assert.equal(res.status, 201);
  const line = res.body.data.items[0];
  assert.equal(line.unitPrice, 6000); // defaulted from the product
  assert.equal(line.discountAmount, 3000);
  assert.equal(line.netAmount, 15000); // 18000 − 3000
  assert.equal(line.taxAmount, 1500); // 10% of 15000, rounded per line
  assert.equal(line.costAmount, 15000); // no header discount
  assert.equal(line.netUnitCost, 5000); // 15000 / 3
  assert.equal(line.lineTotal, 16500);

  assert.equal(res.body.data.subtotal, 18000);
  assert.equal(res.body.data.discountAmount, 3000);
  assert.equal(res.body.data.taxAmount, 1500);
  assert.equal(res.body.data.total, 16500); // 18000 − 3000 + 1500
});

test("purchase: header discount is allocated pro-rata into each line's cost basis", async () => {
  const supplier = await makeSupplier(bizA.id);
  const p1 = await makeProduct(bizA.id, { currentStock: 0, avgCost: 0, taxRate: 0 });
  const p2 = await makeProduct(bizA.id, { currentStock: 0, avgCost: 0, taxRate: 0 });

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [
        { productId: String(p1._id), qty: 5, unitPrice: 1000 },
        { productId: String(p2._id), qty: 5, unitPrice: 1000 },
      ],
      discountPercent: 10,
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.subtotal, 10000);
  assert.equal(res.body.data.discountAmount, 1000);
  assert.equal(res.body.data.total, 9000);
  assert.equal(res.body.data.items[0].costAmount, 4500); // 5000 − 500
  assert.equal(res.body.data.items[1].costAmount, 4500);

  // avgCost uses the discounted cost basis, not the gross line amount.
  assert.equal((await Product.findById(p1._id))!.avgCost, 900); // 4500 / 5
  assert.equal((await Product.findById(p2._id))!.avgCost, 900);

  // Inventory debit equals Σ costAmount, so the journal stays balanced.
  const entry = await JournalEntry.findOne({
    referenceType: "PURCHASE",
    referenceId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  const lines = await JournalLine.find({ entryId: entry!._id });
  const inventory = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.INVENTORY);
  assert.equal(inventory!.debit, 9000);
  assert.equal(
    lines.reduce((s, l) => s + l.debit, 0),
    lines.reduce((s, l) => s + l.credit, 0)
  );
});

test("purchase: client cannot spoof total, avgCost or currentStock", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const base = () => ({
    items: [{ productId: String(product._id), qty: 1, unitPrice: 5000 }],
    draft: true,
  });

  const spoofTotal = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), { ...base(), total: 1 })
  );
  assert.equal(spoofTotal.status, 400);

  const spoofAvgCost = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), { ...base(), avgCost: 1 })
  );
  assert.equal(spoofAvgCost.status, 400);

  const spoofItemAvgCost = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 5000, avgCost: 1 }],
      draft: true,
    })
  );
  assert.equal(spoofItemAvgCost.status, 400);

  const spoofStock = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), { ...base(), currentStock: 9999 })
  );
  assert.equal(spoofStock.status, 400);

  const spoofCreatedBy = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      ...base(),
      createdBy: new mongoose.Types.ObjectId().toString(),
    })
  );
  assert.equal(spoofCreatedBy.status, 400);

  assert.equal((await Product.findById(product._id))!.currentStock, 0);
});

test("purchase: invalid quantities rejected (400)", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  for (const qty of [0, -3, 1.5]) {
    const res = await post(
      ownerA.accessToken,
      "/api/v1/purchases",
      purchaseBody(bizA.id, shopA.id, String(supplier._id), {
        items: [{ productId: String(product._id), qty, unitPrice: 5000 }],
        draft: true,
      })
    );
    assert.equal(res.status, 400, `qty ${qty} should be rejected`);
  }
  const unsafe = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 10000000000000000 }],
      draft: true,
    })
  );
  assert.equal(unsafe.status, 400);
});

test("purchase: unknown supplier rejected (404)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, new mongoose.Types.ObjectId().toString(), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 5000 }],
      draft: true,
    })
  );
  assert.equal(res.status, 404);
  assert.match(res.body.error.message, /supplier not found/i);
});

test("purchase: unknown product rejected (404)", async () => {
  const supplier = await makeSupplier(bizA.id);
  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: new mongoose.Types.ObjectId().toString(), qty: 1, unitPrice: 5000 }],
      draft: true,
    })
  );
  assert.equal(res.status, 404);
  assert.match(res.body.error.message, /product not found/i);
});

test("purchase: cross-tenant supplier rejected (404)", async () => {
  const foreignSupplier = await makeSupplier(bizB.id, { currentPayable: 0 });
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(foreignSupplier._id), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 5000 }],
    })
  );
  assert.equal(res.status, 404);
  assert.equal((await Supplier.findById(foreignSupplier._id))!.currentPayable, 0);
  assert.equal((await Product.findById(product._id))!.currentStock, 0);
});

test("purchase: cross-tenant product rejected (404)", async () => {
  const supplier = await makeSupplier(bizA.id);
  const foreignProduct = await makeProduct(bizB.id, { currentStock: 3, avgCost: 1000 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(foreignProduct._id), qty: 1, unitPrice: 5000 }],
    })
  );
  assert.equal(res.status, 404);
  const fresh = await Product.findById(foreignProduct._id);
  assert.equal(fresh!.currentStock, 3);
  assert.equal(fresh!.avgCost, 1000);
});

test("purchase: cross-shop rejected — businessId=A + shopId=B's shop (404)", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopB.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 5000 }],
      draft: true,
    })
  );
  assert.equal(res.status, 404);
});

test("purchase: cross-tenant request rejected — B cannot buy in A's shop (404)", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const res = await post(
    userB.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 5000 }],
      draft: true,
    })
  );
  assert.equal(res.status, 404);
  assert.equal((await Product.findById(product._id))!.currentStock, 0);
});

test("purchase: foreign-business account rejected (404)", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const foreignAccount = await makeAccount(bizB.id, shopB.id, 500000);
  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 5000 }],
      paidAmount: 5000,
      accountId: foreignAccount,
    })
  );
  assert.equal(res.status, 404);
  assert.equal((await Account.findById(foreignAccount))!.currentBalance, 500000);
  assert.equal((await Product.findById(product._id))!.currentStock, 0);
});

test("purchase: foreign-shop account rejected (404)", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const otherShopAccount = await makeAccount(bizA.id, shopA2.id, 500000);
  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 5000 }],
      paidAmount: 5000,
      accountId: otherShopAccount,
    })
  );
  assert.equal(res.status, 404);
  assert.equal((await Account.findById(otherShopAccount))!.currentBalance, 500000);
});

test("purchase: journal is balanced — DEBIT Inventory + Tax Receivable / CREDIT cash + payable", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 10 });
  const accountId = await makeAccount(bizA.id, shopA.id, 100000);

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 10, unitPrice: 5000 }],
      paidAmount: 20000,
      accountId,
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.total, 55000);

  const entry = await JournalEntry.findOne({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    referenceType: "PURCHASE",
    referenceId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  assert.ok(entry);
  assert.equal(String(entry!.shopId), shopA.id);

  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.equal(lines.length, 4);
  const inventory = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.INVENTORY);
  const taxRecv = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.TAX_RECEIVABLE);
  const cash = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.CASH);
  const payable = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.SUPPLIER_PAYABLE);
  assert.ok(inventory && taxRecv && cash && payable);
  assert.equal(inventory!.debit, 50000);
  assert.equal(inventory!.accountType, "ASSET");
  assert.equal(taxRecv!.debit, 5000);
  assert.equal(taxRecv!.accountType, "ASSET");
  assert.equal(cash!.credit, 20000);
  assert.equal(payable!.credit, 35000);
  assert.equal(payable!.accountType, "LIABILITY");

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, totalCredit);
  assert.equal(totalDebit, 55000);
});

test("purchase: BANK payment account credits the canonical Bank journal account", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });
  const accountId = await makeAccount(bizA.id, shopA.id, 100000, "BANK");

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 2, unitPrice: 4000 }],
      paidAmount: 8000,
      accountId,
    })
  );
  assert.equal(res.status, 201);

  const entry = await JournalEntry.findOne({
    referenceType: "PURCHASE",
    referenceId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  const lines = await JournalLine.find({ entryId: entry!._id });
  const bank = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.BANK);
  assert.ok(bank);
  assert.equal(bank!.credit, 8000);
  assert.equal(
    lines.reduce((s, l) => s + l.debit, 0),
    lines.reduce((s, l) => s + l.credit, 0)
  );
});

test("purchase: insufficient account balance rolls back stock, avgCost and payable", async () => {
  const supplier = await makeSupplier(bizA.id, { currentPayable: 4000 });
  const product = await makeProduct(bizA.id, { currentStock: 6, avgCost: 1000, taxRate: 0 });
  const accountId = await makeAccount(bizA.id, shopA.id, 1000);

  const purchasesBefore = await Purchase.countDocuments({
    businessId: new mongoose.Types.ObjectId(bizA.id),
  });
  const entriesBefore = await JournalEntry.countDocuments({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    referenceType: "PURCHASE",
  });
  const auditBefore = await AuditLog.countDocuments({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    action: "PURCHASE_FINALIZED",
  });

  // The account decrement happens AFTER stock, avgCost and payable have already
  // been written in this transaction — so this exercises a genuine late failure.
  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 4, unitPrice: 2500 }],
      paidAmount: 10000,
      accountId,
    })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /insufficient account balance/i);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 6); // restored
  assert.equal(fresh!.avgCost, 1000); // restored
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 4000); // restored
  assert.equal((await Account.findById(accountId))!.currentBalance, 1000);
  assert.equal(await StockMovement.countDocuments({ productId: product._id }), 0);
  assert.equal(
    await Purchase.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id) }),
    purchasesBefore
  );
  assert.equal(
    await JournalEntry.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      referenceType: "PURCHASE",
    }),
    entriesBefore
  );
  assert.equal(
    await AuditLog.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      action: "PURCHASE_FINALIZED",
    }),
    auditBefore
  );
});

test("purchase: AuditLog PURCHASE_FINALIZED is written with the invoice reference", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });

  const res = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 2, unitPrice: 3000 }],
    })
  );
  assert.equal(res.status, 201);

  const log = await AuditLog.findOne({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    action: "PURCHASE_FINALIZED",
    details: { $regex: res.body.data.id },
  });
  assert.ok(log);
  assert.equal(String(log!.userId), ownerA.user.id);
  const details = JSON.parse(log!.details as string);
  assert.equal(details.purchaseId, res.body.data.id);
  assert.equal(details.invoiceNo, res.body.data.invoiceNo);
  assert.equal(details.shopId, shopA.id);
  assert.equal(details.supplierId, String(supplier._id));
  assert.equal(details.total, 6000);
  assert.equal(details.dueAmount, 6000);
});

test("purchase: Owner/Admin/Manager/Inventory Manager allowed (201)", async () => {
  const supplier = await makeSupplier(bizA.id);
  for (const role of ["Owner", "Admin", "Manager", "Inventory Manager"]) {
    await setRole(roleUser.user.id, bizA.id, role);
    const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });
    const res = await post(
      roleUser.accessToken,
      "/api/v1/purchases",
      purchaseBody(bizA.id, shopA.id, String(supplier._id), {
        items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
      })
    );
    assert.equal(res.status, 201, `role ${role} should be allowed (got ${res.status})`);
  }
});

test("purchase: Viewer and Salesperson denied (403)", async () => {
  const supplier = await makeSupplier(bizA.id);
  for (const role of ["Viewer", "Salesperson"]) {
    await setRole(roleUser.user.id, bizA.id, role);
    const product = await makeProduct(bizA.id, { currentStock: 0 });
    const res = await post(
      roleUser.accessToken,
      "/api/v1/purchases",
      purchaseBody(bizA.id, shopA.id, String(supplier._id), {
        items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
      })
    );
    assert.equal(res.status, 403, `role ${role} should be denied`);
    assert.equal((await Product.findById(product._id))!.currentStock, 0);
  }
});

test("purchase: RBAC is enforced at the service level, not just the route", async () => {
  await setRole(roleUser.user.id, bizA.id, "Viewer");
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  await assert.rejects(
    () =>
      createPurchase(roleUser.user.id, {
        businessId: bizA.id,
        shopId: shopA.id,
        supplierId: String(supplier._id),
        items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
        draft: true,
      }),
    /insufficient role/i
  );
  assert.equal((await Product.findById(product._id))!.currentStock, 0);
});

test("purchase: numbers come from the atomic counter; two shops never collide", async () => {
  const seqShop = await createShop(ownerA.accessToken, bizA.id, {
    name: "Pur Seq",
    branchCode: "PSEQ",
  });
  const supplier = await makeSupplier(bizA.id);
  const numbers: string[] = [];
  for (let i = 0; i < 3; i++) {
    const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });
    const { purchase } = await createPurchase(ownerA.user.id, {
      businessId: bizA.id,
      shopId: seqShop.id,
      supplierId: String(supplier._id),
      items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
    });
    numbers.push(purchase.invoiceNo as string);
  }
  const fy = fiscalYearOf(new Date(), "1 July - 30 June");
  assert.deepEqual(numbers, [
    formatDocumentNo("PUR", fy, 1, "PSEQ"),
    formatDocumentNo("PUR", fy, 2, "PSEQ"),
    formatDocumentNo("PUR", fy, 3, "PSEQ"),
  ]);

  // A second shop in the SAME business restarts at sequence 1 without
  // colliding on the business-wide unique {businessId, invoiceNo} index.
  const otherShop = await createShop(ownerA.accessToken, bizA.id, {
    name: "Pur Seq 2",
    branchCode: "PSEQ2",
  });
  const otherProduct = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });
  const { purchase: otherPurchase } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: otherShop.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(otherProduct._id), qty: 1, unitPrice: 1000 }],
  });
  assert.equal(otherPurchase.invoiceNo, formatDocumentNo("PUR", fy, 1, "PSEQ2"));

  // Sale and Purchase sequences are independent counter keys.
  assert.equal(new Set(numbers).size, 3);
});

test("purchase: finalize route applies effects and is idempotent on repeat", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 10, avgCost: 1000, taxRate: 0 });
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);

  const draft = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 10, unitPrice: 2000 }],
      draft: true,
    })
  );
  assert.equal(draft.status, 201);
  const purchaseId = draft.body.data.id;

  const first = await post(ownerA.accessToken, `/api/v1/purchases/${purchaseId}/finalize`, {
    businessId: bizA.id,
    shopId: shopA.id,
    paidAmount: 5000,
    accountId,
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.status, "COMPLETED");
  assert.equal(first.body.data.paymentStatus, "PARTIAL");
  assert.equal(first.body.data.duplicate, false);
  assert.ok(first.body.data.invoiceNo);

  const second = await post(ownerA.accessToken, `/api/v1/purchases/${purchaseId}/finalize`, {
    businessId: bizA.id,
    shopId: shopA.id,
    paidAmount: 5000,
    accountId,
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.data.duplicate, true);
  assert.equal(second.body.data.invoiceNo, first.body.data.invoiceNo);

  // Every effect applied exactly once.
  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 20);
  assert.equal(fresh!.avgCost, 1500); // (10×1000 + 20000) / 20
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 15000);
  assert.equal((await Account.findById(accountId))!.currentBalance, 45000);
  assert.equal(
    await StockMovement.countDocuments({ refId: new mongoose.Types.ObjectId(purchaseId) }),
    1
  );
  assert.equal(
    await JournalEntry.countDocuments({
      referenceType: "PURCHASE",
      referenceId: new mongoose.Types.ObjectId(purchaseId),
    }),
    1
  );
});

test("purchase: concurrent duplicate finalization applies effects exactly once", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 5, avgCost: 2000, taxRate: 0 });

  const { purchase: draft } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 5, unitPrice: 4000 }],
    draft: true,
  });

  const results = await Promise.allSettled([
    finalizePurchase(ownerA.user.id, bizA.id, shopA.id, draft.id, {}),
    finalizePurchase(ownerA.user.id, bizA.id, shopA.id, draft.id, {}),
  ]);
  assert.ok(results.some((r) => r.status === "fulfilled"));

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 10); // incremented once
  assert.equal(fresh!.avgCost, 3000); // (5×2000 + 20000) / 10
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 20000);
  assert.equal(
    await StockMovement.countDocuments({ refId: new mongoose.Types.ObjectId(draft.id) }),
    1
  );
  assert.equal(
    await JournalEntry.countDocuments({
      referenceType: "PURCHASE",
      referenceId: new mongoose.Types.ObjectId(draft.id),
    }),
    1
  );
});

test("purchase: duplicate create with the same localId returns the first purchase", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, avgCost: 0, taxRate: 0 });
  const localId = `plocal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const body = purchaseBody(bizA.id, shopA.id, String(supplier._id), {
    items: [{ productId: String(product._id), qty: 4, unitPrice: 2500 }],
    localId,
  });

  const first = await post(ownerA.accessToken, "/api/v1/purchases", body);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.duplicate, false);

  const second = await post(ownerA.accessToken, "/api/v1/purchases", body);
  assert.equal(second.status, 200);
  assert.equal(second.body.data.duplicate, true);
  assert.equal(second.body.data.id, first.body.data.id);

  assert.equal(
    await Purchase.countDocuments({ businessId: new mongoose.Types.ObjectId(bizA.id), localId }),
    1
  );
  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 4); // applied once
  assert.equal(fresh!.avgCost, 2500);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 10000);
});

test("purchase: a VOIDED purchase cannot be finalized (400)", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 3 });
  const draft = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
      draft: true,
    })
  );
  assert.equal(draft.status, 201);
  await Purchase.updateOne(
    { _id: new mongoose.Types.ObjectId(draft.body.data.id) },
    { status: "VOIDED" }
  );

  const res = await post(ownerA.accessToken, `/api/v1/purchases/${draft.body.data.id}/finalize`, {
    businessId: bizA.id,
    shopId: shopA.id,
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /voided purchase cannot be finalized/i);
  assert.equal((await Product.findById(product._id))!.currentStock, 3);
});

test("purchase: list is business + shop scoped, paginated and filterable", async () => {
  const listShop = await createShop(ownerA.accessToken, bizA.id, { name: "Pur List" });
  const supplier = await makeSupplier(bizA.id);
  for (let i = 0; i < 2; i++) {
    const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });
    const created = await post(
      ownerA.accessToken,
      "/api/v1/purchases",
      purchaseBody(bizA.id, listShop.id, String(supplier._id), {
        items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
      })
    );
    assert.equal(created.status, 201);
  }
  const draftProduct = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });
  const draft = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, listShop.id, String(supplier._id), {
      items: [{ productId: String(draftProduct._id), qty: 1, unitPrice: 1000 }],
      draft: true,
    })
  );
  assert.equal(draft.status, 201);

  const page1 = await get(
    ownerA.accessToken,
    `/api/v1/purchases?businessId=${bizA.id}&shopId=${listShop.id}&page=1&limit=2`
  );
  assert.equal(page1.status, 200);
  assert.equal(page1.body.data.length, 2);
  assert.equal(page1.body.pagination.total, 3);
  assert.equal(page1.body.pagination.totalPages, 2);
  assert.ok(page1.body.data.every((p: { shopId: string }) => p.shopId === listShop.id));

  const drafts = await get(
    ownerA.accessToken,
    `/api/v1/purchases?businessId=${bizA.id}&shopId=${listShop.id}&status=DRAFT`
  );
  assert.equal(drafts.body.data.length, 1);
  assert.equal(drafts.body.data[0].id, draft.body.data.id);

  const unpaid = await get(
    ownerA.accessToken,
    `/api/v1/purchases?businessId=${bizA.id}&shopId=${listShop.id}&supplierId=${String(supplier._id)}&paymentStatus=UNPAID`
  );
  assert.equal(unpaid.body.pagination.total, 3);

  // Another tenant cannot list business A's purchases.
  const foreign = await get(
    userB.accessToken,
    `/api/v1/purchases?businessId=${bizA.id}&shopId=${listShop.id}`
  );
  assert.equal(foreign.status, 404);
});

test("purchase: list supports purchaseDate range filtering", async () => {
  const dateShop = await createShop(ownerA.accessToken, bizA.id, { name: "Pur Date" });
  const supplier = await makeSupplier(bizA.id);
  const oldProduct = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });
  const newProduct = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });

  const old = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, dateShop.id, String(supplier._id), {
      items: [{ productId: String(oldProduct._id), qty: 1, unitPrice: 1000 }],
      purchaseDate: "2025-01-15T10:00:00.000Z",
      draft: true,
    })
  );
  assert.equal(old.status, 201);
  const recent = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, dateShop.id, String(supplier._id), {
      items: [{ productId: String(newProduct._id), qty: 1, unitPrice: 1000 }],
      purchaseDate: "2026-06-15T10:00:00.000Z",
      draft: true,
    })
  );
  assert.equal(recent.status, 201);

  const from2026 = await get(
    ownerA.accessToken,
    `/api/v1/purchases?businessId=${bizA.id}&shopId=${dateShop.id}&dateFrom=2026-01-01T00:00:00.000Z`
  );
  assert.equal(from2026.body.pagination.total, 1);
  assert.equal(from2026.body.data[0].id, recent.body.data.id);

  const upTo2025 = await get(
    ownerA.accessToken,
    `/api/v1/purchases?businessId=${bizA.id}&shopId=${dateShop.id}&dateTo=2025-12-31T23:59:59.000Z`
  );
  assert.equal(upTo2025.body.pagination.total, 1);
  assert.equal(upTo2025.body.data[0].id, old.body.data.id);
});

test("purchase: get by id is shop-scoped (404 from another shop's scope)", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const created = await post(
    ownerA.accessToken,
    "/api/v1/purchases",
    purchaseBody(bizA.id, shopA.id, String(supplier._id), {
      items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
      draft: true,
    })
  );
  assert.equal(created.status, 201);

  const same = await get(
    ownerA.accessToken,
    `/api/v1/purchases/${created.body.data.id}?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(same.status, 200);
  assert.equal(same.body.data.id, created.body.data.id);

  const wrongShop = await get(
    ownerA.accessToken,
    `/api/v1/purchases/${created.body.data.id}?businessId=${bizA.id}&shopId=${shopA2.id}`
  );
  assert.equal(wrongShop.status, 404);
});

test("purchase: unauthenticated denied (401)", async () => {
  const res = await request(app).get(`/api/v1/purchases?businessId=${bizA.id}&shopId=${shopA.id}`);
  assert.equal(res.status, 401);
});

test("purchase: inactive product rejected", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 2, status: "INACTIVE" });
  await assert.rejects(
    () =>
      createPurchase(ownerA.user.id, {
        businessId: bizA.id,
        shopId: shopA.id,
        supplierId: String(supplier._id),
        items: [{ productId: String(product._id), qty: 1, unitPrice: 1000 }],
        draft: true,
      }),
    /not active/i
  );
  assert.equal((await Product.findById(product._id))!.currentStock, 2);
});

/**
 * Fault injection at the SECOND line of a multi-product finalize: the first
 * line's stock increment, avgCost rewrite and StockMovement have already been
 * written inside the transaction when line 2 aborts it. Proves a real MongoDB
 * rollback rather than compensating writes.
 */
test("purchase: multi-line rollback — a later failing line undoes the first line's effects", async () => {
  const supplier = await makeSupplier(bizA.id, { currentPayable: 7000 });
  const p1 = await makeProduct(bizA.id, { currentStock: 10, avgCost: 1000, taxRate: 0 });
  const p2 = await makeProduct(bizA.id, { currentStock: 4, avgCost: 2000, taxRate: 0 });
  const accountId = await makeAccount(bizA.id, shopA.id, 60000);

  const { purchase: draft } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [
      { productId: String(p1._id), qty: 10, unitPrice: 3000 },
      { productId: String(p2._id), qty: 6, unitPrice: 5000 },
    ],
    draft: true,
  });

  // The second line's product goes inactive after the draft was priced, so
  // finalization fails midway through the per-line loop.
  await Product.updateOne({ _id: p2._id }, { status: "INACTIVE" });

  const bizObjId = new mongoose.Types.ObjectId(bizA.id);
  const entriesBefore = await JournalEntry.countDocuments({
    businessId: bizObjId,
    referenceType: "PURCHASE",
  });
  const journalLinesBefore = await JournalLine.countDocuments({});
  const auditBefore = await AuditLog.countDocuments({
    businessId: bizObjId,
    action: "PURCHASE_FINALIZED",
  });

  await assert.rejects(
    () =>
      finalizePurchase(ownerA.user.id, bizA.id, shopA.id, draft.id, {
        paidAmount: 20000,
        accountId,
      }),
    /not active/i
  );

  // Stock and avgCost of BOTH lines back to their pre-transaction values.
  const f1 = await Product.findById(p1._id);
  assert.equal(f1!.currentStock, 10);
  assert.equal(f1!.avgCost, 1000);
  const f2 = await Product.findById(p2._id);
  assert.equal(f2!.currentStock, 4);
  assert.equal(f2!.avgCost, 2000);
  // No movement survived — not even the first line's.
  assert.equal(await StockMovement.countDocuments({ productId: p1._id }), 0);
  assert.equal(
    await StockMovement.countDocuments({ refId: new mongoose.Types.ObjectId(draft.id) }),
    0
  );
  // Supplier payable, account balance, journal and audit untouched.
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 7000);
  assert.equal((await Account.findById(accountId))!.currentBalance, 60000);
  assert.equal(
    await JournalEntry.countDocuments({ businessId: bizObjId, referenceType: "PURCHASE" }),
    entriesBefore
  );
  assert.equal(await JournalLine.countDocuments({}), journalLinesBefore);
  assert.equal(
    await AuditLog.countDocuments({ businessId: bizObjId, action: "PURCHASE_FINALIZED" }),
    auditBefore
  );
  // The purchase itself is still an un-numbered DRAFT.
  const stillDraft = await Purchase.findById(draft.id);
  assert.equal(stillDraft!.status, "DRAFT");
  assert.equal(stillDraft!.invoiceNo, null);
  assert.equal(stillDraft!.paidAmount, 0);
});

/**
 * A later fault-injection point than the test above: the purchase number
 * collides on the unique {businessId, invoiceNo} index, so `purchase.save()`
 * fails AFTER stock, avgCost, StockMovement, supplier payable and the account
 * decrement have all been applied in this transaction.
 */
test("purchase: rollback after the account decrement restores the account balance", async () => {
  await Purchase.init(); // ensure the unique invoiceNo index exists
  const collideShop = await createShop(ownerA.accessToken, bizA.id, {
    name: "Pur Collide",
    branchCode: "PCOL",
  });
  const supplier = await makeSupplier(bizA.id, { currentPayable: 1500 });
  const product = await makeProduct(bizA.id, { currentStock: 8, avgCost: 1000, taxRate: 0 });
  const accountId = await makeAccount(bizA.id, collideShop.id, 30000);

  // Squat on the exact number the atomic counter will hand out first.
  const business = await Business.findById(bizA.id);
  const squattedNo = formatDocumentNo(
    "PUR",
    fiscalYearOf(new Date(), business!.fiscalYear),
    1,
    "PCOL"
  );
  await Purchase.create({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    shopId: new mongoose.Types.ObjectId(collideShop.id),
    invoiceNo: squattedNo,
    supplierId: supplier._id,
    items: [],
    subtotal: 0,
    total: 0,
    purchaseDate: new Date(),
    createdBy: new mongoose.Types.ObjectId(ownerA.user.id),
    status: "COMPLETED",
  });

  await assert.rejects(
    () =>
      createPurchase(ownerA.user.id, {
        businessId: bizA.id,
        shopId: collideShop.id,
        supplierId: String(supplier._id),
        items: [{ productId: String(product._id), qty: 4, unitPrice: 2500 }],
        paidAmount: 4000,
        accountId,
      }),
    /E11000|duplicate key/i
  );

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 8);
  assert.equal(fresh!.avgCost, 1000);
  assert.equal(await StockMovement.countDocuments({ productId: product._id }), 0);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 1500);
  assert.equal((await Account.findById(accountId))!.currentBalance, 30000);
  assert.equal(
    await Purchase.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      shopId: new mongoose.Types.ObjectId(collideShop.id),
    }),
    1 // only the squatter
  );
});

test("purchase: concurrent finalizations never share a purchase number", async () => {
  const concShop = await createShop(ownerA.accessToken, bizA.id, {
    name: "Pur Conc",
    branchCode: "PCONC",
  });
  const suppliers = await Promise.all([
    makeSupplier(bizA.id),
    makeSupplier(bizA.id),
    makeSupplier(bizA.id),
  ]);
  const products = await Promise.all([
    makeProduct(bizA.id, { currentStock: 0, taxRate: 0 }),
    makeProduct(bizA.id, { currentStock: 0, taxRate: 0 }),
    makeProduct(bizA.id, { currentStock: 0, taxRate: 0 }),
  ]);

  const results = await Promise.allSettled(
    products.map((product, index) =>
      createPurchase(ownerA.user.id, {
        businessId: bizA.id,
        shopId: concShop.id,
        supplierId: String(suppliers[index]._id),
        items: [{ productId: String(product._id), qty: 2, unitPrice: 1500 }],
      })
    )
  );
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<{ purchase: { invoiceNo: string | null } }> =>
      r.status === "fulfilled"
  );
  assert.equal(fulfilled.length, 3);
  const numbers = fulfilled.map((r) => r.value.purchase.invoiceNo);
  assert.equal(
    new Set(numbers).size,
    3,
    `expected 3 distinct purchase numbers, got ${numbers.join(", ")}`
  );
  for (const product of products) {
    assert.equal((await Product.findById(product._id))!.currentStock, 2);
    assert.equal((await Product.findById(product._id))!.avgCost, 1500);
  }
});

test("purchase: a COMPLETED purchase created inline cannot be finalized again", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, avgCost: 0, taxRate: 0 });

  const { purchase: completed } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 3, unitPrice: 2000 }],
  });
  assert.equal(completed.status, "COMPLETED");

  const again = await finalizePurchase(ownerA.user.id, bizA.id, shopA.id, completed.id, {});
  assert.equal(again.duplicate, true);
  assert.equal(again.purchase.invoiceNo, completed.invoiceNo);
  assert.equal(again.purchase.dueAmount, completed.dueAmount);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 3); // not 6
  assert.equal(fresh!.avgCost, 2000);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, 6000);
  assert.equal(
    await StockMovement.countDocuments({ refId: new mongoose.Types.ObjectId(completed.id) }),
    1
  );
  assert.equal(
    await JournalEntry.countDocuments({
      referenceType: "PURCHASE",
      referenceId: new mongoose.Types.ObjectId(completed.id),
    }),
    1
  );
});

test("purchase: a fully-credit purchase journalizes Inventory / Supplier Payable only", async () => {
  const supplier = await makeSupplier(bizA.id);
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });

  const { purchase } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 5, unitPrice: 2000 }],
  });

  const entry = await JournalEntry.findOne({
    referenceType: "PURCHASE",
    referenceId: new mongoose.Types.ObjectId(purchase.id),
  });
  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.equal(lines.length, 2); // no tax leg, no cash leg
  const inventory = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.INVENTORY);
  const payable = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.SUPPLIER_PAYABLE);
  assert.ok(inventory && payable);
  assert.equal(inventory!.debit, 10000);
  assert.equal(inventory!.credit, 0);
  assert.equal(payable!.credit, 10000);
  assert.equal(payable!.debit, 0);
  assert.equal(
    lines.reduce((s, l) => s + l.debit, 0),
    lines.reduce((s, l) => s + l.credit, 0)
  );
});

test("purchase: avgCost rounding stays integer paisa across a real purchase", async () => {
  const supplier = await makeSupplier(bizA.id);
  // (3 × 1000 + 1003) / 4 = 1000.75 → 1001
  const halfUp = await makeProduct(bizA.id, { currentStock: 3, avgCost: 1000, taxRate: 0 });
  const { purchase: first } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(halfUp._id), qty: 1, unitPrice: 1003 }],
  });
  assert.equal(first.items[0].netUnitCost, 1003);
  const freshHalfUp = await Product.findById(halfUp._id);
  assert.equal(freshHalfUp!.avgCost, 1001);
  assert.ok(Number.isInteger(freshHalfUp!.avgCost));

  // A discount that does not divide evenly: netAmount 2999 over qty 3.
  // The weighted average divides ONCE (2999 / 3 → 1000), so the per-unit
  // rounding of netUnitCost never compounds into the stored cost.
  const uneven = await makeProduct(bizA.id, { currentStock: 0, avgCost: 0, taxRate: 0 });
  const { purchase: second } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(uneven._id), qty: 3, unitPrice: 1000, discountAmount: 1 }],
  });
  assert.equal(second.items[0].netAmount, 2999);
  assert.equal(second.items[0].netUnitCost, 1000); // round(999.67)
  const freshUneven = await Product.findById(uneven._id);
  assert.equal(freshUneven!.avgCost, 1000); // round(2999 / 3)
  assert.ok(Number.isInteger(freshUneven!.avgCost));
});

test("purchase: Zod schema rejects spoofed, malformed and contradictory input", () => {
  const productId = new mongoose.Types.ObjectId().toString();
  const supplierId = new mongoose.Types.ObjectId().toString();
  const accountId = new mongoose.Types.ObjectId().toString();
  const base = {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId,
    items: [{ productId, qty: 2, unitPrice: 5000 }],
  };

  assert.equal(purchaseCreateSchema.safeParse(base).success, true);

  const rejected: Array<[string, Record<string, unknown>]> = [
    ["duplicate productId", { ...base, items: [{ productId, qty: 1 }, { productId, qty: 2 }] }],
    ["both discount modes", { ...base, discountAmount: 100, discountPercent: 10 }],
    ["malformed purchaseDate", { ...base, purchaseDate: "20-08-2026" }],
    ["negative unitPrice", { ...base, items: [{ productId, qty: 1, unitPrice: -5000 }] }],
    ["fractional unitPrice", { ...base, items: [{ productId, qty: 1, unitPrice: 5000.5 }] }],
    ["negative line discount", { ...base, items: [{ productId, qty: 1, discountAmount: -1 }] }],
    ["paidAmount without accountId", { ...base, paidAmount: 1000 }],
    ["client-supplied total", { ...base, total: 1 }],
    ["client-supplied taxAmount", { ...base, taxAmount: 0 }],
    ["client-supplied dueAmount", { ...base, dueAmount: 0 }],
    ["client-supplied paymentStatus", { ...base, paymentStatus: "PAID" }],
    ["client-supplied status", { ...base, status: "COMPLETED" }],
    ["client-supplied invoiceNo", { ...base, invoiceNo: "PUR-2026-X-0001" }],
    ["client-supplied createdBy", { ...base, createdBy: productId }],
    ["client-supplied line lineTotal", { ...base, items: [{ productId, qty: 1, lineTotal: 1 }] }],
    ["client-supplied line netUnitCost", { ...base, items: [{ productId, qty: 1, netUnitCost: 1 }] }],
    ["malformed supplierId", { ...base, supplierId: "not-an-objectid" }],
    ["empty items", { ...base, items: [] }],
    ["discountPercent above 100", { ...base, discountPercent: 101 }],
  ];
  for (const [label, body] of rejected) {
    assert.equal(purchaseCreateSchema.safeParse(body).success, false, `${label} must be rejected`);
  }

  // Finalize payload: same strictness.
  assert.equal(
    purchaseFinalizeSchema.safeParse({ businessId: bizA.id, shopId: shopA.id }).success,
    true
  );
  assert.equal(
    purchaseFinalizeSchema.safeParse({
      businessId: bizA.id,
      shopId: shopA.id,
      paidAmount: 500,
      accountId,
    }).success,
    true
  );
  assert.equal(
    purchaseFinalizeSchema.safeParse({ businessId: bizA.id, shopId: shopA.id, paidAmount: 500 })
      .success,
    false
  );
  assert.equal(
    purchaseFinalizeSchema.safeParse({
      businessId: bizA.id,
      shopId: shopA.id,
      paymentStatus: "PAID",
    }).success,
    false
  );
});

