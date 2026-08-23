/**
 * Phase 08 — report endpoint tests.
 *
 * Sales/purchases/inventory/receivables/payables/expenses reports plus the
 * profit-loss alias over the verified Phase 07 engine. All expected figures
 * are hand-computed from the seeded scenario; bucket keys are derived from
 * the same UTC instant the documents were created at, so they are
 * deterministic regardless of the machine timezone.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/db";
import { app } from "../src/app";
import { Product } from "../src/models/Product";
import { Customer } from "../src/models/Customer";
import { Supplier } from "../src/models/Supplier";
import { Account } from "../src/models/Account";
import { BusinessMembership } from "../src/models/BusinessMembership";

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Report User",
    email: `rep${Math.random().toString(36).slice(2)}@example.com`,
    phone: "018" + Math.floor(10000000 + Math.random() * 89999999),
    password: "password123",
    deviceId: "report-dev-1",
    deviceName: "ReportTest",
    platform: "android",
    appVersion: "1.0.0",
    ...over,
  };
}

async function registerUser() {
  const res = await request(app).post("/api/v1/auth/register").send(regBody());
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createBusiness(token: string) {
  const res = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Report Business", type: "retail" });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function createShop(token: string, businessId: string) {
  const res = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessId,
      name: "Main",
      branchCode: `REP-${Math.random().toString(36).slice(2)}`,
      openingCash: 100000,
    });
  assert.equal(res.status, 201);
  return res.body.data;
}

async function setRole(userId: string, businessId: string, role: string) {
  await BusinessMembership.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId), businessId: new mongoose.Types.ObjectId(businessId) },
    { role }
  );
}

let owner: any;
let biz: any;
let shop: any;
let cashAccountId: string;
let other: any;
let otherBiz: any;
let otherShop: any;
let roleUser: any;

before(async () => {
  await connectTestDb("business-os-test-report");

  owner = await registerUser();
  biz = await createBusiness(owner.accessToken);
  shop = await createShop(owner.accessToken, biz.id);
  const cash = await Account.findOne({
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: new mongoose.Types.ObjectId(shop.id),
  });
  cashAccountId = String(cash!._id);

  other = await registerUser();
  otherBiz = await createBusiness(other.accessToken);
  otherShop = await createShop(other.accessToken, otherBiz.id);

  roleUser = await registerUser();
  await BusinessMembership.create({
    userId: new mongoose.Types.ObjectId(roleUser.user.id),
    businessId: new mongoose.Types.ObjectId(biz.id),
    shopId: null,
    role: "Manager",
    status: "ACTIVE",
    permissions: [],
  });

  // ── Seed a deterministic transaction history ──────────────────────────────
  const p1 = await Product.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    name: "Rep Product One",
    purchasePrice: 6000,
    sellingPrice: 10000,
    taxRate: 10,
    currentStock: 10,
    avgCost: 6000,
    status: "ACTIVE",
  });
  const p2 = await Product.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    name: "Rep Product Two",
    purchasePrice: 3000,
    sellingPrice: 5000,
    taxRate: 0,
    currentStock: 4,
    minStock: 5, // low stock from the start
    avgCost: 3000,
    status: "ACTIVE",
  });
  const c1 = await Customer.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    name: "Rep Customer",
    currentDue: 0,
  });
  await Customer.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    name: "Rep Settled Customer",
    currentDue: 0, // must never appear in receivables
  });
  await Supplier.create({
    businessId: new mongoose.Types.ObjectId(biz.id),
    name: "Rep Supplier",
    openingBalance: 30000,
    currentPayable: 30000,
  });

  const post = (path: string, body: Record<string, unknown>) =>
    request(app).post(path).set("Authorization", `Bearer ${owner.accessToken}`).send(body);

  // S1: P1 x2 PAID -> subtotal 20000 tax 2000 total 22000. Stock P1: 10->8.
  assert.equal(
    (
      await post("/api/v1/sales", {
        businessId: biz.id,
        shopId: shop.id,
        items: [{ productId: String(p1._id), qty: 2 }],
        paidAmount: 22000,
        accountId: cashAccountId,
      })
    ).status,
    201
  );
  // S2 walk-in: P1 x1 PAID -> total 11000. Stock P1: 8->7.
  assert.equal(
    (
      await post("/api/v1/sales", {
        businessId: biz.id,
        shopId: shop.id,
        items: [{ productId: String(p1._id), qty: 1 }],
        paidAmount: 11000,
        accountId: cashAccountId,
      })
    ).status,
    201
  );
  // S3 credit to C1: P2 x2 UNPAID -> total 10000 due 10000. Stock P2: 4->2.
  assert.equal(
    (
      await post("/api/v1/sales", {
        businessId: biz.id,
        shopId: shop.id,
        customerId: String(c1._id),
        items: [{ productId: String(p2._id), qty: 2 }],
      })
    ).status,
    201
  );

  // PUR1 inline COMPLETED: P1 x5 @6000 @10% -> total 33000 PAID.
  // avgCost stays 6000 ((42000 + 30000) / 12). Stock P1: 7->12. Cash: -33000.
  assert.equal(
    (
      await post("/api/v1/purchases", {
        businessId: biz.id,
        shopId: shop.id,
        supplierName: undefined,
        supplierId: (
          await Supplier.findOne({ businessId: new mongoose.Types.ObjectId(biz.id) })
        )!._id.toString(),
        items: [{ productId: String(p1._id), qty: 5, unitPrice: 6000 }],
        paidAmount: 33000,
        accountId: cashAccountId,
      })
    ).status,
    201
  );

  // E1 today; E2 ten days ago (for range filtering).
  assert.equal(
    (
      await post("/api/v1/expenses", {
        businessId: biz.id,
        shopId: shop.id,
        category: "RENT",
        amount: 5000,
        paymentAccountId: cashAccountId,
      })
    ).status,
    201
  );
  assert.equal(
    (
      await post("/api/v1/expenses", {
        businessId: biz.id,
        shopId: shop.id,
        category: "ELECTRICITY",
        amount: 2500,
        paymentAccountId: cashAccountId,
        expenseDate: new Date(Date.now() - 10 * 86400000).toISOString(),
      })
    ).status,
    201
  );
});

after(async () => {
  await disconnectTestDb();
});

const GET = (path: string, token?: string) =>
  request(app).get(path).set("Authorization", token ? `Bearer ${token}` : "");

// ── Validation / auth surface ───────────────────────────────────────────────

test("reports: unauthenticated requests are 401", async () => {
  for (const p of [
    `/api/v1/reports/sales?businessId=${biz.id}&groupBy=daily`,
    `/api/v1/reports/inventory?businessId=${biz.id}`,
    `/api/v1/reports/receivables?businessId=${biz.id}`,
    `/api/v1/dashboard?businessId=${biz.id}`,
    `/api/v1/search?businessId=${biz.id}&q=x`,
  ]) {
    assert.equal((await request(app).get(p)).status, 401);
  }
});

test("reports: missing businessId is 400", async () => {
  const res = await GET(`/api/v1/reports/inventory`, owner.accessToken);
  assert.equal(res.status, 400);
});

test("reports: cross-tenant requests are 404 on every report route", async () => {
  for (const p of [
    `/api/v1/reports/sales?businessId=${biz.id}&groupBy=daily`,
    `/api/v1/reports/purchases?businessId=${biz.id}&groupBy=daily`,
    `/api/v1/reports/inventory?businessId=${biz.id}`,
    `/api/v1/reports/profit-loss?businessId=${biz.id}`,
    `/api/v1/reports/receivables?businessId=${biz.id}`,
    `/api/v1/reports/payables?businessId=${biz.id}`,
    `/api/v1/reports/expenses?businessId=${biz.id}`,
    `/api/v1/search?businessId=${biz.id}&q=Rep`,
  ]) {
    const res = await GET(p, other.accessToken);
    assert.equal(res.status, 404, `${p} should be tenant-isolated`);
  }
});

test("reports: a foreign shop paired with our business is 404", async () => {
  const res = await GET(
    `/api/v1/reports/inventory?businessId=${biz.id}&shopId=${otherShop.id}`,
    owner.accessToken
  );
  assert.equal(res.status, 404);
});

test("reports: RBAC — Salesperson/Inventory Manager/Viewer refused, Manager/Accountant allowed", async () => {
  const invPath = `/api/v1/reports/inventory?businessId=${biz.id}`;
  for (const role of ["Salesperson", "Inventory Manager", "Viewer"]) {
    await setRole(roleUser.user.id, biz.id, role);
    const res = await GET(invPath, roleUser.accessToken);
    assert.equal(res.status, 403, `${role} should be refused`);
  }
  for (const role of ["Manager", "Accountant"]) {
    await setRole(roleUser.user.id, biz.id, role);
    const res = await GET(invPath, roleUser.accessToken);
    assert.equal(res.status, 200, `${role} should be allowed`);
  }
});

test("sales report: groupBy is required and validated", async () => {
  const missing = await GET(`/api/v1/reports/sales?businessId=${biz.id}`, owner.accessToken);
  assert.equal(missing.status, 400);

  const bogus = await GET(
    `/api/v1/reports/sales?businessId=${biz.id}&groupBy=weekly`,
    owner.accessToken
  );
  assert.equal(bogus.status, 400);
});

test("sales report: invalid or inverted date ranges are rejected", async () => {
  const badDate = await GET(
    `/api/v1/reports/sales?businessId=${biz.id}&groupBy=daily&from=not-a-date`,
    owner.accessToken
  );
  assert.equal(badDate.status, 400);

  const inverted = await GET(
    `/api/v1/reports/sales?businessId=${biz.id}&groupBy=daily&from=2030-01-01&to=2020-01-01`,
    owner.accessToken
  );
  assert.equal(inverted.status, 400);

  const badExpenseRange = await GET(
    `/api/v1/reports/expenses?businessId=${biz.id}&from=garbage`,
    owner.accessToken
  );
  assert.equal(badExpenseRange.status, 400);
});

// ── Sales report content ────────────────────────────────────────────────────

test("sales report: daily buckets carry hand-computed totals", async () => {
  const res = await GET(
    `/api/v1/reports/sales?businessId=${biz.id}&groupBy=daily`,
    owner.accessToken
  );
  assert.equal(res.status, 200);
  const key = new Date().toISOString().slice(0, 10);
  const row = res.body.data.items.find((r: any) => r.key === key);
  assert.ok(row, `expected a bucket for ${key}`);
  assert.equal(row.count, 3);
  assert.equal(row.total, 43000); // 22000 + 11000 + 10000
  assert.equal(row.paid, 33000);
  assert.equal(row.due, 10000);
});

test("sales report: monthly buckets use YYYY-MM keys", async () => {
  const res = await GET(
    `/api/v1/reports/sales?businessId=${biz.id}&groupBy=monthly`,
    owner.accessToken
  );
  assert.equal(res.status, 200);
  const key = new Date().toISOString().slice(0, 7);
  const row = res.body.data.items.find((r: any) => r.key === key);
  assert.ok(row);
  assert.equal(row.count, 3);
  assert.equal(row.total, 43000);
});

test("sales report: product breakdown matches line-level hand computation and paginates", async () => {
  const res = await GET(
    `/api/v1/reports/sales?businessId=${biz.id}&groupBy=product`,
    owner.accessToken
  );
  assert.equal(res.status, 200);
  const rows = res.body.data.items as any[];
  assert.equal(rows.length, 2);

  const p1 = rows.find((r) => r.productName === "Rep Product One");
  assert.equal(p1.qtySold, 3);
  assert.equal(p1.salesTotal, 33000);
  assert.equal(p1.netRevenue, 30000);
  assert.equal(p1.costTotal, 18000); // 3 x 6000
  assert.equal(p1.grossProfit, 12000);
  assert.equal(p1.returnedQty, 0);

  const p2 = rows.find((r) => r.productName === "Rep Product Two");
  assert.equal(p2.qtySold, 2);
  assert.equal(p2.salesTotal, 10000);
  assert.equal(p2.grossProfit, 4000); // 10000 - 2x3000

  // Pagination over the same aggregation.
  const page = await GET(
    `/api/v1/reports/sales?businessId=${biz.id}&groupBy=product&page=2&limit=1`,
    owner.accessToken
  );
  assert.equal(page.status, 200);
  assert.equal(page.body.data.items.length, 1);
  assert.equal(page.body.data.pagination.total, 2);
  assert.equal(page.body.data.pagination.page, 2);
});

test("sales report: customer breakdown separates walk-in from named customers", async () => {
  const res = await GET(
    `/api/v1/reports/sales?businessId=${biz.id}&groupBy=customer`,
    owner.accessToken
  );
  assert.equal(res.status, 200);
  const rows = res.body.data.items as any[];
  assert.equal(rows.length, 2);

  const named = rows.find((r) => r.customerName === "Rep Customer");
  assert.ok(named);
  assert.equal(named.count, 1);
  assert.equal(named.total, 10000);
  assert.equal(named.due, 10000);

  const walkin = rows.find((r) => r.customerId === null);
  assert.ok(walkin, "walk-ins share one null-id bucket");
  assert.equal(walkin.count, 2);
  assert.equal(walkin.total, 33000);
});

test("purchases report: daily + supplier + product dimensions are correct", async () => {
  const daily = await GET(
    `/api/v1/reports/purchases?businessId=${biz.id}&groupBy=daily`,
    owner.accessToken
  );
  assert.equal(daily.status, 200);
  const key = new Date().toISOString().slice(0, 10);
  const dayRow = daily.body.data.items.find((r: any) => r.key === key);
  assert.ok(dayRow);
  assert.equal(dayRow.count, 1);
  assert.equal(dayRow.total, 33000);

  const sup = await GET(
    `/api/v1/reports/purchases?businessId=${biz.id}&groupBy=supplier`,
    owner.accessToken
  );
  assert.equal(sup.status, 200);
  const supRow = sup.body.data.items[0];
  assert.equal(supRow.supplierName, "Rep Supplier");
  assert.equal(supRow.count, 1);
  assert.equal(supRow.total, 33000);
  assert.equal(supRow.paid, 33000);
  assert.equal(supRow.due, 0);

  const prod = await GET(
    `/api/v1/reports/purchases?businessId=${biz.id}&groupBy=product`,
    owner.accessToken
  );
  assert.equal(prod.status, 200);
  const prodRow = prod.body.data.items[0];
  assert.equal(prodRow.productName, "Rep Product One");
  assert.equal(prodRow.qtyPurchased, 5);
  assert.equal(prodRow.purchasesTotal, 33000); // incl tax
  assert.equal(prodRow.costTotal, 30000); // capitalised cost excludes tax
});

test("inventory report: valuation summary and per-row stock value are exact", async () => {
  const res = await GET(`/api/v1/reports/inventory?businessId=${biz.id}`, owner.accessToken);
  assert.equal(res.status, 200);
  const s = res.body.data.summary;
  assert.equal(s.productCount, 2);
  assert.equal(s.totalUnits, 14); // P1 12 + P2 2
  assert.equal(s.stockValue, 12 * 6000 + 2 * 3000); // 78000
  assert.equal(s.retailValue, 12 * 10000 + 2 * 5000); // 130000
  assert.equal(s.lowStockCount, 1);

  const rows = res.body.data.items as any[];
  const p1 = rows.find((r) => r.name === "Rep Product One");
  const p2 = rows.find((r) => r.name === "Rep Product Two");
  assert.equal(p1.currentStock, 12);
  assert.equal(p1.stockValue, 72000);
  assert.equal(p1.lowStock, false);
  assert.equal(p2.currentStock, 2);
  assert.equal(p2.stockValue, 6000);
  assert.equal(p2.lowStock, true);
});

test("inventory report: pagination works over product pages", async () => {
  const res = await GET(
    `/api/v1/reports/inventory?businessId=${biz.id}&page=2&limit=1`,
    owner.accessToken
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.data.items.length, 1);
  assert.equal(res.body.data.pagination.total, 2);
  assert.equal(res.body.data.pagination.page, 2);
});

test("receivables report: totals match customer dues; zero-due customers excluded", async () => {
  const res = await GET(`/api/v1/reports/receivables?businessId=${biz.id}`, owner.accessToken);
  assert.equal(res.status, 200);
  // Shape: { totals: { total, count }, items, pagination }.
  assert.equal(res.body.data.totals.total, 10000);
  assert.equal(res.body.data.totals.count, 1);
  assert.equal(res.body.data.items.length, 1);
  assert.equal(res.body.data.items[0].name, "Rep Customer");
  assert.equal(res.body.data.items[0].currentDue, 10000);
});

test("payables report: totals match supplier payables", async () => {
  const res = await GET(`/api/v1/reports/payables?businessId=${biz.id}`, owner.accessToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.totals.total, 30000);
  assert.equal(res.body.data.totals.count, 1);
  assert.equal(res.body.data.items[0].name, "Rep Supplier");
});

test("expenses report: categories grouped with sums; date range filters old entries", async () => {
  const all = await GET(`/api/v1/reports/expenses?businessId=${biz.id}`, owner.accessToken);
  assert.equal(all.status, 200);
  assert.equal(all.body.data.totalAmount, 7500);
  assert.equal(all.body.data.totalCount, 2);
  const cats = all.body.data.items as any[];
  assert.deepEqual(cats.map((c) => c.category), ["RENT", "ELECTRICITY"]);
  assert.deepEqual(cats.map((c) => c.total), [5000, 2500]);

  // Window that excludes the 10-day-old electricity bill.
  const recentOnly = await GET(
    `/api/v1/reports/expenses?businessId=${biz.id}&from=${new Date(Date.now() - 5 * 86400000).toISOString()}`,
    owner.accessToken
  );
  assert.equal(recentOnly.status, 200);
  assert.equal(recentOnly.body.data.totalAmount, 5000);
  assert.equal(recentOnly.body.data.totalCount, 1);
  assert.equal(recentOnly.body.data.items[0].category, "RENT");
});

test("profit-loss report: identical to the verified accounting engine on the same window", async () => {
  const qs = `businessId=${biz.id}&shopId=${shop.id}`;
  const viaReports = await GET(`/api/v1/reports/profit-loss?${qs}`, owner.accessToken);
  const viaAccounting = await GET(`/api/v1/accounting/profit-loss?${qs}`, owner.accessToken);
  assert.equal(viaReports.status, 200);
  assert.equal(viaAccounting.status, 200);
  assert.deepEqual(viaReports.body, viaAccounting.body);

  // And the numbers themselves: journal revenue is tax-exclusive.
  // Revenue credit 20000+10000+10000 = 40000; COGS 3x6000 + 2x3000 = 24000.
  assert.equal(viaReports.body.data.revenue.total, 40000);
  assert.equal(viaReports.body.data.cogs.total, 24000);
  assert.equal(viaReports.body.data.grossProfit, 16000);
});
