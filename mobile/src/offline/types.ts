/** Phase 10 — queueable offline operation types (mirrors server SYNC_OP_TYPES). */
export type SyncOpType =
  | "sale"
  | "purchase"
  | "payment"
  | "expense"
  | "customer"
  | "supplier"
  | "product"
  // Phase 12 — offline inventory movements (exactly-once via movement localId).
  | "inventory_adjust"
  | "inventory_opening";
