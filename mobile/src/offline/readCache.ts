import { getDb } from "./db";

/**
 * Phase 10 — read-only fallback views over the pulled master-data cache.
 * Used by list screens when the network is down; every value comes from the
 * last successful /sync/pull, never computed client-side.
 */

export interface CachedProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  taxRate: number;
  currentStock: number;
  minStock: number;
  status: string;
}

export async function loadCachedProducts(businessId: string): Promise<CachedProduct[]> {
  const db = await getDb();
  return db.getAllAsync<CachedProduct>(
    `SELECT server_id AS id, name, sku, barcode, unit,
            purchase_price AS purchasePrice, selling_price AS sellingPrice,
            tax_rate AS taxRate, current_stock AS currentStock,
            min_stock AS minStock, status
     FROM local_products WHERE business_id = ? ORDER BY name ASC LIMIT 200`,
    [businessId]
  );
}

export interface CachedParty {
  id: string;
  name: string;
  phone: string | null;
  currentDue?: number;
  currentPayable?: number;
  status: string;
}

export async function loadCachedCustomers(businessId: string): Promise<CachedParty[]> {
  const db = await getDb();
  return db.getAllAsync<CachedParty>(
    `SELECT server_id AS id, name, phone, current_due AS currentDue, status
     FROM local_customers WHERE business_id = ? ORDER BY name ASC LIMIT 200`,
    [businessId]
  );
}

export async function loadCachedSuppliers(businessId: string): Promise<CachedParty[]> {
  const db = await getDb();
  return db.getAllAsync<CachedParty>(
    `SELECT server_id AS id, name, phone, current_payable AS currentPayable, status
     FROM local_suppliers WHERE business_id = ? ORDER BY name ASC LIMIT 200`,
    [businessId]
  );
}
