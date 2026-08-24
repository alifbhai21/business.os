import { test } from "node:test";
import assert from "node:assert/strict";
import { SyncEvent } from "../src/models/SyncEvent";
import { JournalEntry } from "../src/models/JournalEntry";
import { Product } from "../src/models/Product";
import { StockMovement } from "../src/models/StockMovement";
import { Sale } from "../src/models/Sale";
import { Purchase } from "../src/models/Purchase";
import { Payment } from "../src/models/Payment";
import { Expense } from "../src/models/Expense";
import { AuditLog } from "../src/models/AuditLog";
import { BusinessMembership } from "../src/models/BusinessMembership";

/**
 * Phase 14 — database index review (regression guard).
 *
 * Every hot query path in the API depends on these compound indexes. If one
 * is silently removed, the suite still PASSES functionally but production
 * degrades under real data volume. This file pins the critical ones so a
 * removal fails loudly at test time instead of at 5,000 products.
 *
 * Index specs live on the schema, so no database connection is needed.
 */

type ModelLike = { schema: { indexes(): Array<[Record<string, number>, { unique?: boolean }]> } };

function hasIndex(model: ModelLike, keys: Record<string, number | string>, unique = false): boolean {
  const wanted = JSON.stringify(keys);
  return model.schema.indexes().some(([spec, opts]) => {
    if (Object.keys(spec).length !== Object.keys(keys).length) return false;
    const projected = Object.keys(keys).reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = spec[k];
      return acc;
    }, {});
    if (JSON.stringify(projected) !== wanted) return false;
    if (unique && !opts?.unique) return false;
    return true;
  });
}

test("indexes: SyncEvent KPI path {businessId, createdAt:-1} exists", () => {
  assert.ok(hasIndex(SyncEvent, { businessId: 1, createdAt: -1 }));
});

test("indexes: JournalEntry report paths exist", () => {
  assert.ok(hasIndex(JournalEntry, { businessId: 1, createdAt: 1 }));
  assert.ok(hasIndex(JournalEntry, { businessId: 1, shopId: 1, date: 1 }));
});

test("indexes: Product catalog paths exist", () => {
  assert.ok(hasIndex(Product, { businessId: 1, name: 1 }));
  assert.ok(hasIndex(Product, { businessId: 1, barcode: 1 }, true));
  assert.ok(hasIndex(Product, { businessId: 1, sku: 1 }));
});

test("indexes: StockMovement ledger paths exist", () => {
  assert.ok(hasIndex(StockMovement, { businessId: 1, productId: 1, createdAt: -1 }));
  assert.ok(hasIndex(StockMovement, { businessId: 1, shopId: 1, createdAt: -1 }));
});

test("indexes: financial document paths exist", () => {
  assert.ok(hasIndex(Sale, { businessId: 1, shopId: 1, saleDate: -1 }));
  assert.ok(hasIndex(Purchase, { businessId: 1, shopId: 1, purchaseDate: -1 }));
  assert.ok(hasIndex(Payment, { businessId: 1, idempotencyKey: 1 }, true));
  assert.ok(hasIndex(Expense, { businessId: 1, shopId: 1, expenseDate: -1 }));
});

test("indexes: audit + membership lookup paths exist", () => {
  assert.ok(hasIndex(AuditLog, { businessId: 1, createdAt: -1 }));
  assert.ok(hasIndex(BusinessMembership, { userId: 1, businessId: 1 }));
});
