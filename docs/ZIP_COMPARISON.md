# ZIP Comparison Report — Universal Business OS

**Date:** 2026-08-17
**Auditor:** Lead Software Architect / Full-Stack Engineer

---

## 1. ZIP A — `universal-business-os-android-mvp.zip` (250,630 bytes, older)

### 1.1 Architecture

**Next.js 16 Web Application** (App Router) with **PostgreSQL + Drizzle ORM** backend. Despite the "android-mvp" filename, this is a **web application**, not a mobile app.

```
Next.js 16 (App Router)
├── src/app/api/v1/*  → API routes (Next.js route handlers)
├── src/components/*  → React client components (POS, Dashboard, etc.)
├── src/db/           → Drizzle ORM schema + connection
├── src/lib/          → Utilities (currency, i18n, types, seed data)
└── PostgreSQL        → Database (via pg + drizzle-orm)
```

### 1.2 Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router) |
| Language | TypeScript 5.9.3 |
| Database | PostgreSQL (pg 8.20.0) |
| ORM | Drizzle ORM 0.45.2 |
| Validation | Zod 4.4.3 |
| Auth | JWT (jsonwebtoken 9.0.3) + bcryptjs 3.0.3 |
| UI | React 19.2.6, Tailwind CSS 4.1.17, lucide-react, recharts |
| Package Manager | npm |

### 1.3 Directory Structure

```
src/
├── app/
│   ├── api/
│   │   ├── health/route.ts
│   │   └── v1/
│   │       ├── accounts/route.ts
│   │       ├── audit/route.ts
│   │       ├── businesses/route.ts
│   │       ├── customers/route.ts
│   │       ├── devices/route.ts
│   │       ├── expenses/route.ts
│   │       ├── payments/route.ts
│   │       ├── products/route.ts
│   │       ├── purchases/route.ts
│   │       ├── reports/summary/route.ts
│   │       ├── sales/route.ts
│   │       ├── seed/route.ts
│   │       ├── suppliers/route.ts
│   │       ├── sync/pull/route.ts
│   │       ├── sync/push/route.ts
│   │       └── transfers/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── AccountsView.tsx
│   ├── BakiKhataView.tsx
│   ├── BarcodeScannerModal.tsx
│   ├── DashboardView.tsx
│   ├── DevicesView.tsx
│   ├── ExpensesView.tsx
│   ├── InvoiceModal.tsx
│   ├── Navbar.tsx
│   ├── POSView.tsx
│   ├── ProductsView.tsx
│   ├── PurchasesView.tsx
│   ├── QuickActionModal.tsx
│   └── ReportsView.tsx
├── db/
│   ├── index.ts
│   └── schema.ts
└── lib/
    ├── currency.ts
    ├── i18n.ts
    ├── seed-data.ts
    └── types.ts
```

### 1.4 Database Schema (ZIP A)

**Tables:** users, businesses, shops, memberships, devices, categories, products, customers, suppliers, sales, sale_items, purchases, purchase_items, payments, expenses, accounts, inventory_movements, stock_transfers, journal_entries, journal_lines, audit_logs, sync_events

**Key design decisions:**
- UUID primary keys
- Money stored as **integer paisa** (৳ × 100)
- Multi-tenant via `businessId` on all records
- Multi-shop via `shopId`
- Double-entry accounting tables (journal_entries + journal_lines)
- Sync metadata (localId, sync_events)
- Device management table

### 1.5 API Endpoints (ZIP A)

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET/POST | `/api/v1/accounts` | Account list/create |
| GET | `/api/v1/audit` | Audit log list |
| GET | `/api/v1/businesses` | Business + shops |
| GET/POST | `/api/v1/customers` | Customer list/create/detail |
| POST | `/api/v1/devices` | Device status update |
| GET/POST | `/api/v1/expenses` | Expense list/create |
| GET/POST | `/api/v1/payments` | Payment list/create |
| GET/POST | `/api/v1/products` | Product list/create |
| GET/POST | `/api/v1/purchases` | Purchase list/create |
| GET | `/api/v1/reports/summary` | Dashboard summary |
| GET/POST | `/api/v1/sales` | Sale list/create |
| POST | `/api/v1/seed` | Seed demo data |
| GET/POST | `/api/v1/suppliers` | Supplier list/create |
| POST | `/api/v1/sync/pull` | Pull master data |
| POST | `/api/v1/sync/push` | Push offline ops |
| GET/POST | `/api/v1/transfers` | Stock transfer list/create |

### 1.6 Implemented Features (ZIP A)

- ✅ Business + multi-shop schema
- ✅ Product CRUD (search, barcode, low-stock filter)
- ✅ Customer CRUD (with due tracking)
- ✅ Supplier CRUD (with payable tracking)
- ✅ Sales creation (with inventory deduction, customer due update, cash account update, double-entry journal, audit log)
- ✅ Purchase creation (with inventory increase, supplier payable update, cash deduction, journal)
- ✅ Payment recording (customer/supplier)
- ✅ Expense recording (with cash deduction)
- ✅ Stock transfer (with inventory movements)
- ✅ Account management (cash, bank, bKash, Nagad)
- ✅ Dashboard summary report
- ✅ Sync push/pull (basic, idempotent by localId)
- ✅ Device management
- ✅ Audit log
- ✅ Seed data (realistic Bangladesh hardware shop)
- ✅ Bangla/English i18n
- ✅ Barcode scanner modal (UI)
- ✅ POS view (UI)
- ✅ Invoice modal (UI)
- ✅ Baki Khata (dues ledger) view (UI)

### 1.7 Critical Issues (ZIP A)

- ❌ **No authentication** — API routes use hardcoded first business; no JWT verification on any endpoint
- ❌ **No authorization/RBAC** — no role checks
- ❌ **No validation** — no Zod validation on any API route
- ❌ **No error handling** — generic try/catch with 500
- ❌ **No pagination** — `.limit(50)` hardcoded
- ❌ **No tests** — zero test files
- ❌ **No transactions** — multi-step operations (sale + inventory + journal) are not atomic
- ❌ **No offline SQLite** — sync endpoints exist but no client-side offline storage
- ❌ **No real sync conflict handling** — no versioning, no conflict detection
- ❌ **No refresh tokens** — JWT only (and not even used)
- ❌ **No rate limiting, helmet, sanitization**
- ❌ **No CI/CD**
- ❌ **No environment validation**
- ❌ **No deployment config**

---

## 2. ZIP B — `universal-business-os-android-mvp (1).zip` (321,792 bytes, newer)

### 2.1 Architecture

**Next.js 16 Web Application** (App Router) with **PostgreSQL + Drizzle ORM** backend. Also a **web application**, not a mobile app. More complete page structure than ZIP A.

```
Next.js 16 (App Router)
├── src/app/api/*       → API routes (categories, customers, dashboard, expenses, health, payments, products, purchases, reports, sales, seed, suppliers)
├── src/app/*/page.tsx  → Full page routes (customers, expenses, inventory, payments, products, purchases, reports, sales, settings, suppliers)
├── src/components/*    → Per-module content components + UI kit
├── src/db/             → Drizzle ORM schema + connection
├── src/lib/            → Constants, format utilities
└── PostgreSQL          → Database
```

### 2.2 Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router) |
| Language | TypeScript 5.9.3 |
| Database | PostgreSQL (pg 8.20.0) |
| ORM | Drizzle ORM 0.45.2 |
| Validation | Zod 4.4.3 |
| UI | React 19.2.6, Tailwind CSS 4.1.17, lucide-react, recharts, date-fns |
| Package Manager | npm |

### 2.3 Directory Structure

```
src/
├── app/
│   ├── api/
│   │   ├── categories/route.ts
│   │   ├── customers/[id]/route.ts
│   │   ├── customers/route.ts
│   │   ├── dashboard/route.ts
│   │   ├── expenses/route.ts
│   │   ├── health/route.ts
│   │   ├── payments/route.ts
│   │   ├── products/[id]/route.ts
│   │   ├── products/route.ts
│   │   ├── purchases/route.ts
│   │   ├── reports/route.ts
│   │   ├── sales/[id]/route.ts
│   │   ├── sales/route.ts
│   │   ├── seed/route.ts
│   │   └── suppliers/route.ts
│   ├── customers/page.tsx
│   ├── expenses/page.tsx
│   ├── inventory/page.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   ├── payments/page.tsx
│   ├── products/page.tsx
│   ├── purchases/page.tsx
│   ├── reports/page.tsx
│   ├── sales/page.tsx
│   ├── settings/page.tsx
│   └── suppliers/page.tsx
├── components/
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   ├── customers/CustomersContent.tsx
│   ├── dashboard/DashboardContent.tsx
│   ├── expenses/ExpensesContent.tsx
│   ├── inventory/InventoryContent.tsx
│   ├── payments/PaymentsContent.tsx
│   ├── products/ProductsContent.tsx
│   ├── purchases/PurchasesContent.tsx
│   ├── reports/ReportsContent.tsx
│   ├── sales/NewSaleForm.tsx
│   ├── sales/SalesContent.tsx
│   ├── settings/SettingsContent.tsx
│   ├── suppliers/SuppliersContent.tsx
│   └── ui/Badge.tsx, Modal.tsx, StatCard.tsx
├── db/
│   ├── index.ts
│   └── schema.ts
└── lib/
    ├── constants.ts
    └── format.ts
```

### 2.4 Database Schema (ZIP B)

**Tables:** businesses, shops, categories, products, customers, suppliers, sales, sale_items, purchases, purchase_items, payments, expenses, inventory_movements

**Key design decisions:**
- **Serial (auto-increment) primary keys** (not UUID)
- Money stored as **integer paisa**
- Multi-tenant via `businessId`
- Multi-shop via `shopId`
- **Average cost tracking** (`avgCost` on products)
- **Enums** for business type, roles, transaction status, payment method, stock movement type, expense category
- **Indexes** on businessId, shopId, productId, dates
- **Drizzle relations** defined
- No accounting tables (no journal_entries)
- No sync tables (no sync_events, no localId)
- No device management
- No audit logs

### 2.5 API Endpoints (ZIP B)

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET/POST | `/api/categories` | Category list/create |
| GET/PUT/DELETE | `/api/customers/[id]` | Customer detail/update/delete |
| GET/POST | `/api/customers` | Customer list/create |
| GET | `/api/dashboard` | Dashboard stats |
| GET/POST | `/api/expenses` | Expense list/create |
| GET/POST | `/api/payments` | Payment list/create |
| GET/PUT/DELETE | `/api/products/[id]` | Product detail/update/delete |
| GET/POST | `/api/products` | Product list/create |
| GET/POST | `/api/purchases` | Purchase list/create |
| GET | `/api/reports` | Reports (profit, sales, inventory, receivables, payables) |
| GET/PUT/DELETE | `/api/sales/[id]` | Sale detail/update/delete |
| GET/POST | `/api/sales` | Sale list/create |
| POST | `/api/seed` | Seed demo data |
| GET/POST | `/api/suppliers` | Supplier list/create |

### 2.6 Implemented Features (ZIP B)

- ✅ Business + shop schema
- ✅ Product CRUD (with search, category filter, low-stock filter, Zod validation)
- ✅ Customer CRUD (with detail/update/delete, Zod validation)
- ✅ Supplier CRUD
- ✅ Category CRUD
- ✅ Sales creation (with inventory deduction, customer due update, payment recording, **Zod validation**, **average cost tracking**)
- ✅ Purchase creation (with inventory increase, **average cost recalculation**, supplier payable update, payment recording, Zod validation)
- ✅ Payment recording
- ✅ Expense recording
- ✅ Inventory movements tracking
- ✅ Reports (profit/loss with COGS, sales breakdown, inventory valuation, receivables, payables)
- ✅ Dashboard stats
- ✅ Full page routes for all modules
- ✅ UI kit (Badge, Modal, StatCard)
- ✅ Seed data

### 2.7 Critical Issues (ZIP B)

- ❌ **No authentication** — hardcoded `BUSINESS_ID = 1`, `SHOP_ID = 1`
- ❌ **No authorization/RBAC**
- ❌ **No multi-tenancy** — single hardcoded business
- ❌ **No transactions** — multi-step operations not atomic
- ❌ **No tests** — zero test files
- ❌ **No offline SQLite**
- ❌ **No sync**
- ❌ **No accounting engine** (no journal entries)
- ❌ **No audit log**
- ❌ **No device management**
- ❌ **No refresh tokens**
- ❌ **No rate limiting, helmet, sanitization**
- ❌ **No CI/CD**
- ❌ **No environment validation**
- ❌ **No deployment config**

---

## 3. File-by-File Comparison

### 3.1 Same Files (exist in both)

| File | ZIP A | ZIP B | Notes |
|---|---|---|---|
| `package.json` | ✅ | ✅ | Same name `nextjs-postgresql-template`; different deps |
| `tsconfig.json` | ✅ | ✅ | Similar |
| `next.config.ts` | ✅ | ✅ | Similar |
| `drizzle.config.json` | ✅ | ✅ | Similar |
| `eslint.config.mjs` | ✅ | ✅ | Similar |
| `postcss.config.mjs` | ✅ | ✅ | Similar |
| `src/db/index.ts` | ✅ | ✅ | Same pattern (pg Pool + drizzle) |
| `src/db/schema.ts` | ✅ | ✅ | **Different schemas** (see below) |
| `src/app/layout.tsx` | ✅ | ✅ | Different |
| `src/app/page.tsx` | ✅ | ✅ | Different |
| `src/app/globals.css` | ✅ | ✅ | Similar |

### 3.2 Different Files (same purpose, different implementation)

| Purpose | ZIP A | ZIP B | Winner |
|---|---|---|---|
| Database schema | UUID PKs, 22 tables, accounting + sync + devices + audit | Serial PKs, 13 tables, enums + indexes + avgCost | **MERGE** — ZIP A has more tables; ZIP B has better indexes/enums/avgCost |
| Sales API | No validation, no avgCost, has journal + audit | Zod validation, avgCost, no journal | **MERGE** — ZIP B validation + ZIP A journal |
| Purchase API | No validation, no avgCost, has journal | Zod validation, avgCost recalculation | **MERGE** |
| Products API | No validation, no brand/minPrice/maxStock | Zod validation, brand, minPrice, maxStock, avgCost | **ZIP B** |
| Customers API | Has detail view with sales+payments | Has CRUD with [id] routes | **MERGE** |
| Reports | Summary only (estimated profit 22%) | Full reports (profit with COGS, sales, inventory, receivables, payables) | **ZIP B** |
| UI | Single-page app with tab views | Multi-page with sidebar navigation | **ZIP B** (more complete) |

### 3.3 Unique ZIP A Files

- `src/app/api/v1/accounts/route.ts`
- `src/app/api/v1/audit/route.ts`
- `src/app/api/v1/businesses/route.ts`
- `src/app/api/v1/devices/route.ts`
- `src/app/api/v1/sync/pull/route.ts`
- `src/app/api/v1/sync/push/route.ts`
- `src/app/api/v1/transfers/route.ts`
- `src/components/AccountsView.tsx`
- `src/components/BakiKhataView.tsx`
- `src/components/BarcodeScannerModal.tsx`
- `src/components/DevicesView.tsx`
- `src/components/InvoiceModal.tsx`
- `src/components/POSView.tsx`
- `src/components/QuickActionModal.tsx`
- `src/lib/currency.ts`
- `src/lib/i18n.ts`
- `src/lib/seed-data.ts`
- `src/lib/types.ts`

### 3.4 Unique ZIP B Files

- `src/app/api/categories/route.ts`
- `src/app/api/customers/[id]/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/products/[id]/route.ts`
- `src/app/api/sales/[id]/route.ts`
- `src/app/api/reports/route.ts`
- `src/app/customers/page.tsx`
- `src/app/expenses/page.tsx`
- `src/app/inventory/page.tsx`
- `src/app/payments/page.tsx`
- `src/app/products/page.tsx`
- `src/app/purchases/page.tsx`
- `src/app/reports/page.tsx`
- `src/app/sales/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/suppliers/page.tsx`
- `src/components/Header.tsx`
- `src/components/Sidebar.tsx`
- `src/components/customers/CustomersContent.tsx`
- `src/components/dashboard/DashboardContent.tsx`
- `src/components/expenses/ExpensesContent.tsx`
- `src/components/inventory/InventoryContent.tsx`
- `src/components/payments/PaymentsContent.tsx`
- `src/components/products/ProductsContent.tsx`
- `src/components/purchases/PurchasesContent.tsx`
- `src/components/reports/ReportsContent.tsx`
- `src/components/sales/NewSaleForm.tsx`
- `src/components/sales/SalesContent.tsx`
- `src/components/settings/SettingsContent.tsx`
- `src/components/suppliers/SuppliersContent.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/ui/Modal.tsx`
- `src/components/ui/StatCard.tsx`
- `src/lib/constants.ts`
- `src/lib/format.ts`

### 3.5 Conflicting Implementations

| Feature | ZIP A | ZIP B | Conflict |
|---|---|---|---|
| Primary keys | UUID | Serial integer | **CONFLICT** — needs decision |
| Business type values | "Retail", "Wholesale", "Retail + Wholesale" (strings) | "retail", "wholesale", "retail_wholesale" (enum) | **CONFLICT** — needs normalization |
| Money field names | `purchasePricePaisa`, `sellingPricePaisa` | `purchasePrice`, `sellingPrice` (stored as paisa) | **CONFLICT** — naming inconsistency |
| Customer due field | `currentDuePaisa` | `currentDue` | **CONFLICT** |
| Sale status | `completed`, `voided` | `pending`, `completed`, `cancelled`, `returned` | **CONFLICT** |
| Payment method | `Cash`, `Bank`, `bKash`, `Nagad`, `Rocket`, `Card`, `Multiple` | `cash`, `bank`, `bkash`, `nagad`, `rocket`, `card`, `other` | **CONFLICT** |
| API path prefix | `/api/v1/` | `/api/` | **CONFLICT** |
| Response shape | `{ success, data }` | `{ success, data, pagination }` | **CONFLICT** |
| Auth | JWT libs present but unused | No auth at all | **CONFLICT** |

### 3.6 Complementary Features

| ZIP A provides | ZIP B provides | Combined value |
|---|---|---|
| Accounting (journal entries) | Average cost tracking | Full financial engine |
| Sync push/pull | Zod validation | Offline + validated API |
| Device management | Full page routes | Complete admin |
| Audit log | Reports (profit, sales, inventory) | Complete observability |
| Multi-shop schema | Indexes + enums | Scalable schema |
| Bangla i18n | date-fns formatting | Localized UX |

---

## 4. Current Working Code (mobile/ + server/) vs ZIPs

### 4.1 Current `mobile/` (Expo React Native)

**Files present:** App.tsx, screens (Welcome, Login, Register, Home, Dashboard, Products, Parties, Settings), src/auth.tsx, src/components/ui.tsx, src/i18n/index.tsx

**Critical missing files (imported but not present):**
- `src/api.ts` — imported by auth.tsx, Dashboard.tsx, Products.tsx, Parties.tsx
- `src/theme.ts` — imported by all screens and ui.tsx
- `src/i18n/dictionaries.ts` — imported by i18n/index.tsx

**Status: BROKEN — will not compile**

### 4.2 Current `server/` (Express + TypeScript + Mongoose)

**Files present:** package.json, tsconfig.json only

**Critical missing:** All source code (src/ subdirectories are empty)

**Status: BROKEN — no implementation exists**

### 4.3 `business-os/` directory

**Status: DUPLICATE** of root-level `mobile/` and `server/` directories. Contains the same broken state plus node_modules and dist artifacts.

---

## 5. Recommended Merge Strategy

### 5.1 What to preserve from ZIP A (as reference)

- Database schema concepts: multi-shop, accounting (journal_entries/lines), sync metadata, devices, audit_logs, stock_transfers
- Sync push/pull API design (idempotency by localId)
- Bangla i18n dictionary
- Seed data structure (realistic Bangladesh business)
- Currency utilities (paisa conversion)

### 5.2 What to preserve from ZIP B (as reference)

- Zod validation patterns
- Average cost tracking
- Enum definitions
- Index design
- Report queries (profit with COGS, sales breakdown, inventory valuation)
- Full page structure concept
- UI kit components

### 5.3 What to discard

- **Both ZIPs' Next.js frontend** — PRD specifies React Native + Expo mobile app
- **Both ZIPs' PostgreSQL** — PRD specifies MongoDB Atlas
- **Both ZIPs' hardcoded single-business approach** — PRD requires multi-tenant
- **Both ZIPs' lack of auth** — PRD requires full JWT auth

### 5.4 What to rewrite

- **Backend** — Express + TypeScript + Mongoose (per PRD), reusing business logic concepts from both ZIPs
- **Mobile** — React Native + Expo (per PRD), reusing UI concepts and i18n from ZIP A
- **Database schema** — MongoDB collections (per PRD), mapping from both ZIPs' PostgreSQL schemas

### 5.5 What to merge

- Business logic: sales processing (ZIP A journal + ZIP B avgCost + ZIP B validation)
- Purchase processing: same merge pattern
- Reports: ZIP B's report queries adapted to MongoDB
- Sync: ZIP A's push/pull design adapted to MongoDB + SQLite

---

## 6. Architecture Decision Required

| Decision | ZIP A | ZIP B | Recommended |
|---|---|---|---|
| Frontend | Next.js web | Next.js web | **React Native + Expo** (per PRD) |
| Backend | Next.js API routes | Next.js API routes | **Node.js + Express** (per PRD) |
| Database | PostgreSQL | PostgreSQL | **MongoDB Atlas** (per PRD) |
| ORM | Drizzle | Drizzle | **Mongoose** (per PRD) |
| Offline | Sync API only | None | **SQLite + sync queue** (per PRD) |
| Auth | JWT libs unused | None | **JWT access + refresh** (per PRD) |
| Money | Integer paisa | Integer paisa | **Integer paisa** (both agree) |
| Multi-tenant | businessId | Hardcoded | **businessId + shopId** (per PRD) |