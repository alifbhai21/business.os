// Focused re-verification of RBAC allow-cases with corrected payloads/expectations.
import { readFileSync } from "node:fs";
const S = JSON.parse(readFileSync("d:/business-os/audit/rbac-state.json", "utf8"));
const { bid, sid, pid, cid, acc, ownerToken } = S;
const supplierId = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8")).supplierId;

const raw = async (path, method, body, token) => {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch("http://localhost:4000" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let code = "";
  try { const j = await res.json(); code = j?.error?.code ?? ""; } catch {}
  return [res.status, code];
};
const setRole = async (role) => {
  const rj = await (await fetch("http://localhost:4000/api/v1/employees/" + S.employeeId, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + ownerToken },
    body: JSON.stringify({ businessId: bid, role }),
  })).json();
  console.log("role ->", role, "employeeRole:", rj.data?.role);
};
const T = async (label, method, path, body, expect) => {
  const [s, code] = await raw(path, method, body, S.actorToken);
  console.log((s === expect ? "PASS " : "FAIL ") + "[" + label + "] -> " + s + (code ? "/" + code : "") + " (exp " + expect + ")");
};

await setRole("Salesperson");
await T("sales-create(201)", "POST", "/api/v1/sales", { businessId: bid, shopId: sid, customerId: cid, items: [{ productId: pid, qty: 1 }], paidAmount: 15000, accountId: acc, localId: "rbac-sale2-" + Date.now() }, 201);
await T("customers-create(201)", "POST", "/api/v1/customers", { businessId: bid, name: "RbacCustomer2", phone: "01766668889" }, 201);

await setRole("Inventory Manager");
await T("purchases-create(201)", "POST", "/api/v1/purchases", { businessId: bid, shopId: sid, supplierId, items: [{ productId: pid, qty: 1 }], paidAmount: 500, accountId: acc, localId: "rb-pur2-" + Date.now() }, 201);
await T("inventory-adjust(201)", "POST", "/api/v1/inventory/adjust", { businessId: bid, shopId: sid, productId: pid, qtyChange: 1, reason: "x", kind: "adjustment" }, 201);
await T("products-create(201)", "POST", "/api/v1/products", { businessId: bid, name: "IM Product", unit: "pcs", purchasePrice: 100, sellingPrice: 200, currentStock: 5 }, 201);

await setRole("Accountant");
await T("expense-RENT(201)", "POST", "/api/v1/expenses", { businessId: bid, shopId: sid, category: "RENT", amount: 200, paymentAccountId: acc }, 201);
await T("payments-create(201)", "POST", "/api/v1/payments", { businessId: bid, shopId: sid, type: "customer_payment", customerId: cid, amount: 50, method: "CASH", accountId: acc, idempotencyKey: "acc2-" + Date.now() }, 201);

await setRole("Viewer");
console.log("final role: Viewer");