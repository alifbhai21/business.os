import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose, { ClientSession } from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { JournalEntry } from "../src/models/JournalEntry";
import { JournalLine } from "../src/models/JournalLine";
import { JOURNAL_ACCOUNTS, JOURNAL_ACCOUNT_TYPES } from "../src/config/accounts";
import {
  writeJournal,
  writeJournalAtomic,
  reverseJournalAtomic,
  validateJournalLines,
  JournalInput,
} from "../src/services/journal.service";
import { withTransaction } from "../src/db/transactions";

const DEV = { deviceId: "journal-test-dev", deviceName: "JournalTest", platform: "android", appVersion: "1.0.0" };

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Journal User",
    email: `jrn${Math.random().toString(36).slice(2)}@example.com`,
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
    .send({ name: "Journal Business", type: "retail", ...over });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({ businessId, name: "Main", branchCode: `JRN-${Math.random().toString(36).slice(2)}` });
  assert.equal(res.status, 201);
  return res.body.data;
}

/** Balanced two-line journal: debit Cash 5000, credit Sales Revenue 5000. */
function balancedSaleJournal(businessId: string, shopId: string): JournalInput {
  return {
    businessId,
    shopId,
    description: "Cash sale",
    referenceType: "SALE",
    lines: [
      {
        accountName: JOURNAL_ACCOUNTS.CASH,
        accountType: JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.CASH],
        debit: 5000,
        credit: 0,
      },
      {
        accountName: JOURNAL_ACCOUNTS.SALES_REVENUE,
        accountType: JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.SALES_REVENUE],
        debit: 0,
        credit: 5000,
      },
    ],
  };
}

before(async () => {
  await connectTestDb("business-os-test-journal");
});

after(async () => {
  await disconnectTestDb();
});

// Validation
test("journal: unbalanced journal rejected (debit !== credit)", () => {
  assert.throws(
    () =>
      validateJournalLines([
        { accountName: "Cash", accountType: "ASSET", debit: 5000, credit: 0 },
        { accountName: "Sales Revenue", accountType: "REVENUE", debit: 0, credit: 4000 },
      ]),
    /Unbalanced journal/i
  );
});

test("journal: zero-amount line rejected", () => {
  assert.throws(
    () =>
      validateJournalLines([
        { accountName: "Cash", accountType: "ASSET", debit: 0, credit: 0 },
      ]),
    /non-zero debit or credit/i
  );
});

test("journal: negative amounts rejected", () => {
  assert.throws(
    () =>
      validateJournalLines([
        { accountName: "Cash", accountType: "ASSET", debit: -5, credit: 0 },
      ]),
    /non-negative/i
  );
  assert.throws(
    () =>
      validateJournalLines([
        { accountName: "Cash", accountType: "ASSET", debit: 0, credit: -5 },
      ]),
    /non-negative/i
  );
});

test("journal: line with both debit and credit rejected", () => {
  assert.throws(
    () =>
      validateJournalLines([
        { accountName: "Cash", accountType: "ASSET", debit: 100, credit: 100 },
      ]),
    /cannot have both debit and credit/i
  );
});

test("journal: non-integer paisa rejected", () => {
  assert.throws(
    () =>
      validateJournalLines([
        { accountName: "Cash", accountType: "ASSET", debit: 1.5, credit: 0 },
      ]),
    /safe integer amount in paisa/i
  );
});

test("journal: empty lines rejected", () => {
  assert.throws(() => validateJournalLines([]), /at least one line/i);
});

test("journal: missing accountName rejected", () => {
  assert.throws(
    () =>
      validateJournalLines([
        { accountName: "  ", accountType: "ASSET", debit: 100, credit: 0 },
      ]),
    /accountName is required/i
  );
});

test("journal: balanced two-line journal accepted", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const result = await writeJournalAtomic(balancedSaleJournal(biz.id, shop.id));

  assert.ok(result.entry._id);
  assert.equal(result.entry.businessId.toString(), biz.id);
  assert.equal(result.entry.shopId.toString(), shop.id);
  assert.equal(result.entry.referenceType, "SALE");
  assert.equal(result.entry.isReversal, false);
  assert.equal(result.lines.length, 2);

  const persisted = await JournalLine.find({ entryId: result.entry._id });
  const totalDebit = persisted.reduce((s, l) => s + l.debit, 0);
  const totalCredit = persisted.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, 5000);
  assert.equal(totalCredit, 5000);
  assert.equal(totalDebit, totalCredit);
});

test("journal: multi-line journal accepted (debit total equals credit total)", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const result = await writeJournalAtomic({
    businessId: biz.id,
    shopId: shop.id,
    description: "Credit sale with inventory COGS",
    referenceType: "SALE",
    lines: [
      { accountName: JOURNAL_ACCOUNTS.CUSTOMER_RECEIVABLE, accountType: "ASSET", debit: 12000, credit: 0 },
      { accountName: JOURNAL_ACCOUNTS.SALES_REVENUE, accountType: "REVENUE", debit: 0, credit: 12000 },
      { accountName: JOURNAL_ACCOUNTS.INVENTORY, accountType: "ASSET", debit: 0, credit: 7000 },
      { accountName: "Cost of Goods Sold", accountType: "EXPENSE", debit: 7000, credit: 0 },
    ],
  });

  assert.equal(result.lines.length, 4);
  const lines = await JournalLine.find({ entryId: result.entry._id });
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, 19000);
  assert.equal(totalCredit, 19000);
});

test("journal: canonical account names come from config (no scattered strings)", async () => {
  assert.equal(JOURNAL_ACCOUNTS.CASH, "Cash");
  assert.equal(JOURNAL_ACCOUNTS.SALES_REVENUE, "Sales Revenue");
  assert.equal(JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.CASH], "ASSET");
  assert.equal(JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.SALES_REVENUE], "REVENUE");
});

test("journal: transaction rollback — no partial journal persisted", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);
  assert.ok(withTransaction);

  await assert.rejects(
    () =>
      withTransaction(async (s) => {
        await writeJournal(balancedSaleJournal(biz.id, shop.id), s);
        // Force a failure AFTER the journal write — the whole transaction must roll back.
        throw new Error("simulated downstream failure");
      }),
    /simulated downstream failure/
  );

  // No JournalEntry persisted for the aborted transaction
  const entries = await JournalEntry.find({
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: new mongoose.Types.ObjectId(shop.id),
    description: "Cash sale",
  });
  assert.equal(entries.length, 0);

  // No JournalLine persisted for those (non-existent) entries — fully rolled back
  const entryIds = entries.map((e) => e._id);
  const lineCount = await JournalLine.countDocuments({ entryId: { $in: entryIds } });
  assert.equal(lineCount, 0);
});

test("journal: reversal creates a symmetric new entry; original unchanged", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const original = await writeJournalAtomic(balancedSaleJournal(biz.id, shop.id));
  const originalId = String(original.entry._id);

  const reversal = await reverseJournalAtomic(biz.id, shop.id, originalId, "Void sale");

  assert.notEqual(String(reversal.entry._id), originalId);
  assert.equal(reversal.entry.isReversal, true);
  assert.equal(reversal.entry.referenceType, "REVERSAL");
  assert.equal(String(reversal.entry.reversesEntryId!), originalId);

  const originalLines = await JournalLine.find({ entryId: original.entry._id }).sort({ _id: 1 });
  const reversalLines = await JournalLine.find({ entryId: reversal.entry._id }).sort({ _id: 1 });
  assert.equal(originalLines.length, 2);
  assert.equal(reversalLines.length, 2);
  for (let i = 0; i < originalLines.length; i++) {
    assert.equal(reversalLines[i].accountName, originalLines[i].accountName);
    assert.equal(reversalLines[i].accountType, originalLines[i].accountType);
    assert.equal(reversalLines[i].debit, originalLines[i].credit);
    assert.equal(reversalLines[i].credit, originalLines[i].debit);
  }

  const revDebit = reversalLines.reduce((s, l) => s + l.debit, 0);
  const revCredit = reversalLines.reduce((s, l) => s + l.credit, 0);
  assert.equal(revDebit, revCredit);

  const persistedOriginal = await JournalEntry.findById(originalId);
  assert.equal(persistedOriginal!.isReversal, false);
  assert.equal(String(persistedOriginal!.reversesEntryId), "null");
});

test("journal: cannot reverse a reversal", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  const original = await writeJournalAtomic(balancedSaleJournal(biz.id, shop.id));
  const reversal = await reverseJournalAtomic(biz.id, shop.id, String(original.entry._id), "Void");

  await assert.rejects(
    () => reverseJournalAtomic(biz.id, shop.id, String(reversal.entry._id), "Double void"),
    /Cannot reverse a reversing entry/i
  );
});

test("journal: reversing a nonexistent entry rejected", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop = await createShop(user.accessToken, biz.id);

  await assert.rejects(
    () =>
      reverseJournalAtomic(
        biz.id,
        shop.id,
        new mongoose.Types.ObjectId().toString(),
        "Void ghost"
      ),
    /Journal entry not found/i
  );
});

test("journal: cross-tenant isolation — cannot reverse another business's entry", async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const bizA = await createBusiness(userA.accessToken);
  const shopA = await createShop(userA.accessToken, bizA.id);
  const bizB = await createBusiness(userB.accessToken);
  const shopB = await createShop(userB.accessToken, bizB.id);

  const original = await writeJournalAtomic(balancedSaleJournal(bizA.id, shopA.id));

  await assert.rejects(
    () => reverseJournalAtomic(bizB.id, shopB.id, String(original.entry._id), "Void"),
    /Journal entry not found/i
  );

  const count = await JournalEntry.countDocuments({
    _id: original.entry._id,
    businessId: new mongoose.Types.ObjectId(bizA.id),
  });
  assert.equal(count, 1);
});

test("journal: cross-shop isolation — cannot reverse entry with wrong shopId", async () => {
  const user = await registerUser();
  const biz = await createBusiness(user.accessToken);
  const shop1 = await createShop(user.accessToken, biz.id);
  const shop2 = await createShop(user.accessToken, biz.id);

  const original = await writeJournalAtomic(balancedSaleJournal(biz.id, shop1.id));

  await assert.rejects(
    () => reverseJournalAtomic(biz.id, shop2.id, String(original.entry._id), "Void"),
    /Journal entry not found/i
  );

  const count = await JournalEntry.countDocuments({ _id: original.entry._id });
  assert.equal(count, 1);
});