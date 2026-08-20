import { pgTable, text, integer, timestamp, boolean, uuid, varchar } from "drizzle-orm/pg-core";

// --- Multi-tenant Core & Access Control ---

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: varchar("phone", { length: 30 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("Owner"), // Owner, Admin, Manager, Accountant, Salesperson, Inventory Manager, Viewer
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const businesses = pgTable("businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  businessType: text("business_type").notNull().default("Retail"), // Retail, Wholesale, Retail + Wholesale, Service, Distribution, Construction, Manufacturing
  address: text("address"),
  phone: varchar("phone", { length: 30 }),
  currency: varchar("currency", { length: 10 }).default("BDT ৳").notNull(),
  taxRate: integer("tax_rate").default(0).notNull(), // percentage e.g. 0 or 5
  fiscalYear: text("fiscal_year").default("1 July - 30 June").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shops = pgTable("shops", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  branchCode: varchar("branch_code", { length: 20 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 30 }),
  isWarehouse: boolean("is_warehouse").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memberships = pgTable("memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("Owner"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const devices = pgTable("devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  deviceId: text("device_id").notNull(),
  userPhone: text("user_phone").notNull(),
  appVersion: text("app_version").default("1.0.0").notNull(),
  lastSyncAt: timestamp("last_sync_at").defaultNow().notNull(),
  status: text("status").default("active").notNull(), // active, revoked
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Catalog & Inventory ---

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  sku: varchar("sku", { length: 50 }).notNull(),
  barcode: varchar("barcode", { length: 50 }),
  unit: text("unit").default("Piece").notNull(), // Piece, Kg, Gram, Box, Liter, Meter, Feet, Dozen
  purchasePricePaisa: integer("purchase_price_paisa").notNull().default(0), // in Paisa (৳ x 100)
  sellingPricePaisa: integer("selling_price_paisa").notNull().default(0),
  wholesalePricePaisa: integer("wholesale_price_paisa").notNull().default(0),
  minStock: integer("min_stock").default(5).notNull(),
  currentStock: integer("current_stock").default(0).notNull(),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Customers & Suppliers ---

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  address: text("address"),
  openingBalancePaisa: integer("opening_balance_paisa").default(0).notNull(),
  currentDuePaisa: integer("current_due_paisa").default(0).notNull(), // positive = customer owes business
  creditLimitPaisa: integer("credit_limit_paisa").default(5000000).notNull(), // default ৳50,000
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  company: text("company"),
  address: text("address"),
  openingBalancePaisa: integer("opening_balance_paisa").default(0).notNull(),
  currentPayablePaisa: integer("current_payable_paisa").default(0).notNull(), // positive = business owes supplier
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Sales, Purchases & Line Items ---

export const sales = pgTable("sales", {
  id: uuid("id").defaultRandom().primaryKey(),
  localId: text("local_id"), // client generated UUID for offline sync
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }).notNull(),
  invoiceNo: varchar("invoice_no", { length: 50 }).notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  totalPaisa: integer("total_paisa").notNull(),
  discountPaisa: integer("discount_paisa").default(0).notNull(),
  taxPaisa: integer("tax_paisa").default(0).notNull(),
  paidPaisa: integer("paid_paisa").notNull(),
  duePaisa: integer("due_paisa").default(0).notNull(),
  paymentMethod: text("payment_method").default("Cash").notNull(), // Cash, Bank, bKash, Nagad, Rocket, Card, Multiple
  paymentAccount: text("payment_account").default("Cash Account"),
  notes: text("notes"),
  status: text("status").default("completed").notNull(), // completed, voided
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const saleItems = pgTable("sale_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  saleId: uuid("sale_id").references(() => sales.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPricePaisa: integer("unit_price_paisa").notNull(),
  totalPaisa: integer("total_paisa").notNull(),
});

export const purchases = pgTable("purchases", {
  id: uuid("id").defaultRandom().primaryKey(),
  localId: text("local_id"),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }).notNull(),
  invoiceNo: varchar("invoice_no", { length: 50 }).notNull(),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  supplierName: text("supplier_name"),
  totalPaisa: integer("total_paisa").notNull(),
  discountPaisa: integer("discount_paisa").default(0).notNull(),
  paidPaisa: integer("paid_paisa").notNull(),
  duePaisa: integer("due_paisa").default(0).notNull(),
  paymentMethod: text("payment_method").default("Cash").notNull(),
  paymentAccount: text("payment_account").default("Cash Account"),
  notes: text("notes"),
  status: text("status").default("completed").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const purchaseItems = pgTable("purchase_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPricePaisa: integer("unit_price_paisa").notNull(),
  totalPaisa: integer("total_paisa").notNull(),
});

// --- Payments & Expenses ---

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  localId: text("local_id"),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(), // customer_payment, supplier_payment
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  saleId: uuid("sale_id").references(() => sales.id, { onDelete: "set null" }),
  purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
  amountPaisa: integer("amount_paisa").notNull(),
  method: text("method").default("Cash").notNull(), // Cash, Bank, bKash, Nagad, Rocket
  account: text("account").default("Main Cash"),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  localId: text("local_id"),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }).notNull(),
  category: text("category").notNull(), // Rent, Salary, Electricity, Internet, Transport, Maintenance, Marketing, Packaging, Office, Other
  amountPaisa: integer("amount_paisa").notNull(),
  paymentAccount: text("payment_account").default("Main Cash").notNull(),
  note: text("note"),
  receiptUrl: text("receipt_url"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Accounts, Inventory Movements & Transfers ---

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g. "Main Shop Cash", "bKash Merchant 01711...", "Dutch Bangla Bank"
  type: text("type").notNull(), // cash, bank, bkash, nagad, rocket
  accountNumber: varchar("account_number", { length: 50 }),
  currentBalancePaisa: integer("current_balance_paisa").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(), // sale, purchase, sale_return, purchase_return, transfer_in, transfer_out, adjustment, damage
  quantityChange: integer("quantity_change").notNull(), // positive or negative
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  referenceId: text("reference_id"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stockTransfers = pgTable("stock_transfers", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  sourceShopId: uuid("source_shop_id").references(() => shops.id, { onDelete: "cascade" }).notNull(),
  destShopId: uuid("dest_shop_id").references(() => shops.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").default("pending").notNull(), // pending, in_transit, received, cancelled
  notes: text("notes"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Double Entry Accounting Engine ---

export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  description: text("description").notNull(),
  referenceType: text("reference_type"), // sale, purchase, payment, expense, transfer
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const journalLines = pgTable("journal_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, { onDelete: "cascade" }).notNull(),
  accountName: text("account_name").notNull(), // Sales Revenue, Cash, Customer Receivable, Supplier Payable, Expense, Inventory
  accountType: text("account_type").notNull(), // asset, liability, equity, revenue, expense
  debitPaisa: integer("debit_paisa").default(0).notNull(),
  creditPaisa: integer("credit_paisa").default(0).notNull(),
});

// --- Audit & Sync Metadata ---

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // e.g. SALE_CREATE, PAYMENT_RECORDED, STOCK_TRANSFER
  userPhone: text("user_phone").notNull(),
  details: text("details"),
  branch: text("branch"),
  recordId: text("record_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const syncEvents = pgTable("sync_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  deviceId: text("device_id").notNull(),
  action: text("action").notNull(), // push, pull
  recordsProcessed: integer("records_processed").default(0).notNull(),
  status: text("status").default("success").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
