/**
 * Phase 07 â€” Double-Entry Accounting Engine tests.
 *
 * Batch 1: sale COGS journaling (Dr Cost of Goods Sold / Cr Inventory from
 * the authoritative SaleItem.costPrice snapshots).
 * Later batches: return contra journals, cash transfers, ledger / trial
 * balance / P&L / balance sheet / cash flow reporting.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Product } from "../src/models/Product";
import { Customer } from "../src/models/Customer";
import { Account } from "../src/models/Account";
import { Business } from "../src/models/Business";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { JOURNAL_ACCOUNTS } from "../src/config/accounts";
import { StockReturn } from "../src/models/StockReturn";
import { Sale } from "../src/models/Sale";

const DEV = { deviceId: "acct-dev", deviceName: "AcctTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Acct User",
    email: `ac${Math.random().toString(36).slice(2)}@example.com`,
    phone: "018" + Math.floor(10000000 + Math.random() * 89999999),
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

async function makeProduct(businessId: string, over: Record<string, unknown> = {}) {
  return Product.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `P-${Math.random().toString(36).slice(2)}`,
    sellingPrice: 10000,
    purchasePrice: 6000,
    taxRate: 10,
    currentStock: 100,
    status: "ACTIVE",
    ...over,
  });
}

async function makeCustomer(businessId: string) {
  return Customer.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    name: `C-${Math.random().toString(36).slice(2)}`,
    currentDue: 0,
  });
}

async function makeAccount(businessId: string, shopId: string, balancePaisa = 0) {
  const acct = await Account.create({
    businessId: new mongoose.Types.ObjectId(businessId),
    shopId: new mongoose.Types.ObjectId(shopId),
    name: `Acct-${Math.random().toString(36).slice(2)}`,
    type: "CASH",
    currentBalance: balancePaisa,
  });
  return String(acct._id);
}

async function linesOf(entryId: mongoose.Types.ObjectId) {
  return JournalLine.find({ entryId }).lean();
}

let owner: any;
let biz: any;
let shop: any;

before(async () => {
  await connectTestDb("business-os-test-accounting");
  owner = await registerUser();
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ name: "Acct Business", type: "retail" });
  biz = res.body.data;
  const shopRes = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, name: "Main", branchCode: `AC-${Math.random().toString(36).slice(2)}` });
  shop = shopRes.body.data;
});

after(async () => {
  await disconnectTestDb();
});

async function completedSale(items: object[], over: Record<string, unknown> = {}) {
  const accountId = await makeAccount(biz.id, shop.id, 500000);
  const res = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, items, accountId, ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

test("accounting: sale finalization journals COGS from the cost snapshot and stays balanced", async () => {
  const product = await makeProduct(biz.id); // purchasePrice 6000 â†’ costPrice 6000
  const customer = await makeCustomer(biz.id);
  // 3 Ã— 10000 @ 10% tax, fully paid: total 33000, COGS 18000.
  const sale = await completedSale(
    [{ productId: String(product._id), qty: 3 }],
    { customerId: String(customer._id), paidAmount: 33000 }
  );

  const entry = await JournalEntry.findOne({
    businessId: new mongoose.Types.ObjectId(biz.id),
    referenceType: "SALE",
    referenceId: new mongoose.Types.ObjectId(sale.id),
  });
  assert.ok(entry);
  const lines = await linesOf(entry!._id as mongoose.Types.ObjectId);

  const cogs = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD);
  const inventory = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.INVENTORY);
  assert.ok(cogs && inventory);
  assert.equal(cogs!.debit, 18000);
  assert.equal(cogs!.credit, 0);
  assert.equal(cogs!.accountType, "EXPENSE");
  assert.equal(inventory!.credit, 18000);
  assert.equal(inventory!.debit, 0);
  assert.equal(inventory!.accountType, "ASSET");

  // Money legs unchanged: Cash 33000 Dr / Revenue 30000 Cr / Tax 3000 Cr.
  const revenue = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.SALES_REVENUE);
  assert.equal(revenue!.credit, 30000);

  // The whole entry balances exactly.
  const debitTotal = lines.reduce((s, l) => s + l.debit, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debitTotal, creditTotal);
  assert.equal(debitTotal, 51000); // 33000 money + 18000 COGS
});

test("accounting: zero-cost sales omit the COGS legs entirely", async () => {
  const product = await makeProduct(biz.id, { purchasePrice: 0, sellingPrice: 2500, taxRate: 0 });
  const sale = await completedSale([{ productId: String(product._id), qty: 2 }], {
    paidAmount: 5000,
  });

  const entry = await JournalEntry.findOne({
    businessId: new mongoose.Types.ObjectId(biz.id),
    referenceType: "SALE",
    referenceId: new mongoose.Types.ObjectId(sale.id),
  });
  assert.ok(entry);
  const lines = await linesOf(entry!._id as mongoose.Types.ObjectId);
  assert.equal(lines.some((l) => l.accountName === JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD), false);
  assert.equal(lines.some((l) => l.accountName === JOURNAL_ACCOUNTS.INVENTORY), false);
  assert.equal(lines.length, 2); // Cash / Sales Revenue only

  const debitTotal = lines.reduce((s, l) => s + l.debit, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debitTotal, creditTotal);
});

// â”€â”€ Batch 2: return contra journals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function returnSaleOverHttp(saleId: string, items: object[], reason?: string, shopOverride?: string) {
  const res = await request(app)
    .post(`/api/v1/sales/${saleId}/return`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, shopId: shopOverride ?? shop.id, items, reason });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function returnPurchaseOverHttp(purchaseId: string, items: object[]) {
  const res = await request(app)
    .post(`/api/v1/purchases/${purchaseId}/return`)
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, items });
  assert.equal(res.status, 201);
  return res.body.data;
}

test("accounting: sale return uses the Sales Returns contra account and reverses COGS exactly", async () => {
  const product2 = await makeProduct(biz.id); // identical economics
  const customer = await makeCustomer(biz.id);
  // 4 units @ 10000, 10% tax, fully paid; costPrice 6000.
  const sale = await completedSale(
    [{ productId: String(product2._id), qty: 4 }],
    { customerId: String(customer._id), paidAmount: 44000 }
  );

  await returnSaleOverHttp(sale.id, [{ productId: String(product2._id), qty: 1 }]);

  const stockReturn = await StockReturn.findOne({
    sourceDocId: new mongoose.Types.ObjectId(sale.id),
  });
  assert.ok(stockReturn);
  const retEntry = await JournalEntry.findOne({ referenceId: stockReturn!._id });
  assert.ok(retEntry);
  const lines = await linesOf(retEntry!._id as mongoose.Types.ObjectId);

  // Quarter of the doc: contra-revenue 10000, tax 1000, cash back 11000,
  // COGS reversal EXACTLY 1 Ã— 6000 (not a blended ratio).
  const salesReturns = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.SALES_RETURNS);
  const tax = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.TAX_PAYABLE);
  const cash = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.CASH);
  const cogs = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD);
  const inventory = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.INVENTORY);
  const revenue = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.SALES_REVENUE);
  assert.ok(salesReturns && tax && cash && cogs && inventory);
  assert.ok(!revenue, "returns must hit the contra account, not Sales Revenue");
  assert.equal(salesReturns!.debit, 10000);
  assert.equal(salesReturns!.accountType, "REVENUE");
  assert.equal(tax!.debit, 1000);
  assert.equal(cash!.credit, 11000);
  assert.equal(inventory!.debit, 6000);
  assert.equal(cogs!.credit, 6000);

  const debitTotal = lines.reduce((s, l) => s + l.debit, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debitTotal, creditTotal);
  assert.equal(debitTotal, 17000); // 11000 money + 6000 cost
});

test("accounting: multi-line sale return reverses each line's own cost, never a blended ratio", async () => {
  // High margin product A (cost 1000) and low margin product B (cost 9000),
  // same selling price. Returning ONLY B must reverse 9000, not an average.
  const productA = await makeProduct(biz.id, { purchasePrice: 1000 });
  const productB = await makeProduct(biz.id, { purchasePrice: 9000 });
  const sale = await completedSale(
    [
      { productId: String(productA._id), qty: 2 },
      { productId: String(productB._id), qty: 2 },
    ],
    { paidAmount: 44000 } // total = 4 Ã— 11000
  );

  await returnSaleOverHttp(sale.id, [{ productId: String(productB._id), qty: 1 }]);

  const stockReturn = await StockReturn.findOne({
    sourceDocId: new mongoose.Types.ObjectId(sale.id),
  });
  assert.ok(stockReturn);
  const retEntry = await JournalEntry.findOne({ referenceId: stockReturn!._id });
  assert.ok(retEntry);
  const lines = await linesOf(retEntry!._id as mongoose.Types.ObjectId);
  const cogs = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD)!;
  const inventory = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.INVENTORY)!;
  assert.equal(cogs.credit, 9000); // B's own cost
  assert.equal(inventory.debit, 9000);

  const debitTotal = lines.reduce((s, l) => s + l.debit, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debitTotal, creditTotal);
});

test("accounting: purchase return releases the Inventory asset and stays balanced", async () => {
  const supplierRes = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, name: `S-${Math.random().toString(36).slice(2)}` });
  assert.equal(supplierRes.status, 201);
  const supplierId = supplierRes.body.data.id;

  const product = await makeProduct(biz.id);
  const accountId = await makeAccount(biz.id, shop.id, 100000);
  const res = await request(app)
    .post("/api/v1/purchases")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id,
      shopId: shop.id,
      supplierId,
      items: [{ productId: String(product._id), qty: 5 }],
      paidAmount: 25000,
      accountId,
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, "COMPLETED");
  const purchase = res.body.data;

  await returnPurchaseOverHttp(purchase.id, [{ productId: String(product._id), qty: 2 }]);

  const stockReturn = await StockReturn.findOne({
    sourceDocId: new mongoose.Types.ObjectId(purchase.id),
  });
  assert.ok(stockReturn);
  const retEntry = await JournalEntry.findOne({ referenceId: stockReturn!._id });
  assert.ok(retEntry);
  const lines = await linesOf(retEntry!._id as mongoose.Types.ObjectId);
  // Perpetual inventory: the asset account itself is released (2 Ã— 6000).
  const inventory = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.INVENTORY);
  assert.ok(inventory);
  assert.equal(inventory!.credit, 12000);
  assert.equal(inventory!.accountType, "ASSET");

  const debitTotal = lines.reduce((s, l) => s + l.debit, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debitTotal, creditTotal);
});



// ── Batch 3: account-to-account cash transfers ──────────────────────────

import { transferCash } from "../src/services/account.service";
import { AuditLog } from "../src/models/AuditLog";
import { BusinessMembership } from "../src/models/BusinessMembership";

async function makeAccountNamed(name: string, balancePaisa: number) {
  const acct = await Account.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: new mongoose.Types.ObjectId(shop.id),
    name,
    type: "CASH",
    currentBalance: balancePaisa,
  });
  return String(acct._id);
}

async function registerRoleUser() {
  const reg = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "Role User",
      email: `xfer${Math.random().toString(36).slice(2)}@example.com`,
      phone: "016" + Math.floor(10000000 + Math.random() * 89999999),
      password: "password123",
      ...DEV,
    });
  assert.equal(reg.status, 201);
  await BusinessMembership.create({
    userId: new mongoose.Types.ObjectId(reg.body.data.user.id),
    businessId: new mongoose.Types.ObjectId(biz.id),
    role: "Viewer",
  });
  return { token: reg.body.data.accessToken as string, userId: reg.body.data.user.id as string };
}

test("accounting: cash transfer moves both balances and journals DestCash Dr / SourceCash Cr", async () => {
  const fromId = await makeAccountNamed(`From-${Math.random().toString(36).slice(2)}`, 50000);
  // Destination is a BANK asset so the legs carry distinct GL names.
  const bankAcct = await Account.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: new mongoose.Types.ObjectId(shop.id),
    name: `Bank-${Math.random().toString(36).slice(2)}`,
    type: "BANK",
    currentBalance: 10000,
  });
  const toId = String(bankAcct._id);

  const res = await request(app)
    .post("/api/v1/accounts/transfer")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, fromAccountId: fromId, toAccountId: toId, amount: 20000 });
  assert.equal(res.status, 201);

  assert.equal((await Account.findById(fromId))!.currentBalance, 30000);
  assert.equal((await Account.findById(toId))!.currentBalance, 30000);

  const entry = await JournalEntry.findById(res.body.data.journalEntryId);
  assert.ok(entry);
  const lines = await linesOf(entry!._id as mongoose.Types.ObjectId);
  const debitTotal = lines.reduce((s, l) => s + l.debit, 0);
  const creditTotal = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(debitTotal, creditTotal);
  assert.equal(debitTotal, 20000);
  // Journal per phase-07.md: Dr DestCash(=Bank here) / Cr SourceCash.
  const debitLine = lines.find((l) => l.debit > 0)!;
  const creditLine = lines.find((l) => l.credit > 0)!;
  assert.equal(debitLine.accountName, JOURNAL_ACCOUNTS.BANK);
  assert.equal(debitLine.accountType, "ASSET");
  assert.equal(creditLine.accountName, JOURNAL_ACCOUNTS.CASH);
  assert.ok(await AuditLog.findOne({ action: "CASH_TRANSFERRED" }));
});

test("accounting: cash transfer with insufficient balance rolls back completely", async () => {
  const fromId = await makeAccountNamed(`Broke-${Math.random().toString(36).slice(2)}`, 5000);
  const toId = await makeAccountNamed(`Other-${Math.random().toString(36).slice(2)}`, 0);
  const before = new Date();

  await assert.rejects(
    () =>
      transferCash(owner.user.id, {
        businessId: biz.id,
        shopId: shop.id,
        fromAccountId: fromId,
        toAccountId: toId,
        amount: 99999,
      }),
    /insufficient/i
  );

  // Real database state: nothing moved, nothing written after the attempt.
  assert.equal((await Account.findById(fromId))!.currentBalance, 5000);
  assert.equal((await Account.findById(toId))!.currentBalance, 0);
  assert.equal(
    await JournalEntry.countDocuments({
      referenceType: "CASH_TRANSFER",
      createdAt: { $gt: before },
    }),
    0
  );
  assert.equal(
    await AuditLog.countDocuments({ action: "CASH_TRANSFERRED", createdAt: { $gt: before } }),
    0
  );
});

test("accounting: cash transfer RBAC — Viewer/Salesperson/Inventory Manager refused at route AND service", async () => {
  for (const role of ["Viewer", "Salesperson", "Inventory Manager"]) {
    const { token, userId } = await registerRoleUser();
    await BusinessMembership.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(biz.id) },
      { role }
    );

    const res = await request(app)
      .post("/api/v1/accounts/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({
        businessId: biz.id,
        shopId: shop.id,
        fromAccountId: new mongoose.Types.ObjectId().toString(),
        toAccountId: new mongoose.Types.ObjectId().toString(),
        amount: 100,
      });
    assert.equal(res.status, 403, `${role} must be 403 at the route`);

    // Service-level re-check with valid-looking ids — still forbidden.
    const fromId = await makeAccountNamed(`R-${Math.random().toString(36).slice(2)}`, 1000);
    const toId = await makeAccountNamed(`D-${Math.random().toString(36).slice(2)}`, 0);
    await assert.rejects(
      () =>
        transferCash(userId, {
          businessId: biz.id,
          shopId: shop.id,
          fromAccountId: fromId,
          toAccountId: toId,
          amount: 100,
        }),
      /insufficient role/i
    );
  }

  // The money-mover matrix allows Accountant.
  const accountant = await registerRoleUser();
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(accountant.userId), businessId: new mongoose.Types.ObjectId(biz.id) },
    { role: "Accountant" }
  );
  const fromId = await makeAccountNamed(`A1-${Math.random().toString(36).slice(2)}`, 4000);
  const toId = await makeAccountNamed(`A2-${Math.random().toString(36).slice(2)}`, 0);
  const result = await transferCash(accountant.userId, {
    businessId: biz.id,
    shopId: shop.id,
    fromAccountId: fromId,
    toAccountId: toId,
    amount: 1000,
  });
  assert.equal(result.duplicate, false);
  assert.equal((await Account.findById(fromId))!.currentBalance, 3000);
});

test("accounting: cross-tenant cash transfer is 404", async () => {
  const outsider = await registerRoleUser(); // has membership in biz only
  void outsider;
  const otherReg = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "Other Owner",
      email: `other${Math.random().toString(36).slice(2)}@example.com`,
      phone: "015" + Math.floor(10000000 + Math.random() * 89999999),
      password: "password123",
      ...DEV,
    });
  assert.equal(otherReg.status, 201);
  const otherToken = otherReg.body.data.accessToken;

  const foreignFrom = await Account.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: new mongoose.Types.ObjectId(shop.id),
    name: `F-${Math.random().toString(36).slice(2)}`,
    type: "CASH",
    currentBalance: 99999,
  });

  const res = await request(app)
    .post("/api/v1/accounts/transfer")
    .set("Authorization", `Bearer ${otherToken}`)
    .send({
      businessId: biz.id,
      shopId: shop.id,
      fromAccountId: String(foreignFrom._id),
      toAccountId: String(foreignFrom._id),
      amount: 1,
    });
  assert.equal(res.status, 404);

  // Zero side effects on the foreign account.
  assert.equal((await Account.findById(foreignFrom._id))!.currentBalance, 99999);
});

test("accounting: cash transfer rejects same-account, spoofed fields and bad amounts", async () => {
  const fromId = await makeAccountNamed(`V1-${Math.random().toString(36).slice(2)}`, 1000);
  const toId = await makeAccountNamed(`V2-${Math.random().toString(36).slice(2)}`, 1000);
  const post = (body: Record<string, unknown>) =>
    request(app)
      .post("/api/v1/accounts/transfer")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(body);

  const same = await post({ businessId: biz.id, shopId: shop.id, fromAccountId: fromId, toAccountId: fromId, amount: 100 });
  assert.equal(same.status, 400);

  const zero = await post({ businessId: biz.id, shopId: shop.id, fromAccountId: fromId, toAccountId: toId, amount: 0 });
  assert.equal(zero.status, 400);

  const float = await post({ businessId: biz.id, shopId: shop.id, fromAccountId: fromId, toAccountId: toId, amount: 10.5 });
  assert.equal(float.status, 400);

  const malformed = await post({ businessId: biz.id, shopId: shop.id, fromAccountId: "nope", toAccountId: toId, amount: 100 });
  assert.equal(malformed.status, 400);

  const spoof = await post({
    businessId: biz.id, shopId: shop.id, fromAccountId: fromId, toAccountId: toId,
    amount: 100, status: "DONE",
  });
  assert.equal(spoof.status, 400); // .strict() rejects unknown fields

  const missingShop = await post({ businessId: biz.id, fromAccountId: fromId, toAccountId: toId, amount: 100 });
  assert.equal(missingShop.status, 400);
});

test("accounting: cash transfer is idempotent on localId retry (sequential)", async () => {
  const fromId = await makeAccountNamed(`I1-${Math.random().toString(36).slice(2)}`, 30000);
  const toId = await makeAccountNamed(`I2-${Math.random().toString(36).slice(2)}`, 0);
  const body = {
    businessId: biz.id, shopId: shop.id, fromAccountId: fromId, toAccountId: toId,
    amount: 12000, localId: `xfer-retry-${Date.now()}`,
  };

  const first = await request(app)
    .post("/api/v1/accounts/transfer").set("Authorization", `Bearer ${owner.accessToken}`).send(body);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.duplicate, false);

  const retry = await request(app)
    .post("/api/v1/accounts/transfer").set("Authorization", `Bearer ${owner.accessToken}`).send(body);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.duplicate, true);
  assert.equal(String(retry.body.data.journalEntryId), String(first.body.data.journalEntryId));

  assert.equal((await Account.findById(fromId))!.currentBalance, 18000);
  assert.equal((await Account.findById(toId))!.currentBalance, 12000);
});

test("accounting: concurrent duplicate cash transfers apply exactly once", async () => {
  const fromId = await makeAccountNamed(`C1-${Math.random().toString(36).slice(2)}`, 90000);
  const toId = await makeAccountNamed(`C2-${Math.random().toString(36).slice(2)}`, 0);
  const input = {
    businessId: biz.id as string, shopId: shop.id as string, fromAccountId: fromId,
    toAccountId: toId, amount: 25000, localId: `xfer-conc-${Date.now()}`,
  };

  const results = await Promise.allSettled([
    transferCash(owner.user.id, input),
    transferCash(owner.user.id, input),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<
    Awaited<ReturnType<typeof transferCash>>
  >[];
  assert.equal(fulfilled.length, 2);
  assert.equal(fulfilled.filter((r) => r.value.duplicate === false).length, 1);

  assert.equal((await Account.findById(fromId))!.currentBalance, 65000);
  assert.equal((await Account.findById(toId))!.currentBalance, 25000);
});

// ── Batch 4: accounting reports ─────────────────────────────────────────

const ACCT_BASE = "/api/v1/accounting";

function acctGet(token: string, path: string) {
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

async function expenseOverHttp(accountId: string, amount: number, shopOverride?: string) {
  const res = await request(app)
    .post("/api/v1/expenses")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, shopId: shopOverride ?? shop.id, category: "RENT", amount, paymentAccountId: accountId });
  assert.equal(res.status, 201);
  return res.body.data;
}

test("accounting: trial balance is balanced and nets every account", async () => {
  const product = await makeProduct(biz.id);
  await completedSale([{ productId: String(product._id), qty: 2 }], { paidAmount: 22000 });
  const acct = await Account.findOne({ businessId: biz.id, shopId: shop.id }).sort({ createdAt: -1 });
  const expense = await request(app)
    .post("/api/v1/expenses")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, category: "RENT", amount: 5000, paymentAccountId: String(acct!._id) });
  assert.equal(expense.status, 201);

  const res = await acctGet(owner.accessToken, `${ACCT_BASE}/trial-balance?businessId=${biz.id}&shopId=${shop.id}`);
  assert.equal(res.status, 200);
  const { balanced, totalDebit, totalCredit, accounts } = res.body.data;
  assert.equal(balanced, true);
  assert.equal(totalDebit, totalCredit);

  const rent = accounts.find((a: { accountName: string }) => a.accountName === "Rent");
  assert.ok(rent);
  assert.equal(rent.debit - rent.credit, 5000);
  assert.equal(rent.accountType, "EXPENSE");
});

test("accounting: P&L derives revenue, exact COGS and net profit from journals", async () => {
  // Fresh product economics: revenue 30000 (2 × 15000 @ 0% tax), COGS 18000,
  // plus a 4000 rent expense → gross 12000, net 8000.
  const product = await makeProduct(biz.id, {
    sellingPrice: 15000, purchasePrice: 9000, taxRate: 0,
  });
  const sale = await completedSale([{ productId: String(product._id), qty: 2 }], { paidAmount: 30000 });
  void sale;
  const cashAcct = await Account.findOne({ businessId: biz.id, shopId: shop.id }).sort({ createdAt: -1 });
  await expenseOverHttp(String(cashAcct!._id), 4000);

  const res = await acctGet(owner.accessToken, `${ACCT_BASE}/profit-loss?businessId=${biz.id}&shopId=${shop.id}`);
  assert.equal(res.status, 200);
  const pl = res.body.data;
  // NOTE: this business accumulated earlier sales in this file; assert DELTAS
  // are present rather than absolute totals — the absolute case is covered by
  // the isolated-shop test below.
  assert.ok(pl.revenue.total >= 30000);
  assert.ok(pl.cogs.total >= 18000);
  const rentLine = pl.operatingExpenses.accounts.find(
    (a: { accountName: string }) => a.accountName === "Rent"
  );
  assert.ok(rentLine);
  assert.ok(pl.netProfit > 0);
});

test("accounting: P&L on an isolated shop matches hand-computed figures exactly", async () => {
  // Second shop of the same business — clean ledger slate.
  const shopRes = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, name: "Report Shop", branchCode: `RP-${Math.random().toString(36).slice(2)}` });
  assert.equal(shopRes.status, 201);
  const shop2 = shopRes.body.data;

  const product = await makeProduct(biz.id, { sellingPrice: 10000, purchasePrice: 6000, taxRate: 0 });
  const accountId = await makeAccount(biz.id, shop2.id, 0);
  const saleRes = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id, shopId: shop2.id,
      items: [{ productId: String(product._id), qty: 3 }],
      accountId, paidAmount: 30000,
    });
  assert.equal(saleRes.status, 201);

  const expRes = await request(app)
    .post("/api/v1/expenses")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, shopId: shop2.id, category: "INTERNET", amount: 2500, paymentAccountId: accountId });
  assert.equal(expRes.status, 201);

  const res = await acctGet(owner.accessToken, `${ACCT_BASE}/profit-loss?businessId=${biz.id}&shopId=${shop2.id}`);
  assert.equal(res.status, 200);
  const pl = res.body.data;
  assert.equal(pl.revenue.total, 30000);
  assert.equal(pl.cogs.total, 18000);   // 3 × 6000 from the snapshot
  assert.equal(pl.grossProfit, 12000);
  assert.equal(pl.operatingExpenses.total, 2500);
  assert.equal(pl.netProfit, 9500);
});

test("accounting: sales return flows through the contra account into the P&L", async () => {
  const shopRes = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, name: `CF-${Math.random().toString(36).slice(2)}`, branchCode: `CF-${Math.random().toString(36).slice(2)}` });
  const shop3 = shopRes.body.data;
  const product = await makeProduct(biz.id, { sellingPrice: 10000, purchasePrice: 6000, taxRate: 0 });
  const accountId = await makeAccount(biz.id, shop3.id, 0);
  await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id, shopId: shop3.id,
      items: [{ productId: String(product._id), qty: 4 }],
      accountId, paidAmount: 40000,
    });
  const createdSale = await Sale.findOne({ shopId: new mongoose.Types.ObjectId(shop3.id) });
  assert.ok(createdSale);
  await returnSaleOverHttp(createdSale!.id, [
    { productId: String(product._id), qty: 1 },
  ], undefined, shop3.id);

  const res = await acctGet(owner.accessToken, `${ACCT_BASE}/profit-loss?businessId=${biz.id}&shopId=${shop3.id}`);
  const pl = res.body.data;
  // Revenue nets to 40000 − 10000 via Sales Returns; COGS nets 24000 − 6000.
  assert.equal(pl.revenue.total, 30000);
  assert.equal(pl.cogs.total, 18000);
  assert.equal(pl.grossProfit, 12000);
  const returnsLine = pl.revenue.accounts.find(
    (a: { accountName: string }) => a.accountName === JOURNAL_ACCOUNTS.SALES_RETURNS
  );
  assert.ok(returnsLine);
  assert.equal(returnsLine.amount, -10000); // contra presented as negative revenue
});

test("accounting: balance sheet balances with visible unreconciled opening equity", async () => {
  // Dedicated shop so the assertion doesn't depend on execution order.
  const shopRes = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, name: `BS-${Math.random().toString(36).slice(2)}`, branchCode: `BS-${Math.random().toString(36).slice(2)}` });
  const shopB = shopRes.body.data;

  // Purchase 5 @6000, zero tax (Inventory +30000 Dr; Cash −25000 Cr; Payable +5000 Cr),
  // then a cash sale 2 @10000 tax0 (Cash +20000 Dr; Revenue Cr; COGS/Inv 12000).
  const product = await makeProduct(biz.id, { taxRate: 0 });
  const supplierRes = await request(app)
    .post("/api/v1/suppliers")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, name: `BS-S-${Math.random().toString(36).slice(2)}` });
  const purchaseAcc = await makeAccount(biz.id, shopB.id, 60000);
  await request(app)
    .post("/api/v1/purchases")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id, shopId: shopB.id, supplierId: supplierRes.body.data.id,
      items: [{ productId: String(product._id), qty: 5 }],
      paidAmount: 25000, accountId: purchaseAcc,
    });
  const saleAcc = await makeAccount(biz.id, shopB.id, 0);
  await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id, shopId: shopB.id,
      items: [{ productId: String(product._id), qty: 2 }],
      accountId: saleAcc, paidAmount: 20000,
    });

  const res = await acctGet(owner.accessToken, `${ACCT_BASE}/balance-sheet?businessId=${biz.id}&shopId=${shopB.id}`);
  assert.equal(res.status, 200);
  const bs = res.body.data;
  assert.equal(bs.balanced, true);
  assert.equal(bs.assets.total, bs.liabilities.total + bs.equity.total);

  // Hand-computed from the journal lines (makeProduct seeds stock 100 @
  // avgCost 0, so the purchase blends avgCost to round(30000/105) = 286):
  //   Purchase: Inventory Dr 30000 / Cash Cr 25000 / Payable Cr 5000
  //   Sale:     Cash Dr 20000 / Revenue Cr 20000 / COGS Dr 572 / Inv Cr 572
  //   Assets:   Inventory 29428 + Cash −5000 = 24428
  assert.equal(bs.assets.total, 24428);
  assert.equal(bs.liabilities.total, 5000);

  // NI = revenue 20000 − COGS 572 = 19428; RE (balancing figure) matches
  // because this shop has no unjournaled opening cash.
  assert.equal(bs.netProfitAllTime, 19428);
  assert.equal(bs.equity.retainedEarnings, 19428);
  assert.equal(bs.unreconciledOpeningEquity, 0);
});

test("accounting: general ledger filters by account with an exact running balance", async () => {
  const res = await acctGet(
    owner.accessToken,
    `${ACCT_BASE}/ledger?businessId=${biz.id}&shopId=${shop.id}&accountName=${encodeURIComponent(JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD)}`
  );
  assert.equal(res.status, 200);
  const { items } = res.body.data;
  assert.ok(items.length >= 2); // several sales in this shop during this file
  for (const item of items) {
    assert.equal(item.accountName, JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD);
  }
  // Every row's runningBalance is monotone under debits.
  for (let i = 1; i < items.length; i++) {
    assert.ok(items[i].runningBalance >= items[i - 1].runningBalance);
  }
});

test("accounting: journal listing paginates and filters by referenceType", async () => {
  const all = await acctGet(owner.accessToken, `${ACCT_BASE}/journal?businessId=${biz.id}&shopId=${shop.id}&limit=5`);
  assert.equal(all.status, 200);
  assert.ok(all.body.data.items.length <= 5);
  assert.ok(all.body.data.pagination.totalPages >= 1);
  assert.ok(all.body.data.items.every((e: { lines: object[] }) => e.lines.length >= 2));

  const salesOnly = await acctGet(
    owner.accessToken,
    `${ACCT_BASE}/journal?businessId=${biz.id}&shopId=${shop.id}&referenceType=SALE`
  );
  assert.equal(salesOnly.status, 200);
  assert.ok(salesOnly.body.data.items.length >= 1);
  assert.ok(salesOnly.body.data.items.every((e: { referenceType: string }) => e.referenceType === "SALE"));
});

test("accounting: reports refuse Salesperson/Viewer/Inventory Manager and foreign tenants", async () => {
  const { token } = await registerRoleUser(); // Viewer membership
  for (const path of ["/profit-loss", "/balance-sheet", "/trial-balance", "/cash-flow", "/ledger", "/journal"]) {
    const denied = await acctGet(token, `${ACCT_BASE}${path}?businessId=${biz.id}&shopId=${shop.id}`);
    assert.equal(denied.status, 403, `${path} must be 403`);
  }

  // Foreign tenant: unknown business → 404 via resolveBusiness/membership.
  const otherReg = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "Rep Other",
      email: `rep${Math.random().toString(36).slice(2)}@example.com`,
      phone: "013" + Math.floor(10000000 + Math.random() * 89999999),
      password: "password123",
      ...DEV,
    });
  const otherToken = otherReg.body.data.accessToken;
  const foreign = await acctGet(otherToken, `${ACCT_BASE}/profit-loss?businessId=${biz.id}&shopId=${shop.id}`);
  assert.equal(foreign.status, 404);
});

test("accounting: cash flow separates operating flows from inter-account transfers", async () => {
  const shopRes = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, name: `Flow-${Math.random().toString(36).slice(2)}`, branchCode: `FL-${Math.random().toString(36).slice(2)}` });
  const shopF = shopRes.body.data;
  const product = await makeProduct(biz.id, { sellingPrice: 8000, purchasePrice: 3000, taxRate: 0 });
  const accountId = await makeAccount(biz.id, shopF.id, 0);
  // Operating inflow: cash sale 16000. Outflow: expense 1000.
  await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({
      businessId: biz.id, shopId: shopF.id,
      items: [{ productId: String(product._id), qty: 2 }],
      accountId, paidAmount: 16000,
    });
  await expenseOverHttp(accountId, 1000, shopF.id);
  // Inter-account transfer 5000: must NOT inflate operating flows.
  const destAccount = await Account.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: new mongoose.Types.ObjectId(shopF.id),
    name: `BankF-${Math.random().toString(36).slice(2)}`,
    type: "BANK",
    currentBalance: 0,
  });
  await transferCash(owner.user.id, {
    businessId: biz.id, shopId: shopF.id,
    fromAccountId: accountId, toAccountId: String(destAccount._id),
    amount: 5000, localId: `cf-xfer-${Date.now()}`,
  });

  const res = await acctGet(owner.accessToken, `${ACCT_BASE}/cash-flow?businessId=${biz.id}&shopId=${shopF.id}`);
  assert.equal(res.status, 200);
  const cf = res.body.data;
  assert.equal(cf.operating.inflow, 16000);
  assert.equal(cf.operating.outflow, 1000);
  assert.equal(cf.operating.net, 15000);
  assert.equal(cf.interAccountTransfers.inflow, 5000);
  assert.equal(cf.interAccountTransfers.outflow, 5000);
  assert.equal(cf.interAccountTransfers.net, 0);
  assert.equal(cf.netCashFlow, 15000);
});


