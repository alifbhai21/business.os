// Business OS - REAL live HTTP audit driver.
// Runs real requests against http://localhost:4000 (Atlas business_os_api_test).
// Reuses prior FULLAUDIT business A tenant; creates FRESH resources via the API.
import { readFileSync, writeFileSync } from "node:fs";
const BASE = "http://localhost:4000";
const state = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const biz = state.businessId;
const shop = state.shopId;
const bankAcct = state.bankAccountId;
let tok = state.accessToken;
const stamp = Date.now();
const results = [];
// ids created in this run, referenced across steps:
let catId, pr1, pr2, custId, supId, acc2, shopB, puId, saleId, expenseId, trId, empId, devId;

function redact(o) {
  if (Array.isArray(o)) return o.map(redact);
  if (o && typeof o === "object") {
    for (const k of Object.keys(o)) {
      if (["accessToken", "refreshToken", "token", "resetToken"].includes(k) && typeof o[k] === "string" && o[k].length > 12) o[k] = "[REDACTED]";
      else redact(o[k]);
    }
  }
  return o;
}

async function call(method, path, body, opts = {}) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (typeof opts.auth === "string") headers.Authorization = opts.auth;
  else if (opts.auth !== false) headers.Authorization = `Bearer ${tok}`;
  const req = { method, headers };
  if (body) req.body = JSON.stringify(body);
  const t0 = Date.now();
  let res;
  try { res = await fetch(BASE + path, req); }
  catch (e) { return { status: 0, ms: Date.now() - t0, body: null, text: "NETERR " + e.message }; }
  const ms = Date.now() - t0;
  const raw = await res.text();
  let bodyObj = null;
  try { bodyObj = JSON.parse(raw); } catch {}
  const text = bodyObj ? JSON.stringify(redact(structuredClone(bodyObj))) : raw.slice(0, 200);
  return { status: res.status, ms, body: bodyObj, text };
}

function R(step, method, path, r, note) {
  results.push({ step, method, path, status: r.status, ms: r.ms, note: note || "" });
  console.log(`${step} :: ${method} ${path} :: HTTP ${r.status} ${r.ms}ms ${note || ""}`);
  if (r.status >= 400 && r.text) console.log(`     BODY ${r.text.slice(0, 900)}`);
}
// Fresh login to obtain a valid access token for this run (15m JWT lifetime).
console.log("== FRESH LOGIN ==");
{
  const lr = await call("POST", "/api/v1/auth/login", { email: "fullaudit20260825@example.com", password: "password123", deviceId: `live-run-${stamp}`, deviceName: "LiveAudit" });
  if (lr.status === 200 && lr.body?.data?.accessToken) {
    tok = lr.body.data.accessToken;
    console.log("LOGIN OK");
  } else {
    console.log("LOGIN FAILED", lr.status, (lr.text || "").slice(0, 200));
  }
}

console.log("== AUTH ==");
R("A1", "me", "/auth/me", await call("GET", "/api/v1/auth/me", undefined), "");

console.log("== SETUP (business A: fresh resources via API) ==");
const sb = await call("POST", "/api/v1/shops", { businessId: biz, name: `LiveShopB-${stamp}`, branchCode: `LB-${stamp}`, openingCash: 100000000 });
shopB = (sb.body && (sb.body.data?.id || sb.body.data?._id || sb.body.data?.shop?.id)) || undefined;
R("S1", "shopB-create", "/shops", sb, sb.status === 201 ? "shopB created" : "");
// Funded CASH account seeded by shopB openingCash (1,000,000 taka), used for paid financial ops.
let funded;
if (shopB) {
  const accList = await call("GET", `/api/v1/accounts?businessId=${biz}&shopId=${shopB}`);
  const items = accList.body?.data?.items || accList.body?.data || [];
  funded = items[0]?._id || items[0]?.id;
  console.log("FUNDED ACCOUNT", funded);
}

const cat = await call("POST", "/api/v1/categories", { businessId: biz, name: `LiveCat-${stamp}` });
catId = cat.body?.data?.id;
R("C1", "category-create", "/categories", cat, "");

const p1 = await call("POST", "/api/v1/products", { businessId: biz, name: `L-Prod-${stamp}-a`, unit: "piece", sku: `LP${stamp}a`, barcode: `LPB${stamp}a`, purchasePrice: 8000, sellingPrice: 12000, taxRate: 0 });
pr1 = p1.body?.data?.id;
R("Pr1", "product-create-a", "/products", p1, p1.status === 201 ? "prod created" : "");

const p2 = await call("POST", "/api/v1/products", { businessId: biz, name: `L-Prod-${stamp}-b`, unit: "piece", sku: `LP${stamp}b`, barcode: `LPB${stamp}b`, purchasePrice: 5000, sellingPrice: 9000, taxRate: 0 });
pr2 = p2.body?.data?.id;
R("Pr2", "product-create-b", "/products", p2, "");

const cu = await call("POST", "/api/v1/customers", { businessId: biz, name: `LiveCust-${stamp}`, phone: `017${String(stamp).slice(-8)}` });
custId = cu.body?.data?.id;
R("Cu1", "customer-create", "/customers", cu, "");

const su = await call("POST", "/api/v1/suppliers", { businessId: biz, name: `LiveSup-${stamp}`, phone: `019${String(stamp).slice(-8)}` });
supId = su.body?.data?.id;
R("Su1", "supplier-create", "/suppliers", su, "");

const a2 = await call("POST", "/api/v1/accounts", { businessId: biz, shopId: shop, name: `LiveBank-${stamp}`, type: "BANK" });
acc2 = a2.body?.data?.id;
R("Acc1", "account-create", "/accounts", a2, "");

console.log("== CATALOG READS ==");
R("Cn2", "category-list", "/categories", await call("GET", `/api/v1/categories?businessId=${biz}`), "");
R("Pr3", "product-list", "/products", await call("GET", `/api/v1/products?businessId=${biz}`), "");
R("Pr4", "barcode-lookup", "/products/lookup/barcode", await call("GET", `/api/v1/products/lookup/barcode?businessId=${biz}&barcode=LPB${stamp}a`), "");
R("Cu2", "customer-list", "/customers", await call("GET", `/api/v1/customers?businessId=${biz}`), "");
R("Su2", "supplier-list", "/suppliers", await call("GET", `/api/v1/suppliers?businessId=${biz}`), "");
R("Un1", "units", "/units", await call("GET", "/api/v1/units"), "");

console.log("== PURCHASE / STOCK ==");
  const pu = await call("POST", "/api/v1/purchases", { businessId: biz, shopId: shop, supplierId: supId, items: [{ productId: pr1, qty: 10 }, { productId: pr2, qty: 8 }], paidAmount: 30000, accountId: funded, localId: `live-pur-${stamp}`, notes: "live audit purchase" });
  puId = pu.body?.data?.id;
  R("Pch1", "purchase-create", "/purchases", pu, pu.status === 201 ? "purchase created" : "");
  R("Pch2", "purchase-finalize", "/purchases/:id/finalize", await call("POST", `/api/v1/purchases/${puId}/finalize`, { businessId: biz, shopId: shop, paidAmount: 30000, accountId: funded }), "");
  R("Pch3", "purchase-payment", "/purchases/:id/payments", await call("POST", `/api/v1/purchases/${puId}/payments`, { businessId: biz, shopId: shop, amount: 20000, method: "BANK", accountId: funded, idempotencyKey: `live-ppay-${stamp}`, note: "settlement" }), "");

  console.log("== SALE / FIN / PAY / EXPENSE ==");
  const sv = await call("POST", "/api/v1/sales", { businessId: biz, shopId: shop, customerId: custId,
    items: [{ productId: pr1, qty: 2 }, { productId: pr2, qty: 1 }], paidAmount: 20000, accountId: funded, localId: `live-sale-${stamp}`, notes: "audit sale" });
  saleId = sv.body?.data?.id;
  R("Sa1", "sale-create", "/sales", sv, sv.status === 201 ? "sale created" : "");
  R("Sa2", "sale-finalize", "/sales/:id/finalize", await call("POST", `/api/v1/sales/${saleId}/finalize`, { businessId: biz, shopId: shop, paidAmount: 20000, accountId: funded }), "");
  R("Sa3", "sale-payment", "/sales/:id/payments", await call("POST", `/api/v1/sales/${saleId}/payments`, { businessId: biz, shopId: shop, amount: 5000, method: "CASH", accountId: funded, idempotencyKey: `live-spay-${stamp}`, note: "partial settle" }), "");
  R("Sa4", "sale-payments-list", "/sales/:id/payments", await call("GET", `/api/v1/sales/${saleId}/payments?businessId=${biz}&shopId=${shop}`), "");

  const ex = await call("POST", "/api/v1/expenses", { businessId: biz, shopId: shop, category: "RENT", amount: 2000, paymentAccountId: funded, note: "audit expense", localId: `live-exp-${stamp}` });
  expenseId = ex.body?.data?.id;
  R("E1", "expense-create", "/expenses", ex, "");
  R("Py1", "payment-create", "/payments", await call("POST", "/api/v1/payments", { businessId: biz, shopId: shop, type: "customer_payment", customerId: custId, amount: 3000, method: "CASH", accountId: funded, idempotencyKey: `live-pay-${stamp}`, note: "payment" }), "");

  console.log("== INVENTORY / TRANSFERS ==");
  R("I1", "inventory-adjust", "/inventory/adjust", await call("POST", "/api/v1/inventory/adjust", { businessId: biz, shopId: shop, productId: pr1, qtyChange: 2, reason: "audit adjust", kind: "adjustment" }), "");
  R("T11", "transfer-create", "/transfers", await (async () => { const t = await call("POST", "/api/v1/transfers", { businessId: biz, sourceShopId: shop, destShopId: shopB, productId: pr1, quantity: 1, notes: "audit transfer", localId: `live-trf-${stamp}` }); trId = t.body?.data?.id; return t; })(), "");
console.log("== REPORTS / ACCOUNTING ==");
  R("AcR1", "journal", "/accounting/journal", await call("GET", `/api/v1/accounting/journal?businessId=${biz}&shopId=${shop}`), "");
  R("AcR2", "chart", "/accounting/chart", await call("GET", `/api/v1/accounting/chart?businessId=${biz}&shopId=${shop}`), "");
  R("AcR3", "trial-balance", "/accounting/trial-balance", await call("GET", `/api/v1/accounting/trial-balance?businessId=${biz}&shopId=${shop}`), "");
  R("AcR4", "profit-loss", "/accounting/profit-loss", await call("GET", `/api/v1/accounting/profit-loss?businessId=${biz}&shopId=${shop}`), "");
  R("Db1", "dashboard", "/dashboard", await call("GET", `/api/v1/dashboard?businessId=${biz}&shopId=${shop}`), "");
  R("Rp1", "report-sales", "/reports/sales", await call("GET", `/api/v1/reports/sales?businessId=${biz}&shopId=${shop}&groupBy=daily`), "");
  R("Sg1", "search", "/search", await call("GET", `/api/v1/search?businessId=${biz}&q=L-Prod-${stamp}`), "");

  console.log("== TEAM / OPS ==");
  const em = await call("POST", "/api/v1/employees", { businessId: biz, name: `LiveEmp-${stamp}`, phone: `018${String(stamp).slice(-8)}`, role: "Salesperson" });
  empId = em.body?.data?.id || em.body?.data?.employee?.id;
  R("E2", "employee-create", "/employees", em, em.status === 201 ? "employee created" : "");
  R("E3", "role-assign", "/roles", await call("POST", "/api/v1/roles", { businessId: biz, employeeId: empId, role: "Manager" }), "");
  const dv = await call("POST", "/api/v1/devices", { businessId: biz, deviceId: `live-dev-${stamp}`, deviceName: "LiveDevice" });
  devId = dv.body?.data?.id;
  R("D1", "device-register", "/devices", dv, "");
  R("D2", "device-revoke", "/devices/:id/revoke", await call("PUT", `/api/v1/devices/${devId}/revoke`, { businessId: biz }), "");
  R("Ad1", "audit-list", "/audit", await call("GET", `/api/v1/audit?businessId=${biz}&limit=100`), "");

  console.log("== SYNC / BACKUP / EXPORT / NOTIF / OPS ==");
  R("Sy1", "sync-push", "/sync/push", await call("POST", "/api/v1/sync/push", { businessId: biz, shopId: shop, ops: [{ localId: `live-sync-${stamp}`, type: "customer", payload: { businessId: biz, name: `SyncCust-${stamp}`, phone: `016${String(stamp).slice(-8)}` } }] }), "");
  R("Sy2", "sync-pull", "/sync/pull", await call("GET", `/api/v1/sync/pull?businessId=${biz}`), "");
  R("Sy3", "sync-stats", "/sync/stats", await call("GET", `/api/v1/sync/stats?businessId=${biz}`), "");
  R("Ba1", "backup-status", "/backup/status", await call("GET", `/api/v1/backup/status?businessId=${biz}&shopId=${shop}`), "");
  R("Ex1", "export-data", "/export/data", await call("GET", `/api/v1/export/data?businessId=${biz}`), "");
  R("Not1", "notifications-list", "/notifications", await call("GET", `/api/v1/notifications?businessId=${biz}`), "");
  R("Not2", "notif-prefs", "/notifications/preferences", await call("PUT", "/api/v1/notifications/preferences", { businessId: biz, lowStock: true, customerDue: true, syncFailure: true }), "");
  R("Op1", "ops-metrics", "/ops/metrics", await call("GET", "/api/v1/ops/metrics"), "");

  console.log("== NEGATIVE / SECURITY ==");
  R("Neg1", "no-auth", "GET /products", await call("GET", `/api/v1/products?businessId=${biz}`, undefined, { auth: false }), "expect 401");
  R("Neg2", "invalid-token", "GET /products", await call("GET", `/api/v1/products?businessId=${biz}`, undefined, { auth: "Bearer invalid.token.here" }), "expect 401");
  R("Neg3", "foreign-business", "GET /products", await call("GET", `/api/v1/products?businessId=000000000000000000000000`), "expect 404");
  R("Neg4", "missing-required", "POST /categories", await call("POST", "/api/v1/categories", { name: "NoBiz" }), "expect 400");

  writeFileSync("d:/business-os/audit/live-state.json", JSON.stringify({ stamp, businessId: biz, shopId: shop, shopB, catId, pr1, pr2, custId, supId, acc2, puId, saleId, expenseId, trId, empId, devId }, null, 2));
  const bad = results.filter((x) => x.status >= 400 || x.status === 0);
  console.log(`\nDONE. steps=${results.length} non-2xx=${bad.length}`);
  bad.forEach((b) => console.log(`  FAIL ${b.step} ${b.method} ${b.path} -> ${b.status}`));
  process.exit(0);