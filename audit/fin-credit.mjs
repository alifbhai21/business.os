import { readFileSync, writeFileSync } from "node:fs";
const BASE = "http://localhost:4000";
const st = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const biz = st.businessId, shop = st.shopId;
const stamp = Date.now();
async function call(method, path, body, tok) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(BASE + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const txt = await res.text();
  let b = null; try { b = JSON.parse(txt); } catch {}
  console.log(`${method} ${path} -> ${res.status}${res.status >= 400 ? " " + txt.slice(0, 300) : ""}`);
  return { status: res.status, body: b };
}
const login = await call("POST", "/api/v1/auth/login", { email: "fullaudit20260825@example.com", password: "password123", deviceId: `fin-${stamp}`, deviceName: "fin" });
const tok = login.body.data.accessToken;

const pr = await call("POST", "/api/v1/products", { businessId: biz, name: `FinProd-${stamp}`, unit: "piece", sku: `FP${stamp}`, barcode: `FPB${stamp}`, purchasePrice: 6000, sellingPrice: 9000, taxRate: 0 }, tok);
const prId = pr.body.data.id;
const sup = await call("POST", "/api/v1/suppliers", { businessId: biz, name: `FinSup-${stamp}`, phone: `019${String(stamp).slice(-8)}` }, tok);
const supId = sup.body.data.id;
const cust = await call("POST", "/api/v1/customers", { businessId: biz, name: `FinCust-${stamp}`, phone: `017${String(stamp).slice(-8)}` }, tok);
const custId = cust.body.data.id;

const pu = await call("POST", "/api/v1/purchases", { businessId: biz, shopId: shop, supplierId: supId, items: [{ productId: prId, qty: 5 }], paidAmount: 0, localId: `fin-pur-${stamp}`, notes: "credit purchase" }, tok);
const puId = pu.body?.data?.id;

const sv = await call("POST", "/api/v1/sales", { businessId: biz, shopId: shop, customerId: custId, items: [{ productId: prId, qty: 2 }], paidAmount: 0, localId: `fin-sale-${stamp}`, notes: "credit sale" }, tok);
const saleId = sv.body?.data?.id;

writeFileSync("d:/business-os/audit/fin-state.json", JSON.stringify({ stamp, biz, shop, prId, supId, custId, puId, saleId }, null, 2));
console.log("IDS", JSON.stringify({ prId, supId, custId, puId, saleId }));
process.exit(0);
