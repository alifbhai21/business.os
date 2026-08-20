import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Account } from "../src/models/Account";
import { Expense } from "../src/models/Expense";
import { AuditLog } from "../src/models/AuditLog";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { BusinessMembership } from "../src/models/BusinessMembership";
import { createExpense } from "../src/services/expense.service";
import { AccountType, JOURNAL_ACCOUNTS, expenseAccountName } from "../src/config/accounts";

const DEV = { deviceId: "exp-dev", deviceName: "ExpTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Expense User",
    email: `exp${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Expense Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `EXP-${Math.random().toString(36).slice(2)}`, ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

/**
 * Seed a payment account with a known balance directly through the model.
 * Balances are never client-settable through the API, and going through the
 * model keeps the HTTP request count of this file well under the global
 * rate limiter (100 req/min).
 */
async function makeAccount(
  businessId: string,
  shopId: string,
  balancePaisa: number,
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

function expenseBody(businessId: string, shopId: string, over: Record<string, unknown> = {}) {
  return { businessId, shopId, category: "RENT", amount: 5000, ...over };
}

function post(token: string, body: Record<string, unknown>) {
  return request(app).post("/api/v1/expenses").set("Authorization", `Bearer ${token}`).send(body);
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
  await connectTestDb("business-os-test-expense");
  ownerA = await registerUser();
  bizA = await createBusiness(ownerA.accessToken);
  shopA = await createShop(ownerA.accessToken, bizA.id);
  shopA2 = await createShop(ownerA.accessToken, bizA.id, { name: "Second Branch" });
  userB = await registerUser();
  bizB = await createBusiness(userB.accessToken);
  shopB = await createShop(userB.accessToken, bizB.id);
  // A second member of business A whose role is flipped by the RBAC tests.
  roleUser = await registerUser();
  await BusinessMembership.create({
    userId: new mongoose.Types.ObjectId(roleUser.user.id),
    businessId: new mongoose.Types.ObjectId(bizA.id),
    shopId: null,
    role: "Accountant",
    status: "ACTIVE",
    permissions: [],
  });
});

after(async () => {
  await disconnectTestDb();
});

test("expense: create valid expense (201) and read it back", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, {
      category: "RENT",
      amount: 12500,
      paymentAccountId,
      note: "August rent",
      receiptUrl: "https://example.com/receipt.png",
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.category, "RENT");
  assert.equal(res.body.data.amount, 12500);
  assert.equal(res.body.data.paymentAccountId, paymentAccountId);
  assert.equal(res.body.data.businessId, bizA.id);
  assert.equal(res.body.data.shopId, shopA.id);

  const got = await get(
    ownerA.accessToken,
    `/api/v1/expenses/${res.body.data.id}?businessId=${bizA.id}&shopId=${shopA.id}`
  );
  assert.equal(got.status, 200);
  assert.equal(got.body.data.id, res.body.data.id);
  assert.equal(got.body.data.note, "August rent");
  assert.equal(got.body.data.receiptUrl, "https://example.com/receipt.png");
});

test("expense: amount is persisted as integer paisa", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 90000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount: 7777, paymentAccountId, category: "PACKAGING" })
  );
  assert.equal(res.status, 201);

  const doc = await Expense.findById(res.body.data.id);
  assert.ok(doc);
  assert.equal(doc!.amount, 7777);
  assert.ok(Number.isInteger(doc!.amount));
  assert.ok(Number.isSafeInteger(doc!.amount));
});

test("expense: payment account balance decreases by exactly the amount", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 40000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount: 15000, paymentAccountId, category: "ELECTRICITY" })
  );
  assert.equal(res.status, 201);

  const acct = await Account.findById(paymentAccountId);
  assert.equal(acct!.currentBalance, 25000);
});

test("expense: journal is balanced — DEBIT Expense:<category> / CREDIT Cash", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 30000, "CASH");
  const amount = 9000;
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount, paymentAccountId, category: "TRANSPORT" })
  );
  assert.equal(res.status, 201);

  const entry = await JournalEntry.findOne({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    referenceType: "EXPENSE",
    referenceId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  assert.ok(entry);
  assert.equal(String(entry!.shopId), shopA.id);

  const lines = await JournalLine.find({ entryId: entry!._id });
  assert.equal(lines.length, 2);
  const expenseLine = lines.find((l) => l.accountName === expenseAccountName("TRANSPORT"));
  const cashLine = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.CASH);
  assert.ok(expenseLine);
  assert.ok(cashLine);
  assert.equal(expenseLine!.accountType, "EXPENSE");
  assert.equal(expenseLine!.debit, amount);
  assert.equal(expenseLine!.credit, 0);
  assert.equal(cashLine!.accountType, "ASSET");
  assert.equal(cashLine!.credit, amount);
  assert.equal(cashLine!.debit, 0);

  // Journal invariant: total debit === total credit
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, totalCredit);
  assert.equal(totalDebit, amount);
});

test("expense: BANK payment account credits the canonical Bank journal account", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 20000, "BANK");
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount: 6000, paymentAccountId, category: "INTERNET" })
  );
  assert.equal(res.status, 201);

  const entry = await JournalEntry.findOne({
    referenceType: "EXPENSE",
    referenceId: new mongoose.Types.ObjectId(res.body.data.id),
  });
  assert.ok(entry);
  const lines = await JournalLine.find({ entryId: entry!._id });
  const bankLine = lines.find((l) => l.accountName === JOURNAL_ACCOUNTS.BANK);
  assert.ok(bankLine);
  assert.equal(bankLine!.credit, 6000);
  assert.equal(bankLine!.debit, 0);
  assert.equal(
    lines.reduce((s, l) => s + l.debit, 0),
    lines.reduce((s, l) => s + l.credit, 0)
  );
});

test("expense: AuditLog EXPENSE_CREATED is written", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 10000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount: 2500, paymentAccountId, category: "OFFICE" })
  );
  assert.equal(res.status, 201);

  const log = await AuditLog.findOne({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    action: "EXPENSE_CREATED",
    details: { $regex: res.body.data.id },
  });
  assert.ok(log);
  assert.equal(String(log!.userId), ownerA.user.id);
  const details = JSON.parse(log!.details as string);
  assert.equal(details.expenseId, res.body.data.id);
  assert.equal(details.shopId, shopA.id);
  assert.equal(details.category, "OFFICE");
  assert.equal(details.amount, 2500);
});

test("expense: invalid category rejected (400)", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { category: "BRIBES", paymentAccountId })
  );
  assert.equal(res.status, 400);
});

test("expense: zero amount rejected (400)", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount: 0, paymentAccountId })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /amount must be > 0/i);
});

test("expense: negative amount rejected (400)", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount: -5000, paymentAccountId })
  );
  assert.equal(res.status, 400);
});

test("expense: non-integer (floating point) amount rejected (400)", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount: 1500.75, paymentAccountId })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /integer paisa/i);
});

test("expense: unsafe integer amount rejected (400)", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount: 10000000000000000, paymentAccountId })
  );
  assert.equal(res.status, 400);
});

test("expense: malformed expenseDate rejected (400)", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { paymentAccountId, expenseDate: "not-a-date" })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /ISO 8601/i);
});

test("expense: malformed receiptUrl rejected (400)", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { paymentAccountId, receiptUrl: "not-a-url" })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /valid URL/i);
});

test("expense: unknown field rejected (400) — client cannot smuggle createdBy", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, {
      paymentAccountId,
      createdBy: new mongoose.Types.ObjectId().toString(),
    })
  );
  assert.equal(res.status, 400);
});

test("expense: malformed paymentAccountId rejected (400)", async () => {
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { paymentAccountId: "not-an-object-id" })
  );
  assert.equal(res.status, 400);
});

test("expense: non-existent payment account rejected (404)", async () => {
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, {
      paymentAccountId: new mongoose.Types.ObjectId().toString(),
    })
  );
  assert.equal(res.status, 404);
  assert.match(res.body.error.message, /account not found/i);
});

test("expense: foreign-business payment account rejected (404)", async () => {
  const foreignAccountId = await makeAccount(bizB.id, shopB.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { paymentAccountId: foreignAccountId })
  );
  assert.equal(res.status, 404);

  const acct = await Account.findById(foreignAccountId);
  assert.equal(acct!.currentBalance, 50000); // untouched
});

test("expense: foreign-shop payment account rejected (404)", async () => {
  const otherShopAccountId = await makeAccount(bizA.id, shopA2.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { paymentAccountId: otherShopAccountId })
  );
  assert.equal(res.status, 404);

  const acct = await Account.findById(otherShopAccountId);
  assert.equal(acct!.currentBalance, 50000); // untouched
});

test("expense: cross-tenant request denied (404) — B cannot spend in A's shop", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    userB.accessToken,
    expenseBody(bizA.id, shopA.id, { paymentAccountId })
  );
  assert.equal(res.status, 404);

  const acct = await Account.findById(paymentAccountId);
  assert.equal(acct!.currentBalance, 50000);
});

test("expense: cross-shop request denied (404) — businessId=A + shopId=B's shop", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopB.id, { paymentAccountId })
  );
  assert.equal(res.status, 404);
});

test("expense: Salesperson denied (403)", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  await setRole(roleUser.user.id, bizA.id, "Salesperson");
  const res = await post(
    roleUser.accessToken,
    expenseBody(bizA.id, shopA.id, { paymentAccountId })
  );
  assert.equal(res.status, 403);

  const acct = await Account.findById(paymentAccountId);
  assert.equal(acct!.currentBalance, 50000);
});

test("expense: Viewer denied (403)", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  await setRole(roleUser.user.id, bizA.id, "Viewer");
  const res = await post(
    roleUser.accessToken,
    expenseBody(bizA.id, shopA.id, { paymentAccountId })
  );
  assert.equal(res.status, 403);
});

test("expense: Owner/Admin/Manager/Accountant allowed (201)", async () => {
  for (const role of ["Owner", "Admin", "Manager", "Accountant"]) {
    await setRole(roleUser.user.id, bizA.id, role);
    const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
    const res = await post(
      roleUser.accessToken,
      expenseBody(bizA.id, shopA.id, { amount: 1000, paymentAccountId })
    );
    assert.equal(res.status, 201, `role ${role} should be allowed (got ${res.status})`);
  }
});

test("expense: RBAC is enforced at the service level, not just the route", async () => {
  await setRole(roleUser.user.id, bizA.id, "Viewer");
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  await assert.rejects(
    () =>
      createExpense(roleUser.user.id, {
        businessId: bizA.id,
        shopId: shopA.id,
        category: "RENT",
        amount: 1000,
        paymentAccountId,
      }),
    /insufficient role/i
  );
  const acct = await Account.findById(paymentAccountId);
  assert.equal(acct!.currentBalance, 50000);
});

test("expense: insufficient account balance rejected (400) with no side effects", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 1000);
  const res = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount: 5000, paymentAccountId })
  );
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /insufficient account balance/i);

  const acct = await Account.findById(paymentAccountId);
  assert.equal(acct!.currentBalance, 1000);
  assert.equal(
    await Expense.countDocuments({ paymentAccountId: new mongoose.Types.ObjectId(paymentAccountId) }),
    0
  );
});

test("expense: transaction rollback — a mid-transaction failure leaves no partial records", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 50000);
  const entriesBefore = await JournalEntry.countDocuments({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    referenceType: "EXPENSE",
  });
  const auditBefore = await AuditLog.countDocuments({
    businessId: new mongoose.Types.ObjectId(bizA.id),
    action: "EXPENSE_CREATED",
  });

  // Fault injection: `note` exceeds the model's 500-char limit, so Expense.create
  // fails AFTER the account balance has already been decremented inside the same
  // transaction. A real MongoDB transaction must undo that balance change —
  // no compensating write is involved.
  await assert.rejects(() =>
    createExpense(ownerA.user.id, {
      businessId: bizA.id,
      shopId: shopA.id,
      category: "RENT",
      amount: 5000,
      paymentAccountId,
      note: "x".repeat(600),
    })
  );

  const acct = await Account.findById(paymentAccountId);
  assert.equal(acct!.currentBalance, 50000); // balance restored
  assert.equal(
    await Expense.countDocuments({ paymentAccountId: new mongoose.Types.ObjectId(paymentAccountId) }),
    0
  );
  assert.equal(
    await JournalEntry.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      referenceType: "EXPENSE",
    }),
    entriesBefore
  );
  assert.equal(
    await AuditLog.countDocuments({
      businessId: new mongoose.Types.ObjectId(bizA.id),
      action: "EXPENSE_CREATED",
    }),
    auditBefore
  );
});

test("expense: listing is business + shop scoped and paginated", async () => {
  const listShop = await createShop(ownerA.accessToken, bizA.id, { name: "List Branch" });
  const paymentAccountId = await makeAccount(bizA.id, listShop.id, 100000);
  for (const amount of [1000, 2000, 3000]) {
    const created = await post(
      ownerA.accessToken,
      expenseBody(bizA.id, listShop.id, { amount, paymentAccountId })
    );
    assert.equal(created.status, 201);
  }

  const page1 = await get(
    ownerA.accessToken,
    `/api/v1/expenses?businessId=${bizA.id}&shopId=${listShop.id}&page=1&limit=2`
  );
  assert.equal(page1.status, 200);
  assert.equal(page1.body.data.length, 2);
  assert.equal(page1.body.pagination.total, 3);
  assert.equal(page1.body.pagination.totalPages, 2);
  assert.ok(page1.body.data.every((e: { shopId: string }) => e.shopId === listShop.id));
  assert.ok(page1.body.data.every((e: { businessId: string }) => e.businessId === bizA.id));

  const page2 = await get(
    ownerA.accessToken,
    `/api/v1/expenses?businessId=${bizA.id}&shopId=${listShop.id}&page=2&limit=2`
  );
  assert.equal(page2.status, 200);
  assert.equal(page2.body.data.length, 1);

  // Another tenant cannot list business A's expenses.
  const foreign = await get(
    userB.accessToken,
    `/api/v1/expenses?businessId=${bizA.id}&shopId=${listShop.id}`
  );
  assert.equal(foreign.status, 404);
});

test("expense: get is shop-scoped (404 from another shop's scope)", async () => {
  const paymentAccountId = await makeAccount(bizA.id, shopA.id, 20000);
  const created = await post(
    ownerA.accessToken,
    expenseBody(bizA.id, shopA.id, { amount: 1000, paymentAccountId })
  );
  assert.equal(created.status, 201);

  const wrongShop = await get(
    ownerA.accessToken,
    `/api/v1/expenses/${created.body.data.id}?businessId=${bizA.id}&shopId=${shopA2.id}`
  );
  assert.equal(wrongShop.status, 404);
});

test("expense: unauthenticated denied (401)", async () => {
  const res = await request(app).get(`/api/v1/expenses?businessId=${bizA.id}&shopId=${shopA.id}`);
  assert.equal(res.status, 401);
});

