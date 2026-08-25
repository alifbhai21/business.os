// Financial lifecycle audit part 2: purchase lifecycle + inventory + transfers.
// Reads a fresh token itself and loads part-1 results for continuity.
import { readFileSync, writeFileSync } from "node:fs";
const s = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const part1 = JSON.parse(readFileSync("d:/business-os/audit/results-finlife-part1.json", "utf8"));
const BID = s.businessId, SID = s.shopId, PID = s.productId, PID2 = s.product2Id, SUPID = s.supplierId, ACC = s.accountId;
const ts = Date.now();

const lr = await fetch("http://localhost:4000/api/v1/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "fullaudit20260825@example.com", password: "password123", deviceId: "life2-" + ts }),
});
const TOKEN = (await lr.json()).data.accessToken;
if (!TOKEN) { console.log("LOGIN FAIL"); process.exit(1); }

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

const results = { ...part1 };
const R = (label, x) => { results[label] = x; };

// PURCHASE lifecycle
R("pur-create", await api("POST", "/api/v1/purchases", { businessId: BID, shopId: SID, supplierId: SUPID, items: [{ productId: PID, qty: 3 }], paidAmount: 5000, accountId: ACC, localId: "life-pur-" + ts }));
const purId = results["pur-create"].body.data?.id;
R("pur-replay", await api("POST", "/api/v1/purchases", { businessId: BID, shopId: SID, supplierId: SUPID, items: [{ productId: PID, qty: 3 }], paidAmount: 999999, accountId: ACC, localId: "life-pur-" + ts }));
R("pur-finalize", await api("POST", "/api/v1/purchases/" + purId + "/finalize", { businessId: BID, shopId: SID, paidAmount: 2000 }));
R("pur-payment", await api("POST", "/api/v1/purchases/" + purId + "/payments", { businessId: BID, shopId: SID, amount: 1000, method: "CASH", accountId: ACC, idempotencyKey: "pur-pay-" + ts }));
R("pur-return", await api("POST", "/api/v1/purchases/" + purId + "/return", { businessId: BID, shopId: SID, items: [{ productId: PID, qty: 1 }], reason: "audit return" }));

// INVENTORY
R("inv-adjust-up", await api("POST", "/api/v1/inventory/adjust", { businessId: BID, shopId: SID, productId: PID, qtyChange: 3, reason: "audit adjust", kind: "adjustment", localId: "inv-up-" + ts }));
R("inv-adjust-down", await api("POST", "/api/v1/inventory/adjust", { businessId: BID, shopId: SID, productId: PID, qtyChange: -2, reason: "audit adjust down", kind: "adjustment", localId: "inv-down-" + ts }));
R("inv-adjust-neg", await api("POST", "/api/v1/inventory/adjust", { businessId: BID, shopId: SID, productId: PID, qtyChange: -999999, reason: "too low", kind: "adjustment", localId: "inv-neg-" + ts }));
R("inv-opening", await api("POST", "/api/v1/inventory/opening", { businessId: BID, shopId: SID, productId: PID2, quantity: 25, localId: "inv-open-" + ts }));

// TRANSFERS
R("transfer-create", await api("POST", "/api/v1/transfers", { businessId: BID, sourceShopId: SID, destShopId: "6a8c8ca09a76c6b095f949ea", productId: PID, quantity: 1, notes: "audit transfer", localId: "tr-" + ts }));
const tId = results["transfer-create"].body.data?.id;
R("transfer-status", await api("PUT", "/api/v1/transfers/" + tId + "/status", { businessId: BID, shopId: SID, status: "RECEIVED" }));
R("transfer-status-bad", await api("PUT", "/api/v1/transfers/" + tId + "/status", { businessId: BID, shopId: SID, status: "BOGUS" }));

writeFileSync("d:/business-os/audit/results-finlife.json", JSON.stringify(results, null, 2));
console.log("\nSaved results-finlife.json. purchaseId=", purId, "transferId=", tId);