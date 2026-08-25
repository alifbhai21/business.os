import { readFileSync, writeFileSync } from "node:fs";
const s = JSON.parse(readFileSync("d:/business-os/audit/state.json", "utf8"));
const bid = s.businessId, sid = s.shopId, pid = s.productId, cid = s.customerId, acc = s.accountId;

const bodies = {
  "sync-push-valid.json": {
    businessId: bid, shopId: sid,
    ops: [
      { localId: "audit-sync-1", type: "customer", payload: { businessId: bid, name: "AuditSyncCustomer", phone: "01791112233" } },
      { localId: "audit-sync-2", type: "product", payload: { businessId: bid, name: "AuditSyncProduct", unit: "piece", purchasePrice: 10000, sellingPrice: 15000, currentStock: 10, taxRate: 0 } },
      { localId: "audit-cx-1", type: "sale", payload: { customerId: cid, items: [{ productId: pid, qty: 1 }], paidAmount: 15000, accountId: acc } },
    ],
  },
  "sync-push-dup.json": {
    businessId: bid, shopId: sid,
    ops: [{ localId: "audit-sync-1", type: "customer", payload: { businessId: bid, name: "AuditSyncCustomerDUP", phone: "01791112233" } }],
  },
  "sync-push-badprod.json": {
    businessId: bid, shopId: sid,
    ops: [
      { localId: "audit-cx-2", type: "sale", payload: { customerId: cid, items: [{ productId: "000000000000000000000000", qty: 1 }], paidAmount: 1000, accountId: acc } },
      { localId: "audit-badlocal", type: "customer", payload: { businessId: bid, name: "X", phone: "0179" } },
    ],
  },
};
for (const [name, doc] of Object.entries(bodies)) {
  writeFileSync("d:/business-os/audit/bodies/" + name, JSON.stringify(doc));
  console.log("wrote " + name);
}