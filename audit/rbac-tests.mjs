// RBAC batch runner: reads rbac-state.json, cycles the employee role and tests allow/deny.
import { readFileSync } from "node:fs";
const S = JSON.parse(readFileSync("d:/business-os/audit/rbac-state.json", "utf8"));
const { bid, sid, pid, cid, acc, employeeId } = S;
const TOK = () => S.actorToken, OWN = () => S.ownerToken;

const raw = async (path, method, body, token) => {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch("http://localhost:4000" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let code = "";
  try { const j = await res.json(); code = j?.error?.code ?? ""; } catch {}
  return [res.status, code];
};
const T = async (label, method, path, body, token, expect) => {
  const [s, code] = await raw(path, method, body, token);
  const pass = s === expect;
  console.log((pass ? "PASS " : "FAIL ") + "[" + label + "] " + method + " " + path + " -> " + s + (code ? "/" + code : "") + " (exp " + expect + ")");
  return pass;
};
const setRole = async (role) => {
  const r = await fetch("http://localhost:4000/api/v1/employees/" + S.employeeId, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + S.ownerToken },
    body: JSON.stringify({ businessId: bid, role }),
  });
  const rj = await r.json();
  console.log("   -- role=" + role + " HTTP " + r.status + " employeeRole:" + rj.data?.role);
};
const sales = { businessId: bid, shopId: sid, customerId: cid, items: [{ productId: pid, qty: 1 }], paidAmount: 15000, accountId: acc, localId: "rbac-sale-" + Date.now() };

console.log("===== BATCH: Salesperson =====");
await T("sales-create", "POST", "/api/v1/sales", sales, TOK(), 200);
await T("products-list", "GET", "/api/v1/products?businessId=" + bid, null, TOK(), 200);
await T("customers-create", "POST", "/api/v1/customers", { businessId: bid, name: "RbacCustomer", phone: "01766668888" }, TOK(), 200);
await T("search", "GET", "/api/v1/search?businessId=" + bid + "&q=Rbac", null, TOK(), 200);
await T("units", "GET", "/api/v1/units", null, TOK(), 200);
await T("backup-status", "GET", "/api/v1/backup/status?businessId=" + bid, null, TOK(), 200);
await T("export-data-DENY", "GET", "/api/v1/export/data?businessId=" + bid, null, TOK(), 403);
await T("sync-stats-DENY", "GET", "/api/v1/sync/stats?businessId=" + bid, null, TOK(), 403);
await T("accounting-ledger-DENY", "GET", "/api/v1/accounting/ledger?businessId=" + bid + "&shopId=" + sid, null, TOK(), 403);
await T("reports-sales-DENY", "GET", "/api/v1/reports/sales?businessId=" + bid + "&shopId=" + sid, null, TOK(), 403);
await T("dashboard-DENY", "GET", "/api/v1/dashboard?businessId=" + bid + "&shopId=" + sid, null, TOK(), 403);
await T("ops-DENY", "GET", "/api/v1/ops/metrics", null, TOK(), 403);
await T("products-create-DENY", "POST", "/api/v1/products", { businessId: bid, name: "No", unit: "pcs", purchasePrice: 100, sellingPrice: 200 }, TOK(), 403);
await T("payments-create-DENY", "POST", "/api/v1/payments", { businessId: bid, shopId: sid, type: "customer_payment", customerId: cid, amount: 100, method: "CASH", accountId: acc, idempotencyKey: "rbac-pay-" + Date.now() }, TOK(), 403);
await T("expenses-create-DENY", "POST", "/api/v1/expenses", { businessId: bid, shopId: sid, category: "RENT", amount: 100, paymentAccountId: acc }, TOK(), 403);
await T("purchases-create-DENY", "POST", "/api/v1/purchases", { businessId: bid, shopId: sid, supplierId: cid, items: [{ productId: pid, qty: 1 }], paidAmount: 500, accountId: acc }, TOK(), 403);
await T("inventory-adjust-DENY", "POST", "/api/v1/inventory/adjust", { businessId: bid, shopId: sid, productId: pid, qtyChange: 1, reason: "x", kind: "adjustment" }, TOK(), 403);
await T("roles-assign-DENY", "POST", "/api/v1/roles", { businessId: bid, employeeId: "000000000000000000000000", role: "Manager" }, TOK(), 403);
await T("employees-list-DENY", "GET", "/api/v1/employees?businessId=" + bid, null, TOK(), 403);
console.log("\n===== BATCH: Inventory Manager =====");
await setRole("Inventory Manager");
await T("purchases-create", "POST", "/api/v1/purchases", { businessId: bid, shopId: sid, supplierId: cid, items: [{ productId: pid, qty: 1 }], paidAmount: 500, accountId: acc, localId: "rbac-pur-" + Date.now() }, TOK(), 200);
await T("inventory-adjust", "POST", "/api/v1/inventory/adjust", { businessId: bid, shopId: sid, productId: pid, qtyChange: 1, reason: "x", kind: "adjustment" }, TOK(), 200);
await T("products-create", "POST", "/api/v1/products", { businessId: bid, name: "IM Product", unit: "pcs", purchasePrice: 100, sellingPrice: 200, currentStock: 5 }, TOK(), 200);
await T("sales-create-DENY", "POST", "/api/v1/sales", sales, TOK(), 403);
await T("export-data-DENY", "GET", "/api/v1/export/data?businessId=" + bid, null, TOK(), 403);
await T("accounting-DENY", "GET", "/api/v1/accounting/journal?businessId=" + bid + "&shopId=" + sid, null, TOK(), 403);
await T("roles-assign-DENY", "POST", "/api/v1/roles", { businessId: bid, employeeId: "000000000000000000000000", role: "Manager" }, TOK(), 403);

console.log("\n===== BATCH: Accountant =====");
await setRole("Accountant");
await T("payments-create", "POST", "/api/v1/payments", { businessId: bid, shopId: sid, type: "customer_payment", customerId: cid, amount: 100, method: "CASH", accountId: acc, idempotencyKey: "acc-pay-" + Date.now() }, TOK(), 201);
await T("expenses-create", "POST", "/api/v1/expenses", { businessId: bid, shopId: sid, category: "UTILITIES", amount: 200, paymentAccountId: acc }, TOK(), 201);
await T("export-data", "GET", "/api/v1/export/data?businessId=" + bid, null, TOK(), 200);
await T("accounting-ledger", "GET", "/api/v1/accounting/ledger?businessId=" + bid + "&shopId=" + sid, null, TOK(), 200);
await T("sync-stats", "GET", "/api/v1/sync/stats?businessId=" + bid, null, TOK(), 200);
await T("products-create-DENY", "POST", "/api/v1/products", { businessId: bid, name: "No", unit: "pcs", purchasePrice: 100, sellingPrice: 200 }, TOK(), 403);
await T("export-excel", "GET", "/api/v1/export/excel?businessId=" + bid + "&type=sales", null, TOK(), 200);

console.log("\n===== BATCH: Viewer =====");
await setRole("Viewer");
await T("products-list", "GET", "/api/v1/products?businessId=" + bid, null, TOK(), 200);
await T("invoices-sales", "GET", "/api/v1/invoices/sales?businessId=" + bid + "&shopId=" + sid, null, TOK(), 200);
await T("sales-create-DENY", "POST", "/api/v1/sales", sales, TOK(), 403);
await T("export-data-DENY", "GET", "/api/v1/export/data?businessId=" + bid, null, TOK(), 403);
await T("reports-DENY", "GET", "/api/v1/reports/sales?businessId=" + bid + "&shopId=" + sid, null, TOK(), 403);

console.log("\nDONE");