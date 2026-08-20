import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const businessTypeEnum = pgEnum("business_type", [
  "retail",
  "wholesale",
  "retail_wholesale",
  "service",
  "distribution",
  "manufacturing",
  "restaurant",
  "online",
  "construction",
  "other",
]);

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "admin",
  "manager",
  "accountant",
  "salesperson",
  "inventory_manager",
  "viewer",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "completed",
  "cancelled",
  "returned",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "bank",
  "bkash",
  "nagad",
  "rocket",
  "card",
  "other",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "paid",
  "partial",
  "due",
]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "purchase",
  "sale",
  "sale_return",
  "purchase_return",
  "transfer_in",
  "transfer_out",
  "adjustment",
  "opening",
  "damaged",
]);

export const expenseCategoryEnum = pgEnum("expense_category", [
  "rent",
  "salary",
  "electricity",
  "internet",
  "transport",
  "maintenance",
  "marketing",
  "packaging",
  "office",
  "other",
]);

// ─── Businesses ───────────────────────────────────────────────────────────────

export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: businessTypeEnum("type").notNull().default("retail"),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  currency: varchar("currency", { length: 10 }).notNull().default("BDT"),
  taxRate: integer("tax_rate").notNull().default(0), // stored as percentage * 100
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Shops ────────────────────────────────────────────────────────────────────

export const shops = pgTable(
  "shops",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    branchCode: varchar("branch_code", { length: 50 }),
    address: text("address"),
    phone: varchar("phone", { length: 20 }),
    isActive: boolean("is_active").notNull().default(true),
    openingCash: integer("opening_cash").notNull().default(0), // paisa
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("shops_business_idx").on(t.businessId)]
);

// ─── Categories ───────────────────────────────────────────────────────────────

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("categories_business_idx").on(t.businessId)]
);

// ─── Products ─────────────────────────────────────────────────────────────────

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id),
    name: varchar("name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 100 }),
    barcode: varchar("barcode", { length: 100 }),
    brand: varchar("brand", { length: 100 }),
    unit: varchar("unit", { length: 50 }).notNull().default("piece"),
    purchasePrice: integer("purchase_price").notNull().default(0), // paisa
    sellingPrice: integer("selling_price").notNull().default(0), // paisa
    wholesalePrice: integer("wholesale_price").notNull().default(0), // paisa
    minPrice: integer("min_price").notNull().default(0), // paisa
    taxRate: integer("tax_rate").notNull().default(0), // percentage * 100
    currentStock: integer("current_stock").notNull().default(0),
    minStock: integer("min_stock").notNull().default(0),
    maxStock: integer("max_stock").notNull().default(0),
    avgCost: integer("avg_cost").notNull().default(0), // paisa - for average cost method
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("products_business_idx").on(t.businessId),
    index("products_barcode_idx").on(t.barcode),
    index("products_sku_idx").on(t.sku),
  ]
);

// ─── Customers ────────────────────────────────────────────────────────────────

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 255 }),
    address: text("address"),
    customerCode: varchar("customer_code", { length: 50 }),
    openingBalance: integer("opening_balance").notNull().default(0), // paisa (positive = customer owes us)
    creditLimit: integer("credit_limit").notNull().default(0), // paisa
    totalPurchases: integer("total_purchases").notNull().default(0), // paisa
    totalPaid: integer("total_paid").notNull().default(0), // paisa
    currentDue: integer("current_due").notNull().default(0), // paisa
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("customers_business_idx").on(t.businessId),
    index("customers_phone_idx").on(t.phone),
  ]
);

// ─── Suppliers ────────────────────────────────────────────────────────────────

export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 255 }),
    address: text("address"),
    company: varchar("company", { length: 255 }),
    openingBalance: integer("opening_balance").notNull().default(0), // paisa (positive = we owe supplier)
    totalPurchases: integer("total_purchases").notNull().default(0), // paisa
    totalPaid: integer("total_paid").notNull().default(0), // paisa
    currentPayable: integer("current_payable").notNull().default(0), // paisa
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("suppliers_business_idx").on(t.businessId),
    index("suppliers_phone_idx").on(t.phone),
  ]
);

// ─── Sales ────────────────────────────────────────────────────────────────────

export const sales = pgTable(
  "sales",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shops.id),
    customerId: integer("customer_id").references(() => customers.id),
    invoiceNumber: varchar("invoice_number", { length: 100 }),
    subtotal: integer("subtotal").notNull().default(0), // paisa
    discountAmount: integer("discount_amount").notNull().default(0), // paisa
    taxAmount: integer("tax_amount").notNull().default(0), // paisa
    totalAmount: integer("total_amount").notNull().default(0), // paisa
    paidAmount: integer("paid_amount").notNull().default(0), // paisa
    dueAmount: integer("due_amount").notNull().default(0), // paisa
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("paid"),
    status: transactionStatusEnum("status").notNull().default("completed"),
    notes: text("notes"),
    saleDate: timestamp("sale_date").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("sales_business_idx").on(t.businessId),
    index("sales_shop_idx").on(t.shopId),
    index("sales_customer_idx").on(t.customerId),
    index("sales_date_idx").on(t.saleDate),
  ]
);

// ─── Sale Items ───────────────────────────────────────────────────────────────

export const saleItems = pgTable(
  "sale_items",
  {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(), // paisa
    costPrice: integer("cost_price").notNull().default(0), // paisa (avg cost at time of sale)
    discountAmount: integer("discount_amount").notNull().default(0), // paisa
    taxAmount: integer("tax_amount").notNull().default(0), // paisa
    lineTotal: integer("line_total").notNull(), // paisa
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId)]
);

// ─── Purchases ────────────────────────────────────────────────────────────────

export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shops.id),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    invoiceNumber: varchar("invoice_number", { length: 100 }),
    subtotal: integer("subtotal").notNull().default(0), // paisa
    discountAmount: integer("discount_amount").notNull().default(0), // paisa
    taxAmount: integer("tax_amount").notNull().default(0), // paisa
    totalAmount: integer("total_amount").notNull().default(0), // paisa
    paidAmount: integer("paid_amount").notNull().default(0), // paisa
    dueAmount: integer("due_amount").notNull().default(0), // paisa
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("paid"),
    status: transactionStatusEnum("status").notNull().default("completed"),
    notes: text("notes"),
    purchaseDate: timestamp("purchase_date").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("purchases_business_idx").on(t.businessId),
    index("purchases_shop_idx").on(t.shopId),
    index("purchases_supplier_idx").on(t.supplierId),
    index("purchases_date_idx").on(t.purchaseDate),
  ]
);

// ─── Purchase Items ───────────────────────────────────────────────────────────

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: serial("id").primaryKey(),
    purchaseId: integer("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(), // paisa
    discountAmount: integer("discount_amount").notNull().default(0), // paisa
    taxAmount: integer("tax_amount").notNull().default(0), // paisa
    lineTotal: integer("line_total").notNull(), // paisa
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("purchase_items_purchase_idx").on(t.purchaseId)]
);

// ─── Payments ─────────────────────────────────────────────────────────────────

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shops.id),
    customerId: integer("customer_id").references(() => customers.id),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    type: varchar("type", { length: 20 }).notNull(), // 'customer_payment' | 'supplier_payment'
    amount: integer("amount").notNull(), // paisa
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
    reference: varchar("reference", { length: 255 }),
    notes: text("notes"),
    paymentDate: timestamp("payment_date").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("payments_business_idx").on(t.businessId),
    index("payments_customer_idx").on(t.customerId),
    index("payments_supplier_idx").on(t.supplierId),
    index("payments_date_idx").on(t.paymentDate),
  ]
);

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shops.id),
    category: expenseCategoryEnum("category").notNull().default("other"),
    amount: integer("amount").notNull(), // paisa
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
    description: text("description"),
    expenseDate: timestamp("expense_date").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("expenses_business_idx").on(t.businessId),
    index("expenses_shop_idx").on(t.shopId),
    index("expenses_date_idx").on(t.expenseDate),
  ]
);

// ─── Inventory Movements ──────────────────────────────────────────────────────

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shops.id),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    type: stockMovementTypeEnum("type").notNull(),
    quantity: integer("quantity").notNull(), // positive = in, negative = out
    unitCost: integer("unit_cost").notNull().default(0), // paisa
    referenceId: integer("reference_id"), // sale_id or purchase_id
    referenceType: varchar("reference_type", { length: 50 }), // 'sale' | 'purchase' | 'adjustment' etc.
    notes: text("notes"),
    movementDate: timestamp("movement_date").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("inventory_movements_business_idx").on(t.businessId),
    index("inventory_movements_product_idx").on(t.productId),
    index("inventory_movements_date_idx").on(t.movementDate),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const businessRelations = relations(businesses, ({ many }) => ({
  shops: many(shops),
  categories: many(categories),
  products: many(products),
  customers: many(customers),
  suppliers: many(suppliers),
  sales: many(sales),
  purchases: many(purchases),
  payments: many(payments),
  expenses: many(expenses),
  inventoryMovements: many(inventoryMovements),
}));

export const shopRelations = relations(shops, ({ one, many }) => ({
  business: one(businesses, {
    fields: [shops.businessId],
    references: [businesses.id],
  }),
  sales: many(sales),
  purchases: many(purchases),
  payments: many(payments),
  expenses: many(expenses),
}));

export const productRelations = relations(products, ({ one, many }) => ({
  business: one(businesses, {
    fields: [products.businessId],
    references: [businesses.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  saleItems: many(saleItems),
  purchaseItems: many(purchaseItems),
  inventoryMovements: many(inventoryMovements),
}));

export const customerRelations = relations(customers, ({ one, many }) => ({
  business: one(businesses, {
    fields: [customers.businessId],
    references: [businesses.id],
  }),
  sales: many(sales),
  payments: many(payments),
}));

export const supplierRelations = relations(suppliers, ({ one, many }) => ({
  business: one(businesses, {
    fields: [suppliers.businessId],
    references: [businesses.id],
  }),
  purchases: many(purchases),
  payments: many(payments),
}));

export const saleRelations = relations(sales, ({ one, many }) => ({
  business: one(businesses, {
    fields: [sales.businessId],
    references: [businesses.id],
  }),
  shop: one(shops, { fields: [sales.shopId], references: [shops.id] }),
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  items: many(saleItems),
}));

export const saleItemRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

export const purchaseRelations = relations(purchases, ({ one, many }) => ({
  business: one(businesses, {
    fields: [purchases.businessId],
    references: [businesses.id],
  }),
  shop: one(shops, { fields: [purchases.shopId], references: [shops.id] }),
  supplier: one(suppliers, {
    fields: [purchases.supplierId],
    references: [suppliers.id],
  }),
  items: many(purchaseItems),
}));

export const purchaseItemRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, {
    fields: [purchaseItems.purchaseId],
    references: [purchases.id],
  }),
  product: one(products, {
    fields: [purchaseItems.productId],
    references: [products.id],
  }),
}));

export const paymentRelations = relations(payments, ({ one }) => ({
  business: one(businesses, {
    fields: [payments.businessId],
    references: [businesses.id],
  }),
  shop: one(shops, { fields: [payments.shopId], references: [shops.id] }),
  customer: one(customers, {
    fields: [payments.customerId],
    references: [customers.id],
  }),
  supplier: one(suppliers, {
    fields: [payments.supplierId],
    references: [suppliers.id],
  }),
}));

export const expenseRelations = relations(expenses, ({ one }) => ({
  business: one(businesses, {
    fields: [expenses.businessId],
    references: [businesses.id],
  }),
  shop: one(shops, { fields: [expenses.shopId], references: [shops.id] }),
}));

export const inventoryMovementRelations = relations(
  inventoryMovements,
  ({ one }) => ({
    business: one(businesses, {
      fields: [inventoryMovements.businessId],
      references: [businesses.id],
    }),
    shop: one(shops, {
      fields: [inventoryMovements.shopId],
      references: [shops.id],
    }),
    product: one(products, {
      fields: [inventoryMovements.productId],
      references: [products.id],
    }),
  })
);
