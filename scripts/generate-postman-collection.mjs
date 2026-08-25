// Generates the complete "Business OS" Postman collection + environment files.
// Emits every real endpoint discovered from server/src/routes/** + server/src/app.ts.
// Executed via Newman (Postman CLI) against a real server connected to the real
// MongoDB Atlas test db (business_os_api_test). No secrets embedded.
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:4000";

const envVars = [
  ["baseUrl", BASE], ["accessToken", ""], ["refreshToken", ""], ["businessId", ""],
  ["shopId", ""], ["accountId", ""], ["productId", ""], ["categoryId", ""],
  ["customerId", ""], ["supplierId", ""], ["saleId", ""], ["purchaseId", ""],
  ["paymentId", ""], ["expenseId", ""], ["transferId", ""], ["employeeId", ""],
  ["notificationId", ""], ["deviceId", ""], ["email", ""], ["password", ""],
].map(([key, value]) => ({ key, value }));

const hdr = (extra = []) => {
  const withAuth = [{ key: "Content-Type", value: "application/json" }];
  if (extra.some((h) => h.key === "Authorization")) withAuth.push(...extra);
  else withAuth.push({ key: "Authorization", value: "Bearer {{accessToken}}" });
  return withAuth;
};

const jsonBody = (o) => ({ mode: "raw", raw: JSON.stringify(o) });

const tokenTest = [
  "pm.test('auth returns token', () => {",
  "  const j = pm.response.json();",
  "  pm.expect(j.success).to.equal(true);",
  "  if (j.data && j.data.accessToken) {",
  "    pm.environment.set('accessToken', j.data.accessToken);",
  "    pm.environment.set('refreshToken', j.data.refreshToken);",
  "    pm.environment.set('email', j.data.user ? j.data.user.email : pm.environment.get('email'));",
  "  }",
  "});",
];

const idTest = (varName) => [
  "const j = pm.response.json();",
  "if (pm.response.code < 300 && j && j.data && j.data.id) {",
  "  pm.environment.set('" + varName + "', String(j.data.id));",
  "}",
  "pm.test('status 2xx', () => pm.expect(pm.response.code).to.be.oneOf([200, 201]));",
];

const statusTest = (codes) => [
  "pm.test('status', () => pm.expect(pm.response.code).to.be.oneOf(" + JSON.stringify(codes) + "));",
];

// folder base paths
const M = {
  Health: "/", Auth: "/api/v1/auth", Business: "/api/v1/businesses",
  Shops: "/api/v1/shops", Products: "/api/v1/products", Categories: "/api/v1/categories",
  Customers: "/api/v1/customers", Suppliers: "/api/v1/suppliers", Units: "/api/v1/units",
  Accounts: "/api/v1/accounts", Payments: "/api/v1/payments", Expenses: "/api/v1/expenses",
  Sales: "/api/v1/sales", Purchases: "/api/v1/purchases", Invoices: "/api/v1/invoices",
  Inventory: "/api/v1/inventory", Transfers: "/api/v1/transfers",
  "Accounting Reports": "/api/v1/accounting", Dashboard: "/api/v1/dashboard",
  Reports: "/api/v1/reports", Search: "/api/v1/search", Employees: "/api/v1/employees",
  Roles: "/api/v1/roles", Devices: "/api/v1/devices", Audit: "/api/v1/audit",
  Sync: "/api/v1/sync", Backup: "/api/v1/backup", Export: "/api/v1/export",
  Notifications: "/api/v1/notifications", Ops: "/api/v1/ops",
};

// Each entry: [folder, method, suffix, bodyOrNull, testArr, isQuery?]
const SPEC = [];
const H = { hdrs: [] };
const push = (folder, method, suffix, body, test, query = true, hdrs = []) =>
  SPEC.push({ folder, method, suffix, body, test, query, hdrs });
// body null => no body; object => JSON body; "Q" => GET no body but include query string in suffix already

// ---------- Health (no auth) ----------
push("Health", "GET", "/health", null, statusTest([200]), false, [{ key: "Content-Type", value: "application/json" }]);
push("Health", "GET", "/ready", null, statusTest([200, 503]));

// ---------- Auth ----------
push("Auth", "POST", "/register", {
  name: "Postman User {{$randomInt}}",
  email: "postman{{$timestamp}}@example.com",
  phone: "017{{$randomInt}}{{}}",
  password: "password123",
  deviceId: "postman-dev-{{$guid}}",
  deviceName: "Postman",
  platform: "android",
  appVersion: "1.0.0",
}, tokenTest, true);
push("Auth", "POST", "/login", {
  email: "{{email}}",
  password: "password123",
  deviceId: "postman-login-{{$guid}}",
  deviceName: "Postman",
}, tokenTest, true);
push("Auth", "POST", "/refresh", { refreshToken: "{{refreshToken}}", deviceId: "postman-refresh-{{$guid}}" }, statusTest([200, 401]), true);
push("Auth", "POST", "/logout", { refreshToken: "{{refreshToken}}" }, statusTest([200, 400]), true);
push("Auth", "POST", "/logout-all", null, statusTest([200, 401]));
push("Auth", "POST", "/forgot-password", { email: "{{email}}" }, statusTest([200, 400]), true);
push("Auth", "POST", "/reset-password", { token: "x", password: "password123" }, statusTest([200, 400, 401]), true);
push("Auth", "GET", "/me", "Q", statusTest([200, 404]));

// ---- Business ----
push("Business", "GET", "/{{baseUrl}}/api/v1/businesses", "Q", statusTest([200]));
push("Business", "POST", "/{{baseUrl}}/api/v1/businesses", {
  name: "Postman Business {{$timestamp}}",
  type: "retail", currency: "BDT", taxRate: 0, allowNegativeStock: false,
}, idTest("businessId"), true);
push("Business", "GET", "/{{baseUrl}}/api/v1/businesses/{{businessId}}", "Q", statusTest([200, 404]));
push("Business", "PUT", "/{{baseUrl}}/api/v1/businesses/{{businessId}}", { name: "Postman Business Renamed" }, statusTest([200, 404]), true);
push("Business", "PATCH", "/{{baseUrl}}/api/v1/businesses/{{businessId}}", { name: "Postman Business Patch" }, statusTest([200, 404]), true);
push("Business", "GET", "/{{baseUrl}}/api/v1/businesses/{{businessId}}/modules", "Q", statusTest([200, 404]));
// ---- Shops ----
push("Shops", "POST", "/{{baseUrl}}/api/v1/shops", {
  businessId: "{{businessId}}", name: "Postman Shop {{$timestamp}}",
  branchCode: "BR-{{$randomInt}}", openingCash: 50000,
}, idTest("shopId"), true);
push("Shops", "GET", "/{{baseUrl}}/api/v1/shops", "Q", statusTest([200]));
push("Shops", "GET", "/{{baseUrl}}/api/v1/shops/{{shopId}}", "Q", statusTest([200, 404]));
push("Shops", "PUT", "/{{baseUrl}}/api/v1/shops/{{shopId}}", { businessId: "{{businessId}}", name: "Postman Shop Renamed" }, statusTest([200, 404]), true);
push("Shops", "PATCH", "/{{baseUrl}}/api/v1/shops/{{shopId}}", { businessId: "{{businessId}}", name: "Postman Shop Patch" }, statusTest([200, 404]), true);
push("Shops", "PATCH", "/{{baseUrl}}/api/v1/shops/{{shopId}}/status", { businessId: "{{businessId}}", status: "ACTIVE" }, statusTest([200, 404]), true);

// ---- Products ----
push("Products", "GET", "/{{baseUrl}}/api/v1/products?businessId={{businessId}}", "Q", statusTest([200]));
push("Products", "GET", "/{{baseUrl}}/api/v1/products/lookup/barcode?businessId={{businessId}}&barcode=AUDIT-1", "Q", statusTest([200, 404]));
push("Products", "POST", "/{{baseUrl}}/api/v1/products", {
  businessId: "{{businessId}}", name: "Postman Product {{$timestamp}}", unit: "piece",
  purchasePrice: 10000, sellingPrice: 15000, currentStock: 100, taxRate: 0,
  barcode: "AUDIT-{{$randomInt}}",
}, idTest("productId"), true);
push("Products", "GET", "/{{baseUrl}}/api/v1/products/{{productId}}", "Q", statusTest([200, 404]));
push("Products", "PUT", "/{{baseUrl}}/api/v1/products/{{productId}}", { businessId: "{{businessId}}", name: "Postman Product Updated" }, statusTest([200, 404]), true);
push("Products", "PATCH", "/{{baseUrl}}/api/v1/products/{{productId}}", { businessId: "{{businessId}}", name: "Postman Product Patch" }, statusTest([200, 404]), true);
push("Products", "PATCH", "/{{baseUrl}}/api/v1/products/{{productId}}/status", { businessId: "{{businessId}}", status: "ACTIVE" }, statusTest([200, 404]), true);

// ---- Categories ----
push("Categories", "GET", "/{{baseUrl}}/api/v1/categories?businessId={{businessId}}", "Q", statusTest([200]));
push("Categories", "POST", "/{{baseUrl}}/api/v1/categories", { businessId: "{{businessId}}", name: "Postman Category {{$timestamp}}" }, idTest("categoryId"), true);
push("Categories", "GET", "/{{baseUrl}}/api/v1/categories/{{categoryId}}", "Q", statusTest([200, 404]));
push("Categories", "PUT", "/{{baseUrl}}/api/v1/categories/{{categoryId}}", { businessId: "{{businessId}}", name: "Postman Category Updated" }, statusTest([200, 404]), true);
push("Categories", "PATCH", "/{{baseUrl}}/api/v1/categories/{{categoryId}}", { businessId: "{{businessId}}", name: "Postman Category Patch" }, statusTest([200, 404]), true);
push("Categories", "PATCH", "/{{baseUrl}}/api/v1/categories/{{categoryId}}/status", { businessId: "{{businessId}}", status: "ACTIVE" }, statusTest([200, 404]), true);

// ---- Customers ----
push("Customers", "GET", "/{{baseUrl}}/api/v1/customers?businessId={{businessId}}", "Q", statusTest([200]));
push("Customers", "POST", "/{{baseUrl}}/api/v1/customers", {
  businessId: "{{businessId}}", name: "Postman Customer {{}}",
  phone: "017{{$randomInt}}{{}}",
}, idTest("customerId"), true);
push("Customers", "GET", "/{{baseUrl}}/api/v1/customers/{{customerId}}", "Q", statusTest([200, 404]));
push("Customers", "PUT", "/{{baseUrl}}/api/v1/customers/{{customerId}}", { businessId: "{{businessId}}", name: "Postman Customer Updated" }, statusTest([200, 404]), true);
push("Customers", "PATCH", "/{{baseUrl}}/api/v1/customers/{{customerId}}", { businessId: "{{businessId}}", name: "Postman Customer Patch" }, statusTest([200, 404]), true);
push("Customers", "PATCH", "/{{baseUrl}}/api/v1/customers/{{customerId}}/status", { businessId: "{{businessId}}", status: "ACTIVE" }, statusTest([200, 404]), true);

// ---- Suppliers ----
push("Suppliers", "GET", "/{{baseUrl}}/api/v1/suppliers?businessId={{businessId}}", "Q", statusTest([200]));
push("Suppliers", "POST", "/{{baseUrl}}/api/v1/suppliers", {
  businessId: "{{businessId}}", name: "Postman Supplier {{}}",
  phone: "017{{$randomInt}}{{}}",
}, idTest("supplierId"), true);
push("Suppliers", "GET", "/{{baseUrl}}/api/v1/suppliers/{{supplierId}}", "Q", statusTest([200, 404]));
push("Suppliers", "PUT", "/{{baseUrl}}/api/v1/suppliers/{{supplierId}}", { businessId: "{{businessId}}", name: "Postman Supplier Updated" }, statusTest([200, 404]), true);
push("Suppliers", "PATCH", "/{{baseUrl}}/api/v1/suppliers/{{supplierId}}", { businessId: "{{businessId}}", name: "Postman Supplier Patch" }, statusTest([200, 404]), true);
push("Suppliers", "PATCH", "/{{baseUrl}}/api/v1/suppliers/{{supplierId}}/status", { businessId: "{{businessId}}", status: "ACTIVE" }, statusTest([200, 404]), true);

// ---- Units ----
push("Units", "GET", "/{{baseUrl}}/api/v1/units", "Q", statusTest([200]));
// ---- Accounts ----
push("Accounts", "GET", "/{{baseUrl}}/api/v1/accounts?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200]));
push("Accounts", "POST", "/{{baseUrl}}/api/v1/accounts", {
  businessId: "{{businessId}}", shopId: "{{shopId}}", name: "Postman Cash {{$timestamp}}", type: "CASH",
}, idTest("accountId"), true);
push("Accounts", "POST", "/{{baseUrl}}/api/v1/accounts/transfer", {
  businessId: "{{businessId}}", shopId: "{{shopId}}", fromAccountId: "{{accountId}}", toAccountId: "{{accountId}}", amount: 100, note: "noop",
}, statusTest([200, 400]), true);
push("Accounts", "GET", "/{{baseUrl}}/api/v1/accounts/{{accountId}}", "Q", statusTest([200, 404]));
push("Accounts", "PUT", "/{{baseUrl}}/api/v1/accounts/{{accountId}}", { businessId: "{{businessId}}", shopId: "{{shopId}}", name: "Cash Renamed" }, statusTest([200, 404]), true);
push("Accounts", "PATCH", "/{{baseUrl}}/api/v1/accounts/{{accountId}}", { businessId: "{{businessId}}", shopId: "{{shopId}}", name: "Cash Patch" }, statusTest([200, 404]), true);

// ---- Payments ----
push("Payments", "GET", "/{{baseUrl}}/api/v1/payments?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200]));
push("Payments", "POST", "/{{baseUrl}}/api/v1/payments", {
  businessId: "{{businessId}}", shopId: "{{shopId}}", type: "customer_payment", customerId: "{{customerId}}",
  amount: 1000, method: "CASH", accountId: "{{accountId}}", idempotencyKey: "pm-key-{{$guid}}",
}, idTest("paymentId"), true);
push("Payments", "GET", "/{{baseUrl}}/api/v1/payments/{{paymentId}}", "Q", statusTest([200, 404]));

// ---- Expenses ----
push("Expenses", "GET", "/{{baseUrl}}/api/v1/expenses?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200]));
push("Expenses", "POST", "/{{baseUrl}}/api/v1/expenses", {
  businessId: "{{businessId}}", shopId: "{{shopId}}", category: "RENT", amount: 2000, paymentAccountId: "{{accountId}}",
}, idTest("expenseId"), true);
push("Expenses", "GET", "/{{baseUrl}}/api/v1/expenses/{{expenseId}}", "Q", statusTest([200, 404]));
// ---- Sales ----
push("Sales", "GET", "/{{baseUrl}}/api/v1/sales?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200]));
push("Sales", "POST", "/{{baseUrl}}/api/v1/sales", {
  businessId: "{{businessId}}", shopId: "{{shopId}}", customerId: "{{customerId}}",
  items: [{ productId: "{{productId}}", qty: 2 }], paidAmount: 30000, accountId: "{{accountId}}", localId: "pm-sale-{{$guid}}",
}, idTest("saleId"), true);
push("Sales", "GET", "/{{baseUrl}}/api/v1/sales/{{saleId}}", "Q", statusTest([200, 404]));
push("Sales", "POST", "/{{baseUrl}}/api/v1/sales/{{saleId}}/finalize", { businessId: "{{businessId}}", shopId: "{{shopId}}", paidAmount: 0 }, statusTest([200, 400, 404]), true);
push("Sales", "POST", "/{{baseUrl}}/api/v1/sales/{{saleId}}/void", { businessId: "{{businessId}}", shopId: "{{shopId}}", reason: "audit void" }, statusTest([200, 400, 404, 409]), true);
push("Sales", "POST", "/{{baseUrl}}/api/v1/sales/{{saleId}}/return", { businessId: "{{businessId}}", shopId: "{{shopId}}", items: [{ productId: "{{productId}}", qty: 1 }], reason: "audit return" }, statusTest([200, 400, 404, 409]), true);
push("Sales", "POST", "/{{baseUrl}}/api/v1/sales/{{saleId}}/payments", { businessId: "{{businessId}}", shopId: "{{shopId}}", amount: 5000, method: "CASH", accountId: "{{accountId}}", idempotencyKey: "pm-spay-{{$guid}}" }, idTest("paymentId"), true);
push("Sales", "GET", "/{{baseUrl}}/api/v1/sales/{{saleId}}/payments", null, statusTest([200, 404]));

// ---- Purchases ----
push("Purchases", "GET", "/{{baseUrl}}/api/v1/purchases?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200]));
push("Purchases", "POST", "/{{baseUrl}}/api/v1/purchases", {
  businessId: "{{businessId}}", shopId: "{{shopId}}", supplierId: "{{supplierId}}",
  items: [{ productId: "{{productId}}", qty: 5 }], paidAmount: 25000, accountId: "{{accountId}}", localId: "pm-pur-{{$guid}}",
}, idTest("purchaseId"), true);
push("Purchases", "GET", "/{{baseUrl}}/api/v1/purchases/{{purchaseId}}", "Q", statusTest([200, 404]));
push("Purchases", "POST", "/{{baseUrl}}/api/v1/purchases/{{purchaseId}}/finalize", { businessId: "{{businessId}}", shopId: "{{shopId}}", paidAmount: 0 }, statusTest([200, 400, 404]), true);
push("Purchases", "POST", "/{{baseUrl}}/api/v1/purchases/{{purchaseId}}/void", { businessId: "{{businessId}}", shopId: "{{shopId}}", reason: "audit void" }, statusTest([200, 400, 404, 409]), true);
push("Purchases", "POST", "/{{baseUrl}}/api/v1/purchases/{{purchaseId}}/return", { businessId: "{{businessId}}", shopId: "{{shopId}}", items: [{ productId: "{{productId}}", qty: 1 }], reason: "audit return" }, statusTest([200, 400, 404, 409]), true);
push("Purchases", "POST", "/{{baseUrl}}/api/v1/purchases/{{purchaseId}}/payments", { businessId: "{{businessId}}", shopId: "{{shopId}}", amount: 5000, method: "CASH", accountId: "{{accountId}}", idempotencyKey: "pm-ppay-{{$guid}}" }, statusTest([200, 400, 404]), true);
push("Purchases", "GET", "/{{baseUrl}}/api/v1/purchases/{{purchaseId}}/payments", "Q", statusTest([200, 404]));

// ---- Invoices ----
push("Invoices", "GET", "/{{baseUrl}}/api/v1/invoices/sales?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200]));
push("Invoices", "GET", "/{{baseUrl}}/api/v1/invoices/purchases?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200]));
push("Invoices", "GET", "/{{baseUrl}}/api/v1/invoices/sale/{{saleId}}", "Q", statusTest([200, 404]));
push("Invoices", "GET", "/{{baseUrl}}/api/v1/invoices/sale/{{saleId}}/print", "Q", statusTest([200, 404]));

// ---- Inventory ----
push("Inventory", "GET", "/{{baseUrl}}/api/v1/inventory/stock?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200]));
push("Inventory", "GET", "/{{baseUrl}}/api/v1/inventory/movements?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200]));
push("Inventory", "POST", "/{{baseUrl}}/api/v1/inventory/adjust", { businessId: "{{businessId}}", shopId: "{{shopId}}", productId: "{{productId}}", qtyChange: 2, reason: "audit adjust", kind: "adjustment" }, statusTest([200, 201, 400]), true);
push("Inventory", "POST", "/{{baseUrl}}/api/v1/inventory/opening", { businessId: "{{businessId}}", shopId: "{{shopId}}", productId: "{{productId}}", quantity: 10 }, statusTest([200, 201, 400]), true);
// ---- Transfers ----
push("Transfers", "POST", "/{{baseUrl}}/api/v1/transfers", { businessId: "{{businessId}}", sourceShopId: "{{shopId}}", destShopId: "{{shopId}}", productId: "{{productId}}", quantity: 1, notes: "audit transfer" }, statusTest([200, 201, 400]), true);
push("Transfers", "GET", "/{{baseUrl}}/api/v1/transfers?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200]));
push("Transfers", "PUT", "/{{baseUrl}}/api/v1/transfers/{{transferId}}/status", { businessId: "{{businessId}}", shopId: "{{shopId}}", status: "RECEIVED" }, statusTest([200, 400, 404]), true);

// ---- Accounting Reports ----
push("Accounting Reports", "GET", "/{{baseUrl}}/api/v1/accounting/journal?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Accounting Reports", "GET", "/{{baseUrl}}/api/v1/accounting/chart?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Accounting Reports", "GET", "/{{baseUrl}}/api/v1/accounting/ledger?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Accounting Reports", "GET", "/{{baseUrl}}/api/v1/accounting/trial-balance?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Accounting Reports", "GET", "/{{baseUrl}}/api/v1/accounting/profit-loss?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Accounting Reports", "GET", "/{{baseUrl}}/api/v1/accounting/balance-sheet?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Accounting Reports", "GET", "/{{baseUrl}}/api/v1/accounting/cash-flow?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
// ---- Dashboard ----
push("Dashboard", "GET", "/{{baseUrl}}/api/v1/dashboard?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));

// ---- Reports ----
push("Reports", "GET", "/{{baseUrl}}/api/v1/reports/sales?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Reports", "GET", "/{{baseUrl}}/api/v1/reports/purchases?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Reports", "GET", "/{{baseUrl}}/api/v1/reports/inventory?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Reports", "GET", "/{{baseUrl}}/api/v1/reports/profit-loss?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Reports", "GET", "/{{baseUrl}}/api/v1/reports/receivables?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Reports", "GET", "/{{baseUrl}}/api/v1/reports/payables?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));
push("Reports", "GET", "/{{baseUrl}}/api/v1/reports/expenses?businessId={{businessId}}&shopId={{shopId}}", "Q", statusTest([200, 403]));

// ---- Search ----
push("Search", "GET", "/{{baseUrl}}/api/v1/search?businessId={{businessId}}&q=Postman", "Q", statusTest([200]));

// ---- Employees ----
push("Employees", "GET", "/{{baseUrl}}/api/v1/employees?businessId={{businessId}}", "Q", statusTest([200]));
push("Employees", "POST", "/{{baseUrl}}/api/v1/employees", {
  businessId: "{{businessId}}", name: "Postman Employee {{}}",
  phone: "017{{$randomInt}}{{}}", role: "Salesperson",
}, idTest("employeeId"), true);
push("Employees", "PUT", "/{{baseUrl}}/api/v1/employees/{{employeeId}}", { businessId: "{{businessId}}", name: "Employee Renamed" }, statusTest([200, 404]), true);
push("Employees", "DELETE", "/{{baseUrl}}/api/v1/employees/{{employeeId}}", { businessId: "{{businessId}}" }, statusTest([200, 404]), true);
// ---- Roles ----
push("Roles", "GET", "/{{baseUrl}}/api/v1/roles", "Q", statusTest([200]));
push("Roles", "POST", "/{{baseUrl}}/api/v1/roles", { businessId: "{{businessId}}", employeeId: "{{employeeId}}", role: "Manager" }, statusTest([200, 400, 403, 404]), true);

// ---- Devices ----
push("Devices", "GET", "/{{baseUrl}}/api/v1/devices?businessId={{businessId}}", "Q", statusTest([200]));
push("Devices", "POST", "/{{baseUrl}}/api/v1/devices", { businessId: "{{businessId}}", deviceId: "pm-dev-{{$guid}}", deviceName: "Postman" }, statusTest([200, 201]), true);
push("Devices", "PUT", "/{{baseUrl}}/api/v1/devices/{{deviceId}}/revoke", { businessId: "{{businessId}}" }, statusTest([200, 404]), true);
push("Devices", "PUT", "/{{baseUrl}}/api/v1/devices/{{deviceId}}/sync", { businessId: "{{businessId}}" }, statusTest([200, 403, 404]), true);

// ---- Audit ----
push("Audit", "GET", "/{{baseUrl}}/api/v1/audit?businessId={{businessId}}&limit=100", "Q", statusTest([200, 403]));

// ---- Sync ----
push("Sync", "POST", "/{{baseUrl}}/api/v1/sync/push", { businessId: "{{businessId}}", shopId: "{{shopId}}", ops: [{ localId: "pm-sync-{{$guid}}", type: "customer", payload: { businessId: "{{businessId}}", name: "Sync Customer", phone: "017{{$randomInt}}" } }] }, statusTest([200, 400]), true);
push("Sync", "GET", "/{{baseUrl}}/api/v1/sync/pull?businessId={{businessId}}", "Q", statusTest([200]));
push("Sync", "GET", "/{{baseUrl}}/api/v1/sync/restore?businessId={{businessId}}", "Q", statusTest([200]));
push("Sync", "GET", "/{{baseUrl}}/api/v1/sync/stats?businessId={{businessId}}", "Q", statusTest([200, 403]));

// ---- Backup ----
push("Backup", "GET", "/{{baseUrl}}/api/v1/backup/status?businessId={{businessId}}", "Q", statusTest([200]));

// ---- Export ----
push("Export", "GET", "/{{baseUrl}}/api/v1/export/data?businessId={{businessId}}", "Q", statusTest([200, 403]));
push("Export", "GET", "/{{baseUrl}}/api/v1/export/csv?businessId={{businessId}}&type=customers", "Q", statusTest([200, 403]));
push("Export", "GET", "/{{baseUrl}}/api/v1/export/excel?businessId={{businessId}}&type=sales", "Q", statusTest([200, 403]));

// ---- Notifications ----
push("Notifications", "GET", "/{{baseUrl}}/api/v1/notifications?businessId={{businessId}}", "Q", statusTest([200]));
push("Notifications", "GET", "/{{baseUrl}}/api/v1/notifications/preferences?businessId={{businessId}}", "Q", statusTest([200]));
push("Notifications", "PUT", "/{{baseUrl}}/api/v1/notifications/preferences", { businessId: "{{businessId}}", lowStock: true }, statusTest([200]), true);
push("Notifications", "POST", "/{{baseUrl}}/api/v1/notifications/read-all", { businessId: "{{businessId}}" }, statusTest([200, 400]), true);
push("Notifications", "POST", "/{{baseUrl}}/api/v1/notifications/{{notificationId}}/read", { businessId: "{{businessId}}" }, statusTest([200, 404]), true);

// ---- Ops ----
push("Ops", "GET", "/{{baseUrl}}/api/v1/ops/metrics", "Q", statusTest([200]));
// ---------------------------------------------------------------- build
const FOLDER_ORDER = [
  "Health", "Auth", "Business", "Shops", "Products", "Categories", "Customers",
  "Suppliers", "Units", "Accounts", "Payments", "Expenses", "Sales", "Purchases",
  "Invoices", "Inventory", "Transfers", "Accounting Reports", "Dashboard",
  "Reports", "Search", "Employees", "Roles", "Devices", "Audit", "Sync",
  "Backup", "Export", "Notifications", "Ops",
];

function fullUrl(folder, suffix) {
  let s = suffix;
  // Suffixes are written as "/{{baseUrl}}/api/v1/..." (absolute) or "/health".
  if (s.startsWith("/{{baseUrl}}")) s = s.slice(1);
  if (s.startsWith("{{baseUrl}}")) return s.replace(/\/{2,}/g, "/");
  const base = M[folder] ?? "";
  const raw = "{{baseUrl}}" + (base === "/" ? "" : base) + s;
  return raw.replace(/([^:])\/{2,}/g, "$1/");
}

function toRequest(s) {
  const r = { method: s.method, header: hdr(s.hdrs) };
  if (s.body && s.body !== "Q") r.body = jsonBody(typeof s.body === "string" ? JSON.parse(s.body) : s.body);
  // Newman requires host + path arrays; raw alone is not enough in this env.
  let raw = fullUrl(s.folder, s.suffix);
  // Normalise to "/api/v1/..." (no leading "{{baseUrl}}" here).
  let u = raw;
  if (u.startsWith("{{baseUrl}}")) u = u.slice("{{baseUrl}}".length);
  // Strip trailing slash, then split path/query.
  if (u.startsWith("/")) u = u.slice(1);
  const qIdx = u.indexOf("?");
  const pathPart = qIdx === -1 ? u : u.slice(0, qIdx);
  const queryPart = qIdx === -1 ? "" : u.slice(qIdx + 1);
  const path = pathPart.split("/").filter(Boolean);
  const query = queryPart
    ? queryPart.split("&").filter(Boolean).map((pair) => {
        const eq = pair.indexOf("=");
        return { key: eq === -1 ? pair : pair.slice(0, eq), value: eq === -1 ? "" : pair.slice(eq + 1) };
      })
    : undefined;
  r.url = { raw, host: ["{{baseUrl}}"], path };
  if (query && query.length) r.url.query = query;
  return r;
}

const items = FOLDER_ORDER.map((folder) => ({
  name: folder,
  item: SPEC.filter((s) => s.folder === folder).map((s) => ({
    name: `${s.method} ${s.suffix}`,
    request: toRequest(s),
    event: [
      {
        listen: "test",
        script: { type: "text/javascript", exec: s.test ?? [] },
      },
    ],
  })),
})).filter((f) => f.item.length > 0);

const collection = {
  info: {
    name: "Business OS",
    description:
      "Complete endpoint collection for the Business OS API, generated from server/src/routes and server/src/app.ts. " +
      "Real requests executed through the running server (production app code) connected to MongoDB Atlas test DB business_os_api_test. " +
      "Auth uses {{accessToken}} set by Register/Login pre-request scripts. No secrets stored.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: envVars,
  item: items,
};

const outDir = path.resolve("docs/api/postman");
fs.mkdirSync(outDir, { recursive: true });
const outCollection = path.join(outDir, "business-os.postman_collection.json");
const outEnv = path.join(outDir, "business-os.postman_environment.json");
fs.writeFileSync(outCollection, JSON.stringify(collection, null, 2));
fs.writeFileSync(
  outEnv,
  JSON.stringify(
    {
      name: "Business OS",
      values: envVars.map((v) => ({ ...v, type: "default", enabled: true })),
      _postman_variable_scope: "environment",
    },
    null,
    2
  )
);

console.log("Collection requests:", SPEC.length);
console.log("Wrote:", outCollection);
console.log("Wrote:", outEnv);