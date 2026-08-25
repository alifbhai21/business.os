// Financial lifecycle audit part 1: setup + payments + sale lifecycle.
import { readFileSync, writeFileSync } from "node:fs";
const s = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const BID = s.businessId, SID = s.shopId, PID = s.productId, PID2 = s.product2Id,
  CID = s.customerId, SUPID = s.supplierId, ACC = s.accountId;
const ts = Date.now();

const lr = await fetch("http://localhost:4000/api/v1/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "fullaudit20260825@example.com", password: "password123", deviceId: "life-" + ts }),
});
const TOKEN = (await lr.json()).data.accessToken;
if (!TOKEN) { console.log("LOGIN FAIL"); process.exit(1); }
globalThis.__TOKEN__ = TOKEN;

const api = async (method, path, body) => {
  const headers = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + TOKEN };
  const t0 = Date.now();
  const res = await fetch("http://localhost:4000" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  let parsed; try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt.slice(0, 120) }; }
  const ok = res.ok;
  console.log((ok ? "PASS" : "FAIL") + " [" + (parsed?.error?.code ?? "OK") + "] " + method + " " + path + " -> " + res.status + " (" + (Date.now() - t0) + "ms)" + (ok ? "" : " | " + (parsed.error?.message ?? "")));
  return { status: res.status, body: parsed, ms: Date.now() - t0 };
};

const results = {};
const R = (label, x) => { results[label] = x; };

// PAYMENTS
R("pay-cust-create", await api("POST", "/api/v1/payments", { businessId: BID, shopId: SID, type: "customer_payment", customerId: CID, amount: 2000, method: "CASH", accountId: ACC, idempotencyKey: "audit-pay-cust-" + ts, localId: "audit-pay-cust-" + ts }));
const payId = results["pay-cust-create"].body.data?.id;
R("pay-cust-replay", await api("POST", "/api/v1/payments", { businessId: BID, shopId: SID, type: "customer_payment", customerId: CID, amount: 999999, method: "CASH", accountId: ACC, idempotencyKey: "audit-pay-cust-" + ts }));
R("pay-supplier", await api("POST", "/api/v1/payments", { businessId: BID, shopId: SID, type: "supplier_payment", supplierId: SUPID, amount: 1000, method: "CASH", accountId: ACC, idempotencyKey: "pay-sup-" + ts }));
R("pay-bad-type", await api("POST", "/api/v1/payments", { businessId: BID, shopId: SID, type: "customer_payment", supplierId: SUPID, amount: 500, method: "CASH", accountId: ACC, idempotencyKey: "pay-bad-" + ts }));
R("pay-bad-account", await api("POST", "/api/v1/payments", { businessId: BID, shopId: SID, type: "customer_payment", customerId: CID, amount: 500, method: "CASH", accountId: "000000000000000000000000", idempotencyKey: "pay-badacc-" + ts }));
R("pay-negative", await api("POST", "/api/v1/payments", { businessId: BID, shopId: SID, type: "customer_payment", customerId: CID, amount: -5, method: "CASH", accountId: ACC, idempotencyKey: "pay-neg-" + ts }));

// SALE lifecycle
const saleBody = { businessId: BID, shopId: SID, customerId: CID, items: [{ productId: PID, qty: 2 }], paidAmount: 10000, accountId: ACC, localId: "life-sale-" + ts };
R("sale-create", await api("POST", "/api/v1/sales", saleBody));
const saleId = results["sale-create"].body.data?.id;
R("sale-get", await api("GET", "/api/v1/sales/" + saleId + "?businessId=" + BID + "&shopId=" + SID));
R("sale-replay", await api("POST", "/api/v1/sales", { ...saleBody, paidAmount: 999999 }));
R("sale-finalize", await api("POST", "/api/v1/sales/" + saleId + "/finalize", { businessId: BID, shopId: SID, paidAmount: 3000 }));
R("sale-finalize-dup", await api("POST", "/api/v1/sales/" + saleId + "/finalize", { businessId: BID, shopId: SID, paidAmount: 0 }));
R("sale-payment", await api("POST", "/api/v1/sales/" + saleId + "/payments", { businessId: BID, shopId: SID, amount: 2000, method: "CASH", accountId: ACC, idempotencyKey: "sale-pay-" + ts }));
R("sale-payments-list", await api("GET", "/api/v1/sales/" + saleId + "/payments?businessId=" + BID + "&shopId=" + SID));
R("sale-return", await api("POST", "/api/v1/sales/" + saleId + "/return", { businessId: BID, shopId: SID, items: [{ productId: PID, qty: 1 }], reason: "audit return" }));

globalThis.__life = { saleId, payId, results };
writeFileSync("d:/business-os/audit/results-finlife-part1.json", JSON.stringify(results, null, 2));
console.log("\npart1 saved. saleId=", saleId, "payId=", payId);