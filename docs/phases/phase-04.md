# Phase 04 — Products, Customers & Suppliers

## Objective
Implement complete Product, Category, Customer, and Supplier management with search, filtering, due/payable tracking, and validation.

## Why This Phase Exists
Products, customers, and suppliers are the master data that all transactions (sales, purchases, payments) depend on. The current mobile app has basic product/customer/supplier screens but the server has no implementation.

## Dependencies
- Phase 03 — Business & Shops

## Existing Implementation Status
- ZIP A: products, categories, customers, suppliers tables + API → **REFERENCE**
- ZIP B: products, categories, customers, suppliers tables + API with Zod → **REFERENCE (better validation)**
- Mobile Products.tsx: list + add + search + low-stock → **REBUILT (was broken — old /api/* endpoints without auth/business context)**
- Mobile Parties.tsx: customers/suppliers list + add → **REBUILT (was broken — old /api/* endpoints without auth/business context)**
- Server: → **IMPLEMENTED**

## Tasks

### Database

- [x] Create Category model (businessId, name, description; unique {businessId, name})
- [x] Create Product model (businessId, categoryId, name, sku, barcode, brand, unit, prices in paisa, currentStock, minStock, maxStock, avgCost, imageUrl, description, status, preferredSupplierId)
- [x] Create Customer model (businessId, name, phone, email, customerCode, address, openingBalance, creditLimit, currentDue, status) — business-level, no shopId (ZIP B schema; shopId lives on sales)
- [x] Create Supplier model (businessId, name, phone, email, company, address, openingBalance, currentPayable, status) — business-level, no shopId
- [x] Add indexes: Product.businessId+name, Product.businessId+barcode (partial unique — barcode unique per business), Customer.businessId, Supplier.businessId, Category.businessId+name (unique)

### Backend

- [x] Create product service (CRUD, search, low-stock, category filter, barcode lookup)
- [x] Create product controller
- [x] Create product routes (`/api/v1/products`)
- [x] Create category service
- [x] Create category controller
- [x] Create category routes (`/api/v1/categories`)
- [x] Create customer service (CRUD, search, currentDue seeded from openingBalance)
- [x] Create customer controller
- [x] Create customer routes (`/api/v1/customers`)
- [x] Create supplier service (CRUD, search, currentPayable seeded from openingBalance)
- [x] Create supplier controller
- [x] Create supplier routes (`/api/v1/suppliers`)
- [x] Zod validation on all routes (create + update + status schemas)
- [x] All queries scoped by businessId (`resolveBusiness` tenant middleware)
- [x] Soft-delete via status PATCH (ACTIVE/INACTIVE — no hard DELETE; matches Shop convention)
- [x] Units endpoint: global predefined units (`/api/v1/units`) per PRD §8.3 (piece, box, packet, kg, gram, liter, meter, feet, dozen, custom)
- [x] RBAC: product/category writes → Owner/Admin/Manager/Inventory Manager; customer writes → +Accountant/Salesperson; supplier writes → +Accountant; reads → any member; Viewer denied writes (403). Re-checked in services (defense in depth)
- [x] Money as integer paisa end-to-end; server rounds float input with Math.round

### API

- [x] `GET/POST /api/v1/products`, `GET/PUT/PATCH /api/v1/products/:id`, `PATCH /api/v1/products/:id/status`
- [x] `GET /api/v1/products?search=&categoryId=&lowStock=&status=&page=&limit=`
- [x] `GET /api/v1/products/lookup/barcode?barcode=` (registered before `/:id`)
- [x] `GET/POST /api/v1/categories`, `GET/PUT/PATCH /api/v1/categories/:id`, `PATCH /api/v1/categories/:id/status`
- [x] `GET/POST /api/v1/customers`, `GET/PATCH /api/v1/customers/:id`, `PATCH /api/v1/customers/:id/status`
- [ ] `GET /api/v1/customers/:id/ledger` — **DEFERRED to Phase 05** (ledger entries are created by sales/payments)
- [x] `GET/POST /api/v1/suppliers`, `GET/PATCH /api/v1/suppliers/:id`, `PATCH /api/v1/suppliers/:id/status`
- [ ] `GET /api/v1/suppliers/:id/ledger` — **DEFERRED to Phase 05** (ledger entries are created by purchases/payments)
- [x] `GET /api/v1/units` (global predefined units)

### Mobile

- [x] Rebuild Products screen on `authRequest()` + `activeBusinessId` (was broken)
- [x] Product list (search, low-stock chip, category filter chips, pagination with Load More)
- [x] Add product form (all PRD fields incl. category/unit/supplier selectors, wholesale/min price, tax rate, min/max stock, description, image URL)
- [x] Edit product form (tap row; same fields; activate/deactivate inside edit modal)
- [x] Category manager screen (list, add, edit, activate/deactivate, back to products)
- [x] Rebuild Parties screen on `authRequest()` + `activeBusinessId` (was broken)
- [x] Customer list (search, currentDue badge) + supplier list (search, currentPayable badge)
- [x] Add/edit customer form (name, phone, email, address, customerCode, openingBalance, creditLimit)
- [x] Add/edit supplier form (name, phone, email, company, address, openingBalance)
- [x] Activate/deactivate for both parties
- [x] Unit selector (global predefined units, bn/en labels from API)
- [x] Money helpers (`src/money.ts`: taka↔paisa, `formatTaka`) — prices displayed/edited in Taka, stored as paisa
- [x] i18n keys added for all new labels (bn + en)
- [x] Dashboard counts fixed (was calling dead `/api/*` endpoints)
- [ ] Customer/supplier detail + ledger screens — **DEFERRED to Phase 05** (transaction-dependent)

### Testing

- [x] Product CRUD tests (create, get, update, status/soft-delete)
- [x] Product search tests (name, SKU, barcode) + low-stock filter + category filter
- [x] Barcode tests (duplicate 409 per business, same barcode across businesses OK, lookup endpoint)
- [x] Category CRUD tests (incl. duplicate name 409 per business, same name across businesses OK)
- [x] Customer CRUD tests + opening balance → currentDue seeding and delta shift
- [x] Supplier CRUD tests + opening balance → currentPayable seeding and delta shift
- [x] Validation tests (required fields, negative amounts, bad email)
- [x] RBAC tests (Viewer 403 on writes, read allowed; Salesperson can create customers)
- [x] Cross-tenant isolation tests (list/get/create/search all 404 across businesses)
- [x] Units endpoint test

## Acceptance Criteria

- [x] Product CRUD verified (all PRD fields)
- [x] Customer CRUD verified with due tracking (currentDue)
- [x] Supplier CRUD verified with payable tracking (currentPayable)
- [x] Search works (name, SKU, barcode / name, phone, code / name, phone, company)
- [x] Low-stock filter works
- [x] Category filter works
- [ ] Ledger views work — deferred to Phase 05 (no transactions exist yet)
- [x] Soft-delete works (status ACTIVE/INACTIVE)
- [x] All routes business-scoped
- [x] Tests passing (93/93: 42 baseline + 51 new)

## Testing
Run: `cd server && npm run typecheck && npm test` → 93/93 pass, typecheck 0 errors.
Run: `cd mobile && npx tsc --noEmit` → 0 errors.

## Expected Output
- Complete master data API (products, categories, customers, suppliers, units)
- Mobile screens for products, customers, suppliers + category manager
- Due/payable tracking on customer/supplier

## Status
- [x] Not started
- [x] In progress
- [x] Incomplete — Phase completed when all acceptance criteria pass
- **Phase 04 backend + mobile implementation complete. Runtime verification on device pending (no emulator/device available). Ledger views deferred to Phase 05.**