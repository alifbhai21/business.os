/**
 * Phase 08 - Reports tests (sales / purchases / inventory / receivables /
 * payables / expenses / profit-loss delegation) + global search.
 *
 * Every expected figure is hand-computed from the seeded documents. Sales
 * and purchases go through the REAL HTTP finalization path with explicit
 * ISO dates so grouping keys are deterministic (MongoDB $dateToString is
 * UTC; seeded times are mid-day UTC).
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

const DEV = { deviceId: "rep-dev", deviceName: "RepTest", platform: "android", appVersion: "1.0.0" };
const oid = (s: string) => new mongoose.Types.ObjectId(s);

function regBody(over: Record<string, unknown> = {}) {
  return {
    name: "Rep User",
    email: `rep${Math.random().toString(36).slice(2)}@example.com`,
    phone: "015" + Math.floor(10000000 + Math.random() * 89999999),
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

let owner: any;
let biz: any;
let shop: any;

function get(path: string, token: string) {
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

function report(token: string, endpoint: string, query: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") params.set(k, v);
  }
  if (!params.has("businessId")) params.set("businessId", biz.id);
  return get(`/api/v1/reports/${endpoint}?${params.toString()}`, token);
}

async function makeProduct(over: Record<string, unknown>) {
  return Product.create({
    businessId: oid(biz.id),
    name: `RP-${Math.random().toString(36).slice(2)}`,
    sellingPrice: 5000,
    purchasePrice: 2000,
    taxRate: 0,
    currentStock: 50,
    minStock: 0,
    avgCost: 2000,
    ...over,
  });
}

async function makeAccount(balancePaisa = 1000000) {
  const acct = await Account.create({
    businessId: oid(biz.id),
    shopId: oid(shop.id),
    name: `RA-${Math.random().toString(36).slice(2)}`,
    type: "CASH",
    currentBalance: balancePaisa,
  });
  return String(acct._id);
}

async function saleOn(dateIso: string, items: object[], over: Record<string, unknown> = {}) {
  const accountId = over.accountId !== undefined ? over.accountId : await makeAccount(1000000);
  const res = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, saleDate: dateIso, items, accountId, ...over });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function purchaseOn(dateIso: string, supplierId: string, items: object[], over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/purchases")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, shopId: shop.id, purchaseDate: dateIso, supplierId, items, ...over });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

before(async () => {
  await connectTestDb("business-os-test-reports");
  owner = await registerUser();
  const bizRes = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ name: "Reports Business", type: "retail" });
  biz = bizRes.body.data;
  const shopRes = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ businessId: biz.id, name: "Reports Main", branchCode: `RM-${Math.random().toString(36).slice(2)}` });
  shop = shopRes.body.data;
});

after(async () => {
  await disconnectTestDb();
});

// ── Auth / validation surface ──────────────────────────────────────────────

test("reports: unauthenticated access is 401 on every endpoint", async () => {
  for (const ep of [
    "sales?groupBy=daily",
    "purchases?groupBy=daily",
    "inventory",
    "profit-loss",
    "receivables",
    "payables",
    "expenses",
  ]) {
    const res = await request(app).get(`/api/v1/reports/${ep}`);
    assert.equal(res.status, 401, `/reports/${ep}`);
  }
});

test("reports: missing businessId and invalid inputs are 400", async () => {
  const noBiz = await get("/api/v1/reports/sales?groupBy=daily", owner.accessToken);
  assert.equal(noBiz.status, 400);

  assert.equal((await report(owner.accessToken, "sales")).status, 400, "missing groupBy");
  assert.equal((await report(owner.accessToken, "sales", { groupBy: "bogus" })).status, 400);
  assert.equal((await report(owner.accessToken, "purchases", { groupBy: "week" })).status, 400);
  assert.equal(
    (await report(owner.accessToken, "sales", { groupBy: "daily", from: "not-a-date" })).status,
    400,
    "invalid from"
  );
  assert.equal(
    (await report(owner.accessToken, "sales", { groupBy: "daily", to: "2026-13-99" })).status,
    400,
    "invalid to"
  );
  assert.equal(
    (await report(owner.accessToken, "sales", { groupBy: "daily", from: "2026-05-01", to: "2026-04-01" }))
      .status,
    400,
    "from after to"
  );
});

// ── Sales reports ──────────────────────────────────────────────────────────

test("sales report: daily/monthly/product/customer groupings are hand-verifiable", async () => {
  const pa = await makeProduct({ avgCost: 2000 }); // sells at 5000, cost 2000, no tax
  const pb = await makeProduct({ sellingPrice: 4000, avgCost: 1000 });
  const cx = await Customer.create({ businessId: oid(biz.id), name: `RCX-${Math.random().toString(36).slice(2)}`, currentDue: 0 });

  // S1: 2026-03-10, PA x2 paid -> total 10000.
  await saleOn("2026-03-10T10:00:00Z", [{ productId: String(pa._id), qty: 2 }], { paidAmount: 10000 });
  // S2: 2026-03-10, PA x1 + PB x1 credit to CX -> total 9000.
  await saleOn("2026-03-10T11:00:00Z", [
    { productId: String(pa._id), qty: 1 },
    { productId: String(pb._id), qty: 1 },
  ], { customerId: String(cx._id) });
  // S3: 2026-03-11, walk-in PB x1 paid -> 4000.
  await saleOn("2026-03-11T10:00:00Z", [{ productId: String(pb._id), qty: 1 }], { paidAmount: 4000 });
  // S4: 2026-04-02, walk-in PA x1 paid -> 5000.
  await saleOn("2026-04-02T10:00:00Z", [{ productId: String(pa._id), qty: 1 }], { paidAmount: 5000 });

  // Daily (range covers everything).
  const daily = await report(owner.accessToken, "sales", {
    groupBy: "daily",
    from: "2026-03-01",
    to: "2026-04-30",
  });
  assert.equal(daily.status, 200);
  assert.deepEqual(daily.body.data.items, [
    { key: "2026-03-10", count: 2, total: 19000, paid: 10000, due: 9000 },
    { key: "2026-03-11", count: 1, total: 4000, paid: 4000, due: 0 },
    { key: "2026-04-02", count: 1, total: 5000, paid: 5000, due: 0 },
  ]);

  // Monthly.
  const monthly = await report(owner.accessToken, "sales", {
    groupBy: "monthly",
    from: "2026-03-01",
    to: "2026-04-30",
  });
  assert.deepEqual(monthly.body.data.items, [
    { key: "2026-03", count: 3, total: 23000, paid: 14000, due: 9000 },
    { key: "2026-04", count: 1, total: 5000, paid: 5000, due: 0 },
  ]);

  // Product-wise: PA qty4 salesTotal 20000 cost 8000 grossProfit 12000;
  // PB qty2 salesTotal 8000 cost 2000 grossProfit 6000.
  const product = await report(owner.accessToken, "sales", {
    groupBy: "product",
    from: "2026-03-01",
    to: "2026-04-30",
    limit: "10",
  });
  assert.equal(product.status, 200);
  assert.equal(product.body.data.pagination.total, 2);
  const rows = product.body.data.items as Array<{
    productName: string;
    qtySold: number;
    returnedQty: number;
    salesTotal: number;
    netRevenue: number;
    costTotal: number;
    grossProfit: number;
  }>;
  assert.equal(rows.length, 2);
  const paRow = rows.find((r) => r.productName === pa.name)!;
  const pbRow = rows.find((r) => r.productName === pb.name)!;
  assert.ok(paRow && pbRow);
  assert.equal(paRow.qtySold, 4);
  assert.equal(paRow.returnedQty, 0);
  assert.equal(paRow.salesTotal, 20000);
  assert.equal(paRow.netRevenue, 20000);
  assert.equal(paRow.costTotal, 8000);
  assert.equal(paRow.grossProfit, 12000);
  assert.equal(pbRow.qtySold, 2);
  assert.equal(pbRow.salesTotal, 8000);
  assert.equal(pbRow.grossProfit, 6000);
  // Sorted by salesTotal desc: PA first.
  assert.equal(rows[0].productName, pa.name);

  // Product pagination: page 1 limit 1 -> PA, page 2 -> PB.
  const page1 = await report(owner.accessToken, "sales", { groupBy: "product", limit: "1", page: "1" });
  const page2 = await report(owner.accessToken, "sales", { groupBy: "product", limit: "1", page: "2" });
  assert.equal(page1.body.data.items[0].productId, String(pa._id));
  assert.equal(page2.body.data.items[0].productId, String(pb._id));
  assert.equal(page1.body.data.pagination.totalPages, 2);

  // Customer-wise: CX bucket (credit 9000) vs merged walk-in bucket (13000).
  const customer = await report(owner.accessToken, "sales", {
    groupBy: "customer",
    from: "2026-03-01",
    to: "2026-04-30",
    limit: "10",
  });
  const cRows = customer.body.data.items as Array<{
    customerId: string | null;
    customerName: string | null;
    count: number;
    total: number;
    paid: number;
    due: number;
  }>;
  assert.equal(customer.body.data.pagination.total, 2);
  // Walk-ins first (higher total); S1+S3+S4 share the null-customer bucket.
  assert.equal(cRows[0].customerId, null);
  assert.equal(cRows[0].count, 3);
  assert.equal(cRows[0].total, 19000);
  assert.equal(cRows[0].due, 0);
  assert.equal(cRows[1].customerId, String(cx._id));
  assert.equal(cRows[1].total, 9000);
  assert.equal(cRows[1].paid, 0);
  assert.equal(cRows[1].due, 9000);
});

test("sales report: empty range yields empty items", async () => {
  const res = await report(owner.accessToken, "sales", {
    groupBy: "daily",
    from: "2001-01-01",
    to: "2001-12-31",
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.items, []);
});

// ── Purchase reports ───────────────────────────────────────────────────────

test("purchase report: daily/supplier/product groupings are hand-verifiable", async () => {
  const pa = (await Product.findOne({ businessId: oid(biz.id), avgCost: 2000 }))!;
  const pb = (await Product.findOne({ businessId: oid(biz.id), avgCost: 1000 }))!;
  const sy = await Supplier.create({ businessId: oid(biz.id), name: `RSY-${Math.random().toString(36).slice(2)}`, currentPayable: 0 });

  // U1: 2026-03-05, PA x5 @1000 UNPAID -> total 5000 due 5000.
  await purchaseOn("2026-03-05T09:00:00Z", String(sy._id), [{ productId: String(pa._id), qty: 5, unitPrice: 1000 }]);
  // U2: 2026-03-06, PB x2 @800 PAID -> total 1600.
  const acct = await makeAccount(1000000);
  await purchaseOn("2026-03-06T09:00:00Z", String(sy._id), [{ productId: String(pb._id), qty: 2, unitPrice: 800 }], {
    paidAmount: 1600,
    accountId: acct,
  });

  const daily = await report(owner.accessToken, "purchases", {
    groupBy: "daily",
    from: "2026-03-01",
    to: "2026-03-30",
  });
  assert.equal(daily.status, 200);
  assert.deepEqual(daily.body.data.items, [
    { key: "2026-03-05", count: 1, total: 5000, paid: 0, due: 5000 },
    { key: "2026-03-06", count: 1, total: 1600, paid: 1600, due: 0 },
  ]);

  const supplier = await report(owner.accessToken, "purchases", {
    groupBy: "supplier",
    from: "2026-03-01",
    to: "2026-03-30",
    limit: "10",
  });
  const sRows = supplier.body.data.items;
  assert.equal(supplier.body.data.pagination.total, 1);
  assert.equal(sRows[0].supplierId, String(sy._id));
  assert.equal(sRows[0].count, 2);
  assert.equal(sRows[0].total, 6600);
  assert.equal(sRows[0].paid, 1600);
  assert.equal(sRows[0].due, 5000);

  const product = await report(owner.accessToken, "purchases", {
    groupBy: "product",
    from: "2026-03-01",
    to: "2026-03-30",
    limit: "10",
  });
  const pRows = product.body.data.items as Array<{ productId: string; qtyPurchased: number; purchasesTotal: number; costTotal: number }>;
  const paP = pRows.find((r) => r.productId === String(pa._id))!;
  const pbP = pRows.find((r) => r.productId === String(pb._id))!;
  assert.ok(paP && pbP);
  assert.equal(paP.qtyPurchased, 5);
  assert.equal(paP.purchasesTotal, 5000);
  assert.equal(paP.costTotal, 5000); // no header discount/tax -> costAmount == lineTotal
  assert.equal(pbP.qtyPurchased, 2);
  assert.equal(pbP.purchasesTotal, 1600);
});

// ── Inventory report ───────────────────────────────────────────────────────

test("inventory report: valuation summary, low-stock flags and pagination", async () => {
  const i1 = await makeProduct({ currentStock: 10, avgCost: 1000, sellingPrice: 2500, minStock: 0 });
  const i2 = await makeProduct({ currentStock: 4, avgCost: 500, sellingPrice: 1200, minStock: 5 }); // low
  const i3 = await makeProduct({ currentStock: 0, avgCost: 300, sellingPrice: 900, minStock: 2 }); // low

  const res = await report(owner.accessToken, "inventory", { limit: "2", page: "1" });
  assert.equal(res.status, 200);
  const s = res.body.data.summary;
  // Summary is business-wide; compute this trio's contribution exactly and
  // verify the rest of the catalog only ADDS non-negative amounts.
  assert.ok(s.productCount >= 3);
  assert.ok(s.totalUnits >= 14);
  assert.ok(s.stockValue >= 10 * 1000 + 4 * 500 + 0 * 300);
  assert.ok(s.retailValue >= 10 * 2500 + 4 * 1200 + 0 * 900);
  assert.ok(s.lowStockCount >= 2);

  // Pagination shape + per-row server-computed values.
  assert.equal(res.body.data.items.length, 2);
  assert.equal(res.body.data.pagination.limit, 2);
  assert.ok(res.body.data.pagination.totalPages >= 2);
  for (const row of res.body.data.items as Array<{
    id: string;
    stockValue: number;
    retailValue: number;
    lowStock: boolean;
    currentStock: number;
  }>) {
    const p = await Product.findById(row.id)!;
    assert.equal(row.stockValue, p!.currentStock * p!.avgCost);
    assert.equal(row.retailValue, p!.currentStock * p!.sellingPrice);
    assert.equal(row.lowStock, p!.minStock > 0 && p!.currentStock <= p!.minStock);
  }

  // The known low products are flagged somewhere in the full list.
  const all = await report(owner.accessToken, "inventory", { limit: "100" });
  const flags = new Map<string, boolean>(
    (all.body.data.items as Array<{ id: string; lowStock: boolean }>).map((r) => [r.id, r.lowStock])
  );
  assert.equal(flags.get(String(i2._id)), true);
  assert.equal(flags.get(String(i3._id)), true);
  assert.equal(flags.get(String(i1._id)), false);
});

// ── Receivables / Payables ─────────────────────────────────────────────────

test("receivables/payables: totals, ordering and empty-tenant case", async () => {
  // Receivables: CX (9000 credit from the sales test) + CY (7000 opening).
  const cxDoc = await Customer.findOne({ businessId: oid(biz.id), currentDue: 9000 });
  assert.ok(cxDoc, "CX with 9000 due must exist from the sales-report seed");
  const cy = await Customer.create({ businessId: oid(biz.id), name: `RCY2-${Math.random().toString(36).slice(2)}`, openingBalance: 7000, currentDue: 7000 });

  const rec = await report(owner.accessToken, "receivables", { limit: "100" });
  assert.equal(rec.status, 200);
  const beforeTotals = rec.body.data.totals;
  const items = rec.body.data.items as Array<{ id: string; currentDue: number }>;
  // Sorted desc: first row holds the largest due in the whole tenant.
  for (const it of items.slice(1)) {
    assert.ok(items[0].currentDue >= it.currentDue);
  }
  assert.ok(items.some((i) => i.id === String(cxDoc!._id)));
  assert.ok(items.some((i) => i.id === String(cy._id)));

  // Delta check: creating a fresh customer shifts totals by exactly its due.
  const extra = await Customer.create({ businessId: oid(biz.id), name: `REX-${Math.random().toString(36).slice(2)}`, openingBalance: 2500, currentDue: 2500 });
  const rec2 = await report(owner.accessToken, "receivables", { limit: "100" });
  assert.equal(rec2.body.data.totals.total - beforeTotals.total, 2500);
  assert.equal(rec2.body.data.totals.count - beforeTotals.count, 1);
  void extra;

  // Payables: RSY has 5000 unpaid from the purchase test + new opener.
  const sz = await Supplier.create({ businessId: oid(biz.id), name: `RSZ-${Math.random().toString(36).slice(2)}`, openingBalance: 2500, currentPayable: 2500 });
  const pay = await report(owner.accessToken, "payables", { limit: "100" });
  assert.equal(pay.status, 200);
  const payItems = pay.body.data.items as Array<{ id: string; currentPayable: number }>;
  assert.ok(pay.body.data.totals.total >= 7500);
  for (const it of payItems.slice(1)) {
    assert.ok(payItems[0].currentPayable >= it.currentPayable);
  }
  assert.ok(payItems.some((i) => i.id === String(sz._id)));

  // Empty tenant case: a brand-new business sees zeroed reports everywhere.
  const newcomer = await registerUser();
  const nbRes = await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${newcomer.accessToken}`)
    .send({ name: "Empty Biz", type: "retail" });
  const nb = nbRes.body.data;
  const nShopRes = await request(app)
    .post("/api/v1/shops")
    .set("Authorization", `Bearer ${newcomer.accessToken}`)
    .send({ businessId: nb.id, name: "Empty Shop", branchCode: `EB-${Math.random().toString(36).slice(2)}` });
  const nShop = nShopRes.body.data;

  for (const [ep, query] of [
    ["receivables", {}],
    ["payables", {}],
    ["expenses", {}],
    ["inventory", {}],
    ["sales", { groupBy: "daily" }],
  ] as const) {
    const r = await report(newcomer.accessToken, ep, { ...query, businessId: nb.id, shopId: nShop.id });
    assert.equal(r.status, 200, ep);
    const d = r.body.data;
    if ("items" in d && Array.isArray(d.items)) assert.equal(d.items.length, 0, `${ep} items`);
    if ("totals" in d) {
      assert.equal(d.totals.total, 0, `${ep} totals.total`);
      assert.equal(d.totals.count, 0, `${ep} totals.count`);
    }
    if ("summary" in d) {
      assert.equal(d.summary.productCount, 0, `${ep} summary.productCount`);
      assert.equal(d.summary.stockValue, 0, `${ep} summary.stockValue`);
    }
    if ("totalAmount" in d) assert.equal(d.totalAmount, 0, `${ep} totalAmount`);
  }
});

// ── Expenses by category ───────────────────────────────────────────────────

test("expense report: category aggregation honours the date range", async () => {
  const acct = await makeAccount(500000);
  async function expense(dateIso: string, category: string, amount: number) {
    const r = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ businessId: biz.id, shopId: shop.id, category, amount, paymentAccountId: acct, expenseDate: dateIso });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  await expense("2026-03-02T08:00:00Z", "RENT", 3000);
  await expense("2026-03-03T08:00:00Z", "MARKETING", 1200);
  await expense("2026-04-01T08:00:00Z", "TRANSPORT", 500);

  const march = await report(owner.accessToken, "expenses", { from: "2026-03-01", to: "2026-03-31" });
  assert.equal(march.status, 200);
  const mItems = march.body.data.items as Array<{ category: string; count: number; total: number }>;
  const rent = mItems.find((i) => i.category === "RENT")!;
  const marketing = mItems.find((i) => i.category === "MARKETING")!;
  const transport = mItems.find((i) => i.category === "TRANSPORT");
  assert.ok(rent && marketing);
  assert.equal(rent.total, 3000);
  assert.equal(rent.count, 1);
  assert.equal(marketing.total, 1200);
  assert.equal(transport, undefined, "April transport must be outside the March range");

  // All-time view includes every category touched.
  const all = await report(owner.accessToken, "expenses");
  const aItems = all.body.data.items as Array<{ category: string; total: number }>;
  const sum = aItems.reduce((s, i) => s + i.total, 0);
  assert.equal(all.body.data.totalAmount, sum);
  assert.ok(sum >= 3000 + 1200 + 500);
});

// ── Profit-loss delegation parity ──────────────────────────────────────────

test("profit-loss report returns EXACTLY the verified accounting engine output", async () => {
  // Journals are dated at creation time (not saleDate), so an all-time query
  // is the deterministic window in which both endpoints must see the seeds.
  const rep = await get(
    `/api/v1/reports/profit-loss?businessId=${biz.id}&shopId=${shop.id}`,
    owner.accessToken
  );
  const acc = await get(
    `/api/v1/accounting/profit-loss?businessId=${biz.id}&shopId=${shop.id}`,
    owner.accessToken
  );
  assert.equal(rep.status, 200);
  assert.equal(acc.status, 200);
  assert.deepEqual(rep.body.data, acc.body.data);
  // Sanity: our seeded sales made real revenue.
  assert.ok(rep.body.data.revenue.total > 0);
});

// ── RBAC + isolation ───────────────────────────────────────────────────────

test("reports: financial persona matrix enforced on every endpoint", async () => {
  async function roleToken(role: string) {
    const reg = await registerUser();
    await BusinessMembership.create({ userId: oid(reg.user.id), businessId: oid(biz.id), role });
    return reg.accessToken;
  }
  const endpoints: Array<[string, Record<string, string>]> = [
    ["sales", { groupBy: "daily" }],
    ["purchases", { groupBy: "daily" }],
    ["inventory", {}],
    ["profit-loss", {}],
    ["receivables", {}],
    ["payables", {}],
    ["expenses", {}],
  ];

  for (const role of ["Viewer", "Salesperson", "Inventory Manager"]) {
    const token = await roleToken(role);
    for (const [ep, query] of endpoints) {
      const res = await report(token, ep, query);
      assert.equal(res.status, 403, `${role} on /reports/${ep}`);
    }
  }

  const accountant = await roleToken("Accountant");
  for (const [ep, query] of endpoints) {
    const res = await report(accountant, ep, query);
    assert.equal(res.status, 200, `Accountant on /reports/${ep}`);
  }
});

test("reports: cross-tenant access is 404 on every endpoint", async () => {
  const stranger = await registerUser();
  await request(app)
    .post("/api/v1/businesses")
    .set("Authorization", `Bearer ${stranger.accessToken}`)
    .send({ name: "Stranger Biz", type: "retail" });

  for (const [ep, query] of [
    ["sales", { groupBy: "daily" }],
    ["purchases", { groupBy: "monthly" }],
    ["inventory", {}],
    ["profit-loss", {}],
    ["receivables", {}],
    ["payables", {}],
    ["expenses", {}],
  ] as const) {
    const res = await report(stranger.accessToken, ep, { ...query, businessId: biz.id });
    assert.equal(res.status, 404, `/reports/${ep}`);
  }
});
