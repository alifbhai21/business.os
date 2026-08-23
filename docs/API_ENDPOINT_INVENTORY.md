# API ENDPOINT INVENTORY

> **Source of truth:** `server/src/routes/**` (all route modules actually mounted in `server/src/app.ts`).
> **Base URL:** `http://localhost:4000`
> **Auth:** `Authorization: Bearer <accessToken>` (`requireAuth` → verifies JWT, loads ACTIVE user).
> **Business (tenant):** `resolveBusiness` — active membership gate; wrong/unknown business ⇒ `404`.
> **Shop:** `assertShopAccess` — shop must exist AND belong to resolved business; foreign ⇒ `404`.
>
> Collected as part of the REAL MongoDB Atlas API integration audit.

---

## 1. Auth — `/api/v1/auth`

| # | Method | Path | Auth | Roles | Body / Notes | Success | Errors |
|---|--------|------|------|-------|--------------|---------|--------|
| 1 | POST | /register | – | – | `{ name, email, phone, password, deviceId, deviceName?, platform?, appVersion? }` | 201 | 400, 409 |
| 2 | POST | /login | – | – | `{ email, password, deviceId, deviceName?, platform?, appVersion? }` | 200 | 400, 401, 403 |
| 3 | POST | /refresh | – | – | `{ refreshToken, deviceId }` | 200 | 400, 401 |
| 4 | POST | /logout | – | – | `{ refreshToken }` | 200 | 400 |
| 5 | POST | /logout-all | ✅ | – | – | 200 | 401 |
| 6 | POST | /forgot-password | – | – | `{ email }` | 200 | 400 |
| 7 | POST | /reset-password | – | – | `{ token, password }` | 200 | 400 |
| 8 | GET  | /me | ✅ | – | – | 200 | 401, 404 |

**Validation:** `validation/auth.schemas.ts` — zod; email lowercased; phone 5–30 chars; deviceId ≤128.
**Security:** `deviceId` on register/login creates a `Device` record; access-token carries verified `deviceId` claim (`token.service.ts`).

---

## 2. Businesses — `/api/v1/businesses`

| # | Method | Path | Roles | Body | Success | Errors |
|---|--------|------|-------|------|---------|--------|
| 9  | GET | `/` | – | – | 200 | 401 |
| 10 | POST | `/` | – | `{ name, type, currency?, taxRate?, fiscalYear?, allowNegativeStock?, address?, phone?, email? }` | 201 | 400, 401 |
| 11 | GET | `/:id` | – | – | 200 | 401, 404 |
| 12 | PUT | `/:id` | Owner, Admin | patch subset | 200 | 400, 401, 403, 404 |
| 13 | PATCH | `/:id` | Owner, Admin | patch subset | 200 | 400, 401, 403, 404 |
| 14 | GET | `/:id/modules` | – | – | 200 | 401, 404 |

**Collections:** Business, BusinessMembership, AuditLog.
**Note:** `POST /` creates Business + BusinessMembership(role=Owner) atomically.

---

## 3. Shops — `/api/v1/shops`

| # | Method | Path | Roles | Body | Success | Errors |
|---|--------|------|-------|------|---------|--------|
| 15 | POST | `/` | Owner, Admin | `{ businessId, name, branchCode, address?, phone?, manager?, isWarehouse?, openingCash? }` | 201 | 400, 401, 403, 404, 409 |
| 16 | GET | `/` | – | – | 200 | 400, 401, 404 |
| 17 | GET | `/:id` | – | – | 200 | 401, 404 |
| 18 | PUT | `/:id` | Owner, Admin | patch | 200 | 400, 401, 403, 404 |
| 19 | PATCH | `/:id` | Owner, Admin | patch | 200 | 400, 401, 403, 404 |
| 20 | PATCH | `/:id/status` | Owner, Admin | `{ businessId, status }` | 200 | 400, 401, 403, 404 |

**Collections:** Shop, Account (seeds "Cash" account from `openingCash`).
**Unique:** `branchCode` unique per business.

---

## 4. Products — `/api/v1/products`

| # | Method | Route | Roles | Body | Success | Errors |
|---|--------|-------|-------|------|---------|--------|
| 21 | GET | `/lookup/barcode?businessId=&barcode=` | – | – | 200 | 400, 401, 404 |
| 22 | GET | `/` | – | – | 200 | 400, 401, 404 |
| 23 | POST | `/` | Owner, Admin, Manager, Inventory Manager | `{ businessId, name, categoryId?, sku?, barcode?, brand?, unit?, purchasePrice?, sellingPrice?, wholesalePrice?, minPrice?, taxRate?, currentStock?, minStock?, maxStock?, preferredSupplierId?, imageUrl?, description? }` | 201 | 400, 401, 403, 404, 409 |
| 24 | GET | `/:id` | – | – | 200 | 401, 404 |
| 25 | PUT | `/:id` | Owner, Admin, Manager, Inventory Manager | patch | 200 | 400, 401, 403, 404 |
| 26 | PATCH | `/:id` | Owner, Admin, Manager, Inventory Manager | patch | 200 | 400, 401, 403, 404 |
| 27 | PATCH | `/:id/status` | Owner, Admin, Manager, Inventory Manager | `{ businessId, status }` | 200 | 400, 401, 403, 404 |

**Unique:** `barcode` per business (partial unique index).

---

## 5. Categories — `/api/v1/categories`

| # | Method | Route | Roles | Success | Errors |
|---|--------|-------|-------|---------|--------|
| 28 | GET | `/` | – | 200 | 400, 401, 404 |
| 29 | POST | `/` | Owner, Admin, Manager | 201 | 400, 403, 404, 409 |
| 30 | GET | `/:id` | – | 200 | 401, 404 |
| 31 | PUT | `/:id` | Owner, Admin, Manager | 200 | 400, 403, 404 |
| 32 | PATCH | `/:id` | Owner, Admin, Manager | 200 | 400, 403, 404 |
| 33 | PATCH | `/:id/status` | Owner, Admin, Manager | 200 | 403, 404 |

**Unique:** `name` per business.

---

## 6. Customers — `/api/v1/customers`

| # | Method | Route | Roles | Body | Success | Errors |
|---|--------|-------|-------|------|---------|--------|
| 34 | GET | `/` | – | – | 200 | 400, 401, 404 |
| 35 | POST | `/` | Owner, Admin, Manager, Accountant, Salesperson | `{ businessId, name, phone?, email?, address?, customerCode?, openingBalance?, creditLimit? }` | 201 | 400, 401, 403, 404 |
| 36 | GET | `/:id` | – | – | 200 | 401, 404 |
| 37 | PUT | `/:id` | Owner, Admin, Manager, Accountant, Salesperson | patch | 200 | 400, 403, 404 |
| 38 | PATCH | `/:id` | same as PUT | patch | 200 | 400, 403, 404 |
| 39 | PATCH | `/:id/status` | same | `{ businessId, status }` | 200 | 400, 403, 404 |

**Collections:** Customer. Opening balance delta adjusts `currentDue`.

---

## 7. Suppliers — `/api/v1/suppliers`

| # | Method | Route | Roles | Success | Errors |
|---|--------|-------|-------|---------|--------|
| 40 | GET | `/` | – | 200 | 400, 401, 404 |
| 41 | POST | `/` | Owner, Admin, Manager, Accountant | 201 | 400, 403, 404 |
| 42 | GET | `/:id` | – | 200 | 401, 404 |
| 43 | PUT | `/:id` | Owner, Admin, Manager, Accountant | 200 | 400, 403, 404 |
| 44 | PATCH | `/:id` | Owner, Admin, Manager, Accountant | 200 | 400, 403, 404 |
| 45 | PATCH | `/:id/status` | Owner, Admin, Manager, Accountant | 200 | 400, 403, 404 |

**Collections:** Supplier. Opening delta adjusts `currentPayable`.

---

## 8. Units — `/api/v1/units`

| # | Method | Path | Auth | Success |
|---|--------|------|------|---------|
| 46 | GET | `/` | ✅ | 200 (config constant, no business scope) |

---

## 9. Accounts — `/api/v1/accounts`

| # | Method | Path | Roles | Body | Success | Errors |
|---|--------|------|-------|------|---------|--------|
| 47 | GET | `/` | – | – | 200 | 400, 401, 404 |
| 48 | POST | `/transfer` | Owner, Admin, Manager, Accountant | `{ businessId, shopId, fromAccountId, toAccountId, amount, note?, localId? }` | 200 | 400, 401, 403, 404, 409 |
| 49 | POST | `/` | Owner, Admin, Manager, Accountant | `{ businessId, shopId, name, type, accountNumber? }` | 201 | 400, 401, 403, 404, 409 |
| 50 | GET | `/:id` | – | – | 200 | 401, 404 |
| 51 | PUT | `/:id` | Owner, Admin, Manager, Accountant | patch | 200 | 403, 404 |
| 52 | PATCH | `/:id` | Owner, Admin, Manager, Accountant | patch | 200 | 403, 404 |

**Types:** CASH · BANK · MOBILE_MONEY · CARD · OTHER.
**Unique:** account name per (business, shop).
**Journal:** transfer = Debit DestCash / Credit SourceCash (balanced).
**Idempotency:** `localId` on transfer.

---

## 10. Payments — `/api/v1/payments`

| # | Method | Route | Roles | Body | Success | Errors |
|---|--------|------|-------|------|---------|--------|
| 53 | POST | `/` | Owner, Admin, Manager, Accountant | `{ businessId, shopId, type, customerId?, supplierId?, amount, method, accountId, note?, idempotencyKey, paymentDate?, localId? }` | 201 | 400, 403, 404 |
| 54 | GET | `/` | – | – | 200 | 400, 401, 404 |
| 55 | GET | `/:id` | – | – | 200 | 401, 404 |

**Collections:** Payment, Customer/Supplier, Account, JournalEntry/Line, AuditLog.
**Idempotency:** `idempotencyKey` unique per business.

---

## 11. Expenses — `/api/v1/expenses`

| # | Method | Route | Roles | Body | Success | Errors |
|---|--------|------|-------|------|---------|--------|
| 56 | POST | `/` | Owner, Admin, Manager, Accountant | `{ businessId, shopId, category, amount, paymentAccountId, note?, receiptUrl?, expenseDate?, localId? }` | 201 | 400, 403, 404 |
| 57 | GET | `/` | – | – | 200 | 400, 401, 404 |
| 58 | GET | `/:id` | – | – | 200 | 401, 404 |

**Collections:** Expense, Account (decrement), JournalEntry/Line (Debit Expense / Credit Cash-Equivalent), AuditLog (EXPENSE_CREATED).
**Idempotency:** `localId` unique per business.

---

## 12. Sales — `/api/v1/sales`

| # | Method | Route | Roles | Body | Success | Errors |
|---|--------|------|-------|------|---------|--------|
| 59 | POST | `/` | Owner, Admin, Manager, Salesperson | `{ businessId, shopId, customerId?, customerName?, items:[{productId, qty, unitPrice?, discountAmount?}], discountAmount?, discountPercent?, paidAmount?, accountId?, notes?, saleDate?, localId?, draft? }` | 201 | 400, 401, 403, 404, 409 |
| 60 | GET | `/` | – | – | 200 | 400, 401, 404 |
| 61 | POST | `/:id/return` | Owner, Admin, Manager | `{ businessId, shopId, items, reason?, localId? }` | 200/201 | 400, 403, 404 |
| 62 | GET | `/:id` | – | – | 200 | 401, 404 |
| 63 | POST | `/:id/finalize` | Owner, Admin, Manager, Salesperson | `{ businessId, shopId, paidAmount?, accountId? }` | 200 | 400, 403, 404 |
| 64 | POST | `/:id/void` | Owner, Admin, Manager | `{ businessId, shopId, reason? }` | 200 | 400, 403, 404 |
| 65 | POST | `/:id/payments` | Owner, Admin, Manager, Accountant | `{ businessId, shopId, amount, method, accountId, idempotencyKey, note?, paymentDate?, localId? }` | 201 | 400, 403, 404, 409 |
| 66 | GET | `/:id/payments` | – | – | 200 | 400, 401, 404 |

**Collections:** Sale, Product, StockMovement, Customer, Account, JournalEntry/Line, AuditLog.
**Idempotency:** `localId` (sale create), `idempotencyKey` (settlement), finalize idempotent.

---

## 13. Purchases — `/api/v1/purchases`

| # | Method | Route | Roles | Body | Success | Errors |
|---|--------|------|-------|------|---------|--------|
| 67 | POST | `/` | Owner, Admin, Manager, Inventory Manager | `{ businessId, shopId, supplierId, supplierInvoiceNo?, items, discountAmount?, discountPercent?, paidAmount?, accountId?, notes?, purchaseDate?, localId?, draft? }` | 201 | 400, 403, 404, 409 |
| 68 | GET | `/` | – | – | 200 | 400, 401, 404 |
| 69 | POST | `/:id/return` | Owner, Admin, Manager | `{ businessId, shopId, items, reason?, localId? }` | 200/201 | 400, 403, 404 |
| 70 | GET | `/:id` | – | – | 200 | 401, 404 |
| 71 | POST | `/:id/finalize` | Owner, Admin, Manager, Inventory | `{ businessId, shopId, paidAmount?, accountId? }` | 200 | 400, 403, 404 |
| 72 | POST | `/:id/void` | Owner, Admin, Manager | `{ businessId, shopId, reason? }` | 200 | 400, 403, 404 |
| 73 | POST | `/:id/payments` | Owner, Admin, Manager, Accountant | `{ businessId, shopId, amount, method, accountId, idempotencyKey, note?, paymentDate?, localId? }` | 201 | 400, 403, 404, 409 |
| 74 | GET | `/:id/payments` | – | – | 200 | 400, 401, 404 |

**Collections:** Purchase, Product, StockMovement, Supplier, Account, JournalEntry/Line, AuditLog.
**Idempotency:** `localId` (purchase), `idempotencyKey` (pay).

---

## 14. Invoices — `/api/v1/invoices`

| # | Method | Route | Auth | Success | Errors |
|---|--------|-------|------|---------|--------|
| 75 | GET | `/sales` | ✅ | 200 | 400, 401, 404 |
| 76 | GET | `/purchases` | ✅ | 200 | 400, 401, 404 |
| 77 | GET | `/:type/:id` | ✅ | 200 | 400, 401, 404 |

**Collections:** `Sale` / `Purchase` read-only projections.

---

## 15. Inventory — `/api/v1/inventory`

| # | Method | Route | Roles | Body | Success | Errors |
|---|--------|------|-------|------|---------|--------|
| 78 | GET | `/stock` | – | – | 200 | 400, 401, 404 |
| 79 | GET | `/movements` | – | – | 200 | 400, 401, 404 |
| 80 | POST | `/adjust` | Owner, Admin, Manager, Inv Mgr | `{ businessId, shopId, productId, qtyChange, reason, kind, localId? }` | 201 | 400, 403, 404 |
| 81 | POST | `/opening` | Owner, Admin, Manager, Inv Mgr | `{ businessId, shopId, productId, quantity, localId? }` | 201 | 400, 403, 404 |

**Collections:** Product, StockMovement (10 types/13 ref types), AuditLog.

---

## 16. Stock Transfers — `/api/v1/transfers`

| # | Method | Path | Roles | Body | Success | Errors |
|---|--------|------|-------|------|---------|--------|
| 82 | POST | `/` | Owner, Admin, Manager, Inventory | `{ businessId, sourceShopId, destShopId, productId, quantity, notes?, localId? }` | 201 | 400, 403, 404, 409 |
| 83 | GET | `/` | – | – | 200 | 400, 401, 404 |
| 84 | PUT | `/:id/status` | Owner, Admin, Manager, Inventory | `{ businessId, shopId, status }` | 200 | 400, 403, 404 |

---

## 17. Accounting (reports) — `/api/v1/accounting`

Read-only; roles Owner/Admin/Manager/Accountant (`requireRole` at route level).

| # | Method | Route | Success | Errors |
|---|--------|-------|---------|--------|
| 85 | GET | /journal | 200 | 400, 401, 403, 404 |
| 86 | GET | /ledger | 200 | 400, 401, 403, 404 |
| 87 | GET | /trial-balance | 200 | 400, 401, 403, 404 |
| 88 | GET | /profit-loss | 200 | 400, 401, 403, 404 |
| 89 | GET | /balance-sheet | 200 | 400, 401, 403, 404 |
| 90 | GET | /cash-flow | 200 | 400, 401, 403, 404 |

---

## 18. Health / Meta

| # | Method | Path | Auth | Result |
|---|--------|------|------|---------|
| 91 | GET | /health | – | 200 `{ success:true, status:"ok" }` |
| 92 | GET | /ready | – | 200 when DB connected, else 503 |
| 93 | GET | /unknown | – | 404 |

---

## Cross-cutting security & integrity

- **Auth:** `requireAuth` verifies JWT, loads User, checks status ACTIVE.
- **Tenant:** BusinessMembership check returns `404` (not 403) for foreign business.
- **Shop:** `assertShopAccess` verifies Shop belongs to resolved Business; foreign = 404.
- **RBAC:** `requireRole` + service-level protection (`assertCanWrite`) for financial writes.
- **deviceId:** from verified JWT claim; `.strict()` schemas reject client-supplied `deviceId` (400).
- **Money:** all financial values integer paisa; server recomputes totals/tax/avgCost; `.strict()` rejects spoofed `total`, `avgCost`, `currentStock`.
- **Idempotency:** `localId` unique per business (Sale/Purchase/Expense/Transfer/Return), `idempotencyKey` unique for payments/settlements; finalize/void idempotent.
- **Transactions:** every financial mutation runs inside `withTransaction` (replica-set-aware).
- **Audit:** AuditLog entries for register, login, device-registered, sale/purchase/expense/payment/void/transfer, etc.