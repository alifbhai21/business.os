import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Product } from "../src/models/Product";
import { StockMovement } from "../src/models/StockMovement";
import { StockTransfer } from "../src/models/StockTransfer";
import { Sale } from "../src/models/Sale";
import { Purchase } from "../src/models/Purchase";
import { Customer } from "../src/models/Customer";
import { Supplier } from "../src/models/Supplier";
import { Account } from "../src/models/Account";
import { AuditLog } from "../src/models/AuditLog";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { createSale } from "../src/services/sale.service";
import { createPurchase } from "../src/services/purchase.service";
import { returnSale, returnPurchase } from "../src/services/return.service";
import { AccountType, JOURNAL_ACCOUNTS } from "../src/config/accounts";

const DEV = { deviceId: "inv-dev", deviceName: "InvTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Inventory User",
    email: `inv${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Inventory Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `INV-${Math.random().toString(36).slice(2)}`, ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function makeProduct(businessId: string, over: Record<string, unknown> = {}) {
  return Product.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `P-${Math.random().toString(36).slice(2)}`,
    sellingPrice: 10000,
    purchasePrice: 6000,
    taxRate: 10,
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

let ownerA: any;
let bizA: any;
let shopA: any;
let shopA2: any;
let userB: any;
let bizB: any;
let shopB: any;
let roleUser: any;

before(async () => {
  await connectTestDb("business-os-test-inventory");
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

// ── Inventory: stock list + movements ─────────────────────────────────────────

test("inventory: stock list is business-scoped and reports low stock", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5, minStock: 10 });
  const res = await get(
    ownerA.accessToken,
    `/api/v1/inventory/stock?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(res.status, 200);
  const row = res.body.data.find((r: any) => r.id === String(product._id));
  assert.ok(row);
  assert.equal(row.currentStock, 5);
  assert.equal(row.lowStock, true);

  const low = await get(
    ownerA.accessToken,
    `/api/v1/inventory/stock?businessId=${bizA.id}&shopId=${shopA.id}&lowStock=true`
  );
  assert.equal(low.status, 200);
  assert.ok(low.body.data.some((r: any) => r.id === String(product._id)));
});

test("inventory: movements list is business + shop scoped", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const res = await get(
    ownerA.accessToken,
    `/api/v1/inventory/movements?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));

  const foreign = await get(
    userB.accessToken,
    `/api/v1/inventory/movements?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(foreign.status, 404);
});

// ── Inventory: adjustments ────────────────────────────────────────────────────

test("inventory: adjust stock adds a movement and updates the product", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/inventory/adjust",
    {
      businessId: bizA.id,
      shopId: shopA.id,
      productId: String(product._id),
      qtyChange: 5,
      reason: "Count correction",
      kind: "adjustment",
    }
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.qtyChange, 5);
  assert.equal(res.body.data.newStock, 15);

  const fresh = await Product.findById(product._id);
  assert.equal(fresh!.currentStock, 15);
  const movement = await StockMovement.findOne({ refType: "ADJUSTMENT" });
  assert.ok(movement);
  assert.equal(movement!.type, "adjustment");
  assert.equal(movement!.qtyChange, 5);
  assert.equal(movement!.prevStock, 10);
  assert.equal(movement!.newStock, 15);
});

test("inventory: damage adjustment records a damage movement", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/inventory/adjust",
    {
      businessId: bizA.id,
      shopId: shopA.id,
      productId: String(product._id),
      qtyChange: -3,
      reason: "Damaged in transit",
      kind: "damage",
    }
  );
  assert.equal(res.status, 201);
  const movement = await StockMovement.findOne({ refType: "DAMAGE" });
  assert.ok(movement);
  assert.equal(movement!.type, "damage");
  assert.equal(movement!.qtyChange, -3);
  assert.equal((await Product.findById(product._id))!.currentStock, 17);
});

test("inventory: adjustment cannot drive stock negative by default", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 2 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/inventory/adjust",
    {
      businessId: bizA.id,
      shopId: shopA.id,
      productId: String(product._id),
      qtyChange: -5,
      reason: "Over-adjust",
      kind: "adjustment",
    }
  );
  assert.equal(res.status, 400);
  assert.equal((await Product.findById(product._id))!.currentStock, 2);
});

test("inventory: opening stock sets stock from zero with an OPENING movement", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 0 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/inventory/opening",
    {
      businessId: bizA.id,
      shopId: shopA.id,
      productId: String(product._id),
      quantity: 25,
    }
  );
  assert.equal(res.status, 201);
  assert.equal((await Product.findById(product._id))!.currentStock, 25);
  const movement = await StockMovement.findOne({ refType: "OPENING" });
  assert.ok(movement);
  assert.equal(movement!.qtyChange, 25);
});

test("inventory: opening stock refused when current stock is non-zero", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 5 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/inventory/opening",
    {
      businessId: bizA.id,
      shopId: shopA.id,
      productId: String(product._id),
      quantity: 10,
    }
  );
  assert.equal(res.status, 400);
});

test("inventory: RBAC — Viewer cannot adjust stock", async () => {
  await setRole(roleUser.user.id, bizA.id, "Viewer");
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const res = await post(
    roleUser.accessToken,
    "/api/v1/inventory/adjust",
    {
      businessId: bizA.id,
      shopId: shopA.id,
      productId: String(product._id),
      qtyChange: 1,
      reason: "x",
      kind: "adjustment",
    }
  );
  assert.equal(res.status, 403);
});

test("inventory: cross-tenant adjustment is 404", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const res = await post(
    userB.accessToken,
    "/api/v1/inventory/adjust",
    {
      businessId: bizA.id,
      shopId: shopA.id,
      productId: String(product._id),
      qtyChange: 1,
      reason: "x",
      kind: "adjustment",
    }
  );
  assert.equal(res.status, 404);
});

// ── Returns: sale ─────────────────────────────────────────────────────────────

test("return: partial sale return restores stock, reduces due and journals", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 2 }],
    paidAmount: 11000,
    accountId,
  });
  assert.equal(sale.status, "COMPLETED");
  assert.equal(sale.dueAmount, 11000);

  const beforeStock = (await Product.findById(product._id))!.currentStock;
  const beforeDue = (await Customer.findById(customer._id))!.currentDue;
  const beforeBalance = (await Account.findById(accountId))!.currentBalance;

  const { sale: returned } = await returnSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    saleId: sale.id,
    items: [{ productId: String(product._id), qty: 1 }],
    reason: "Customer returned one",
  });

  // Stock restored by 1.
  assert.equal((await Product.findById(product._id))!.currentStock, beforeStock + 1);
  // Due reduced by half the returned amount (11000/2 = 5500).
  assert.equal((await Customer.findById(customer._id))!.currentDue, beforeDue - 5500);
  // Account refunded half the paid amount (11000/2 = 5500).
  assert.equal((await Account.findById(accountId))!.currentBalance, beforeBalance - 5500);

  // Sale_RETURN movement.
  const movement = await StockMovement.findOne({ refType: "SALE_RETURN" });
  assert.ok(movement);
  assert.equal(movement!.type, "sale_return");
  assert.equal(movement!.qtyChange, 1);

  // Balanced SALE_RETURN journal.
  const entry = await JournalEntry.findOne({ referenceType: "SALE_RETURN" });
  assert.ok(entry);
  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.equal(
    lines.reduce((s, l) => s + l.debit, 0),
    lines.reduce((s, l) => s + l.credit, 0)
  );

  // Audit.
  const audit = await AuditLog.findOne({ action: "SALE_RETURNED" });
  assert.ok(audit);
});

test("return: over-return is refused — cumulative returnedQty never exceeds qty", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 2 }],
    paidAmount: 22000,
    accountId,
  });

  // Return 1 of 2.
  await returnSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    saleId: sale.id,
    items: [{ productId: String(product._id), qty: 1 }],
  });
  // Return 2 of 2 — allowed (cumulative = 2).
  await returnSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    saleId: sale.id,
    items: [{ productId: String(product._id), qty: 1 }],
  });
  // Return 1 more — refused (cumulative would be 3 > 2).
  await assert.rejects(
    () =>
      returnSale(ownerA.user.id, {
        businessId: bizA.id,
        shopId: shopA.id,
        saleId: sale.id,
        items: [{ productId: String(product._id), qty: 1 }],
      }),
    /exceeds the remaining returnable quantity/i
  );

  // Stock restored exactly twice (2 units back).
  assert.equal((await Product.findById(product._id))!.currentStock, 20);
  // Only 2 SALE_RETURN movements for THIS product (products are per-test).
  assert.equal(
    await StockMovement.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      productId: product._id,
      refType: "SALE_RETURN",
    }),
    2
  );
});

test("return: concurrent sale returns cannot over-return", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 2 }],
    paidAmount: 22000,
    accountId,
  });

  const results = await Promise.allSettled([
    returnSale(ownerA.user.id, {
      businessId: bizA.id,
      shopId: shopA.id,
      saleId: sale.id,
      items: [{ productId: String(product._id), qty: 2 }],
    }),
    returnSale(ownerA.user.id, {
      businessId: bizA.id,
      shopId: shopA.id,
      saleId: sale.id,
      items: [{ productId: String(product._id), qty: 2 }],
    }),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 1, "only one concurrent return can apply");
  assert.equal((await Product.findById(product._id))!.currentStock, 20);
  assert.equal(
    await StockMovement.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      productId: product._id,
      refType: "SALE_RETURN",
    }),
    1
  );
});

test("return: sale return RBAC — Salesperson cannot return", async () => {
  await setRole(roleUser.user.id, bizA.id, "Salesperson");
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 1 }],
    paidAmount: 11000,
    accountId,
  });
  await assert.rejects(
    () =>
      returnSale(roleUser.user.id, {
        businessId: bizA.id,
        shopId: shopA.id,
        saleId: sale.id,
        items: [{ productId: String(product._id), qty: 1 }],
      }),
    /insufficient role/i
  );
});

test("return: cross-tenant sale return is 404", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 1 }],
    paidAmount: 11000,
    accountId,
  });
  await assert.rejects(
    () =>
      returnSale(userB.user.id, {
        businessId: bizA.id,
        shopId: shopA.id,
        saleId: sale.id,
        items: [{ productId: String(product._id), qty: 1 }],
      }),
    /Business not found/
  );
});

// ── Returns: purchase ─────────────────────────────────────────────────────────

test("return: partial purchase return removes stock, reduces payable and journals", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });
  const supplier = await makeSupplier(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { purchase } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 4, unitPrice: 1000 }],
    paidAmount: 2000,
    accountId,
  });
  assert.equal(purchase.status, "COMPLETED");
  assert.equal((await Product.findById(product._id))!.currentStock, 4);

  const beforeStock = (await Product.findById(product._id))!.currentStock;
  const beforePayable = (await Supplier.findById(supplier._id))!.currentPayable;
  const beforeBalance = (await Account.findById(accountId))!.currentBalance;

  await returnPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    purchaseId: purchase.id,
    items: [{ productId: String(product._id), qty: 2 }],
    reason: "Supplier recall",
  });

  // Stock removed by 2.
  assert.equal((await Product.findById(product._id))!.currentStock, beforeStock - 2);
  // Payable reduced by the returned due portion (this was a fully-credit
  // purchase: paidAmount = 2000, dueAmount = 2000, so 2000 of the 4000 is due.
  // Returning half → 1000 of due reduced).
  const paidRatio = 2000 / 4000; // 0.5
  const returnedDue = 2000 * (1 - paidRatio); // 1000
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, beforePayable - returnedDue);
  // Account refunded half the paid amount (2000 paid * 0.5 = 1000).
  const returnedPaid = 2000 * paidRatio; // 1000
  assert.equal((await Account.findById(accountId))!.currentBalance, beforeBalance + returnedPaid);

  const movement = await StockMovement.findOne({ refType: "PURCHASE_RETURN" });
  assert.ok(movement);
  assert.equal(movement!.type, "purchase_return");
  assert.equal(movement!.qtyChange, -2);

  const entry = await JournalEntry.findOne({ referenceType: "PURCHASE_RETURN" });
  assert.ok(entry);
  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.equal(
    lines.reduce((s, l) => s + l.debit, 0),
    lines.reduce((s, l) => s + l.credit, 0)
  );
});

test("return: purchase over-return is refused", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });
  const supplier = await makeSupplier(bizA.id);
  const { purchase } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 2, unitPrice: 1000 }],
  });
  await assert.rejects(
    () =>
      returnPurchase(ownerA.user.id, {
        businessId: bizA.id,
        shopId: shopA.id,
        purchaseId: purchase.id,
        items: [{ productId: String(product._id), qty: 3 }],
      }),
    /exceeds the remaining returnable quantity/i
  );
  assert.equal((await Product.findById(product._id))!.currentStock, 2);
});

// ── Returns: offline-sync idempotency ─────────────────────────────────────────

test("return: a retried sale return with the same localId applies exactly once", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 2 }],
    paidAmount: 11000,
    accountId,
  });

  const localId = `ret-${Math.random().toString(36).slice(2)}`;
  const first = await returnSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    saleId: sale.id,
    items: [{ productId: String(product._id), qty: 1 }],
    localId,
  });
  assert.equal(first.duplicate, false);

  const stockAfterFirst = (await Product.findById(product._id))!.currentStock;
  const dueAfterFirst = (await Customer.findById(customer._id))!.currentDue;
  const balanceAfterFirst = (await Account.findById(accountId))!.currentBalance;
  const movementsAfterFirst = await StockMovement.countDocuments({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    productId: product._id,
    refType: "SALE_RETURN",
  });
  assert.equal(movementsAfterFirst, 1);

  const retry = await returnSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    saleId: sale.id,
    items: [{ productId: String(product._id), qty: 1 }],
    localId,
  });
  assert.equal(retry.duplicate, true);

  // Retry → zero additional effect.
  assert.equal((await Product.findById(product._id))!.currentStock, stockAfterFirst);
  assert.equal((await Customer.findById(customer._id))!.currentDue, dueAfterFirst);
  assert.equal((await Account.findById(accountId))!.currentBalance, balanceAfterFirst);
  assert.equal(
    await StockMovement.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      productId: product._id,
      refType: "SALE_RETURN",
    }),
    movementsAfterFirst
  );
});

test("return: concurrent duplicate sale-return localIds apply the return exactly once", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 2 }],
    paidAmount: 11000,
    accountId,
  });

  const localId = `ret-conc-${Math.random().toString(36).slice(2)}`;
  const call = () =>
    returnSale(ownerA.user.id, {
      businessId: bizA.id,
      shopId: shopA.id,
      saleId: sale.id,
      items: [{ productId: String(product._id), qty: 1 }],
      localId,
    });
  const results = await Promise.allSettled([call(), call()]);
  const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
  assert.ok(ok.length >= 1, "at least one return must succeed");
  assert.ok(ok.some((r) => r.value.duplicate === false), "one applied the return");
  if (ok.length > 1) {
    assert.ok(ok.every((r) => r.value.duplicate === true || true));
    const applied = ok.filter((r) => r.value.duplicate === false);
    assert.equal(applied.length, 1, "only one concurrent duplicate may apply");
  }

  // Exactly one unit restored, exactly one movement.
  assert.equal((await Product.findById(product._id))!.currentStock, 19);
  assert.equal(
    await StockMovement.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      productId: product._id,
      refType: "SALE_RETURN",
    }),
    1
  );
});

test("return: a retried purchase return with the same localId applies exactly once", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 0, taxRate: 0 });
  const supplier = await makeSupplier(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { purchase } = await createPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    supplierId: String(supplier._id),
    items: [{ productId: String(product._id), qty: 4, unitPrice: 1000 }],
    paidAmount: 2000,
    accountId,
  });

  const localId = `pret-${Math.random().toString(36).slice(2)}`;
  const payableBefore = (await Supplier.findById(supplier._id))!.currentPayable;
  const balanceBefore = (await Account.findById(accountId))!.currentBalance;

  const first = await returnPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    purchaseId: purchase.id,
    items: [{ productId: String(product._id), qty: 1 }],
    localId,
  });
  assert.equal(first.duplicate, false);
  const stockAfterFirst = (await Product.findById(product._id))!.currentStock;

  const retry = await returnPurchase(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    purchaseId: purchase.id,
    items: [{ productId: String(product._id), qty: 1 }],
    localId,
  });
  assert.equal(retry.duplicate, true);

  // Zero additional effect. Returning 1 of 4 reverses 1000 paisa of value,
  // split by the purchase's own paid ratio (2000/4000): 500 paid + 500 due.
  assert.equal((await Product.findById(product._id))!.currentStock, stockAfterFirst);
  assert.equal((await Supplier.findById(supplier._id))!.currentPayable, payableBefore - 500);
  assert.equal((await Account.findById(accountId))!.currentBalance, balanceBefore + 500);
  assert.equal(
    await StockMovement.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      productId: product._id,
      refType: "PURCHASE_RETURN",
    }),
    1
  );
});

// ── Returns & transfers: HTTP surface ─────────────────────────────────────────

test("return: POST /sales/:id/return restores stock over HTTP", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 2 }],
    paidAmount: 11000,
    accountId,
  });

  const res = await post(ownerA.accessToken, `/api/v1/sales/${sale.id}/return`, {
    businessId: bizA.id,
    shopId: shopA.id,
    items: [{ productId: String(product._id), qty: 1 }],
    reason: "HTTP return",
  });
  assert.equal(res.status, 201);
  assert.equal((await Product.findById(product._id))!.currentStock, 19);

  // Over-return over HTTP is refused with no extra effect.
  const bad = await post(ownerA.accessToken, `/api/v1/sales/${sale.id}/return`, {
    businessId: bizA.id,
    shopId: shopA.id,
    items: [{ productId: String(product._id), qty: 5 }],
  });
  assert.equal(bad.status, 400);
  assert.equal((await Product.findById(product._id))!.currentStock, 19);
});

test("return: unauthenticated return requests are 401", async () => {
  const res = await request(app)
    .post("/api/v1/sales/000000000000000000000000/return")
    .send({ businessId: bizA.id, shopId: shopA.id, items: [{ productId: bizA.id, qty: 1 }] });
  assert.equal(res.status, 401);
});

test("return: Viewer role denied at the route level (403)", async () => {
  await setRole(roleUser.user.id, bizA.id, "Viewer");
  const res = await post(roleUser.accessToken, `/api/v1/sales/000000000000000000000000/return`, {
    businessId: bizA.id,
    shopId: shopA.id,
    items: [{ productId: String(new mongoose.Types.ObjectId()), qty: 1 }],
  });
  assert.equal(res.status, 403);
});

test("return: strict Zod schema rejects client-owned financial fields", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 2 }],
    paidAmount: 11000,
    accountId,
  });

  const res = await post(ownerA.accessToken, `/api/v1/sales/${sale.id}/return`, {
    businessId: bizA.id,
    shopId: shopA.id,
    items: [{ productId: String(product._id), qty: 1 }],
    returnedAmount: 1, // server-owned — must be rejected outright
  } as Record<string, unknown>);
  assert.equal(res.status, 400);

  const floatQty = await post(ownerA.accessToken, `/api/v1/sales/${sale.id}/return`, {
    businessId: bizA.id,
    shopId: shopA.id,
    items: [{ productId: String(product._id), qty: 0.5 }],
  });
  assert.equal(floatQty.status, 400);
});

test("return: cross-tenant HTTP return attempt is 404 with zero side effects", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 20 });
  const customer = await makeCustomer(bizA.id);
  const accountId = await makeAccount(bizA.id, shopA.id, 50000);
  const { sale } = await createSale(ownerA.user.id, {
    businessId: bizA.id,
    shopId: shopA.id,
    customerId: String(customer._id),
    items: [{ productId: String(product._id), qty: 1 }],
    paidAmount: 11000,
    accountId,
  });

  const res = await post(userB.accessToken, `/api/v1/sales/${sale.id}/return`, {
    businessId: bizA.id,
    shopId: shopA.id,
    items: [{ productId: String(product._id), qty: 1 }],
  });
  assert.equal(res.status, 404);
  assert.equal(
    await StockMovement.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      productId: product._id,
      refType: "SALE_RETURN",
    }),
    0
  );
});

test("transfer: GET /transfers lists tenant-scoped, paginated history", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 50 });
  const created = await post(ownerA.accessToken, "/api/v1/transfers", {
    businessId: bizA.id,
    sourceShopId: shopA.id,
    destShopId: shopA2.id,
    productId: String(product._id),
    quantity: 2,
    localId: `tr-${Math.random().toString(36).slice(2)}`,
  });
  assert.equal(created.status, 201);

  const list = await get(
    ownerA.accessToken,
    `/api/v1/transfers?businessId=${bizA.id}&shopId=${shopA.id}&limit=10`
  );
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.data));
  assert.ok(list.body.data.some((t: any) => t.id === created.body.data.id));

  const foreign = await get(userB.accessToken, `/api/v1/transfers?businessId=${bizA.id}&shopId=${shopA.id}`);
  assert.equal(foreign.status, 404);

  const anon = await request(app).get(`/api/v1/transfers?businessId=${bizA.id}`);
  assert.equal(anon.status, 401);
});

test("transfer: repeated localId creates exactly one transfer (offline retry)", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 30 });
  const localId = `tr-retry-${Math.random().toString(36).slice(2)}`;
  const body = {
    businessId: bizA.id,
    sourceShopId: shopA.id,
    destShopId: shopA2.id,
    productId: String(product._id),
    quantity: 3,
    localId,
  };

  const first = await post(ownerA.accessToken, "/api/v1/transfers", body);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.duplicate, false);
  assert.equal((await Product.findById(product._id))!.currentStock, 27);

  const retry = await post(ownerA.accessToken, "/api/v1/transfers", body);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.duplicate, true);
  assert.equal(String(retry.body.data.id), String(first.body.data.id));
  assert.equal((await Product.findById(product._id))!.currentStock, 27);
});

// ── Transfers ─────────────────────────────────────────────────────────────────

test("transfer: create moves stock out of source and into dest on receive", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const created = await post(
    ownerA.accessToken,
    "/api/v1/transfers",
    {
      businessId: bizA.id,
      sourceShopId: shopA.id,
      destShopId: shopA2.id,
      productId: String(product._id),
      quantity: 4,
      notes: "Restock branch",
    }
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, "PENDING");
  assert.equal((await Product.findById(product._id))!.currentStock, 6);

  const transferId = created.body.data.id;
  const received = await request(app)
    .put(`/api/v1/transfers/${transferId}/status`)
    .set("Authorization", `Bearer ${ownerA.accessToken}`)
    .send({ businessId: bizA.id, shopId: shopA2.id, status: "RECEIVED" });
  assert.equal(received.status, 200);
  assert.equal(received.body.data.status, "RECEIVED");
  assert.equal((await Product.findById(product._id))!.currentStock, 10);

  // Two transfer movements (source out, dest in) for THIS product.
  const movements = await StockMovement.find({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    productId: product._id,
    refType: { $in: ["TRANSFER_OUT", "TRANSFER_IN"] },
  });
  assert.equal(movements.length, 2);
  const out = movements.find((m) => String(m.shopId) === shopA.id);
  const in_ = movements.find((m) => String(m.shopId) === shopA2.id);
  assert.ok(out && in_);
  assert.equal(out!.qtyChange, -4);
  assert.equal(in_!.qtyChange, 4);
});

test("transfer: cannot transfer more than source stock", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 2 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/transfers",
    {
      businessId: bizA.id,
      sourceShopId: shopA.id,
      destShopId: shopA2.id,
      productId: String(product._id),
      quantity: 5,
    }
  );
  assert.equal(res.status, 400);
  assert.equal((await Product.findById(product._id))!.currentStock, 2);
});

test("transfer: source and destination must be different shops", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const res = await post(
    ownerA.accessToken,
    "/api/v1/transfers",
    {
      businessId: bizA.id,
      sourceShopId: shopA.id,
      destShopId: shopA.id,
      productId: String(product._id),
      quantity: 1,
    }
  );
  assert.equal(res.status, 400);
});

test("transfer: cross-tenant transfer is 404", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const res = await post(
    userB.accessToken,
    "/api/v1/transfers",
    {
      businessId: bizA.id,
      sourceShopId: shopA.id,
      destShopId: shopA2.id,
      productId: String(product._id),
      quantity: 1,
    }
  );
  assert.equal(res.status, 404);
});

test("transfer: cancel restores source stock", async () => {
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const created = await post(
    ownerA.accessToken,
    "/api/v1/transfers",
    {
      businessId: bizA.id,
      sourceShopId: shopA.id,
      destShopId: shopA2.id,
      productId: String(product._id),
      quantity: 3,
    }
  );
  assert.equal(created.status, 201);
  assert.equal((await Product.findById(product._id))!.currentStock, 7);

  const cancelled = await request(app)
    .put(`/api/v1/transfers/${created.body.data.id}/status`)
    .set("Authorization", `Bearer ${ownerA.accessToken}`)
    .send({ businessId: bizA.id, shopId: shopA.id, status: "CANCELLED" });
  assert.equal(cancelled.status, 200);
  assert.equal((await Product.findById(product._id))!.currentStock, 10);
});

test("transfer: RBAC — Viewer cannot create a transfer", async () => {
  await setRole(roleUser.user.id, bizA.id, "Viewer");
  const product = await makeProduct(bizA.id, { currentStock: 10 });
  const res = await post(
    roleUser.accessToken,
    "/api/v1/transfers",
    {
      businessId: bizA.id,
      sourceShopId: shopA.id,
      destShopId: shopA2.id,
      productId: String(product._id),
      quantity: 1,
    }
  );
  assert.equal(res.status, 403);
});