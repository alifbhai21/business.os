# Universal Business OS — Product Requirements Document (PRD)

**Product Name:** Universal Business OS
**Document Type:** Product Requirements Document — Android MVP
**Version:** 1.0
**Status:** Product Definition / MVP Planning
**Primary Platform:** 📱 **Android (native mobile app — React Native + Expo)**
**iOS:** Later phase (same codebase, after Android MVP is validated)
**Backend:** Node.js + Express.js + TypeScript + MongoDB Atlas
**Architecture:** Offline-first (SQLite on device) + Cloud Sync
**Initial Market:** Bangladesh 🇧🇩
**Companion Engineering Standard:** `Full-Stack Project Blueprint & Prompt Sheet v2.2` (API conventions, security checklists, and engineering rules in this PRD are derived from that document)

---

## 1. Executive Summary

Universal Business OS is a **mobile-first, Android-first SaaS platform** that replaces the paper notebook (*baki khata*), calculator, and manual stock counting used by small and medium businesses in Bangladesh with one simple, offline-capable app.

A shop owner records a transaction **once** — the app automatically updates stock, customer dues, supplier dues, cash, the accounting ledger, profit, and reports. The app works fully **without internet** and syncs to the cloud when connectivity returns.

**Core promise:**

> Sell, buy, track stock, manage customers, manage dues, control expenses and understand your profit — all from one mobile app, even when you're offline.

The product is **universal**: one core transaction + accounting engine, with business-specific modules (retail, wholesale, service, distribution, etc.) enabled or disabled per business.

---

## 2. Product Vision & North Star

**Vision:** Replace manual paper-based business accounting with a simple, automatic, offline-capable digital system that any non-technical business owner can learn without accounting knowledge.

**North Star:**

> One mobile app that can run the daily operations and financial management of almost any small business — offline first, automatically synchronized, simple enough for a non-technical business owner, and powerful enough to grow into a complete Business OS.

**Positioning:** This is **not** "another accounting app." It is positioned as:

> **A complete mobile Business Operating System for small and growing businesses.**

---

## 3. Problem & Market Opportunity

### 3.1 The problem

Small businesses in Bangladesh currently run on:

```
Paper notebook (baki khata) + Calculator + Excel + WhatsApp
+ Manual stock counting + Manual due tracking + Manual profit guessing
```

This causes: lost records, wrong due calculations, unknown profit, stock leakage, no backup, and dependence on one person's memory.

### 3.2 Target market

| Segment | Examples |
|---|---|
| Retail | Grocery, electronics, clothing, cosmetics, hardware |
| Wholesale / Distribution | Traders, distributors |
| Service | Mobile/computer repair, agencies, cleaning services |
| Construction materials | Rod, cement, paint dealers |
| Small manufacturing | Workshops, small factories |
| Online businesses | F-commerce, e-commerce sellers |
| Mixed | Retail + wholesale combinations |

### 3.3 Why offline-first

Connectivity in shops, markets, and warehouses is unreliable. **The app must never block a sale because the internet is down.** Offline capability is a hard requirement, not a nice-to-have.

### 3.4 Target transformation

```
BEFORE: Paper + Calculator + Excel + WhatsApp + Manual everything
                    ↓
AFTER:  📱 UNIVERSAL BUSINESS OS
        Sales · Purchases · Inventory · Customers · Suppliers
        Expenses · Payments · Accounting · Reports · Multi-Shop
        Offline Mode · Cloud Backup · (Future) AI Assistant
```

---

## 4. Core Product Principles

| # | Principle | Meaning |
|---|---|---|
| 1 | **Simple** | A non-technical owner learns the basics without accounting knowledge. Bangla-first UI. |
| 2 | **Offline-first** | Every core operation works with zero internet. |
| 3 | **Automatic** | Enter a transaction once → stock, dues, cash, ledger, profit, reports all update automatically. |
| 4 | **Scalable** | 1 business → multiple shops → multiple employees → multiple devices. |
| 5 | **Universal** | One common engine; business-type modules toggled on/off. |

---

## 5. Target Users & Roles

### 5.1 Personas

| Role | Primary needs | Default permissions |
|---|---|---|
| **Business Owner** | Full control, profit visibility, multi-shop oversight | Everything |
| **Manager** | Runs one shop day-to-day | Sales, purchases, inventory, customers, shop reports (configurable) |
| **Salesperson** | Fast selling at the counter | Create sales, search products, invoices, collect customer payments. **No** profit/balance-sheet access |
| **Accountant** | Books, payments, reconciliation | Transactions, expenses, payments, accounting reports |
| **Viewer** | Read-only oversight | Reports and registers only |

### 5.2 Role-Based Access Control (RBAC)

Roles: `Owner · Admin · Manager · Accountant · Salesperson · Inventory Manager · Viewer`

Permissions are **granular and configurable**. Example for Salesperson:

```
Create Sale         ✅
View Sale           ✅
Delete Sale         ❌
View Profit         ❌
View Balance Sheet  ❌
```

### 5.3 Multi-shop ownership

One owner account can run multiple shops/branches:

```
Business: Rahman Enterprise
├── Main Branch
├── New Market Branch
├── Warehouse
└── Online Store
```

---

## 6. Multi-Tenancy & Data Hierarchy

The system is **multi-tenant**. A user may own multiple businesses; each business's data is **fully isolated** — no cross-business access without explicit authorization.

```
User
│
├── Business A          ← isolated data boundary
│   ├── Shop 1          ← own stock, cash, sales, staff
│   └── Shop 2
│
└── Business B          ← isolated data boundary
    ├── Shop 1
    └── Warehouse
```

**Every significant record carries:**

```
_id · business_id · shop_id · created_by · created_at · updated_at · status
```

This enables multi-business, multi-shop, permissions, audit, sync, and reporting.

### 6.1 Business entity

Business name, logo, address, phone, email, currency (BDT ৳ default), tax settings, fiscal year (**Bangladesh fiscal year: 1 July – 30 June**), business type.

### 6.2 Shop/Branch entity

Shop name, branch code, address, phone, manager, own inventory, own cash account, own employees.

### 6.3 Shop-to-shop stock transfer

```
Dhaka Branch (PVC Pipe: 100)  →  Transfer 20  →  Khulna Branch (+20)
```

System records: source branch, destination branch, product, quantity, date, user, status (`PENDING → IN_TRANSIT → RECEIVED`), and the corresponding inventory movements at both ends.

---

## 7. Platform Strategy — Android First

| Decision | Detail |
|---|---|
| **Phase 1 ships Android only** | Single platform to validate with the pilot shop. iOS reuses the same React Native/Expo codebase in a later phase. |
| **No web app in MVP** | The web stack in the engineering blueprint (Vite + React) is deferred; it may return later as an admin/back-office panel. |
| **Min Android version** | Android 8.0 (API 26)+ — covers the overwhelming majority of devices in the Bangladeshi market |
| **Language** | **Bangla-first UI with English support**; all user-facing strings localized from day one |
| **Hardware realities** | Camera-based barcode scanning (Google ML Kit via Expo), FCM push notifications, low-end-device performance targets, low mobile-data usage |
| **Distribution** | Google Play Store (APK sideloading allowed for pilot) |

---

## 8. Functional Requirements — Module by Module

Priority tags: **[MVP]** = must ship in first release · **[P2]** = phase 2 · **[FUTURE]** = roadmap

### 8.1 Authentication & Onboarding [MVP]

- Splash → Onboarding → Register → Login → OTP verification → Forgot password
- Email/phone + password; OTP-based verification
- First-launch onboarding flow (must be short for non-technical owners):

```
Welcome → Create Account → Create Business → Select Business Type
→ Create First Shop → Add Products → Add Opening Stock
→ Add Customers → Add Suppliers → Start Selling
```

- **Migration from paper [MVP]:** capture the real-world starting position — opening cash, opening stock, existing customer dues, existing supplier dues, bank balances, opening capital.

### 8.2 Business-Type Configuration [MVP]

No hard-coded single business type. During onboarding the user selects:

```
Retail · Wholesale · Retail + Wholesale · Service · Distribution
Manufacturing · Restaurant · Online Business · Construction · Other
```

The platform activates the relevant modules. Examples:

| Type | Activated modules |
|---|---|
| Retail | Products, Inventory, Sales, Purchases, Customers, Suppliers, Accounting |
| Service | Customers, Services, Jobs/Orders, Invoices, Payments, Expenses (no inventory) |

**Service business support [P2]:** services with prices, jobs/orders, assigned staff — for repair shops, agencies, cleaning services, consultants.

### 8.3 Product Management [MVP]

Product fields: name, SKU, barcode, category, brand, unit, purchase price, selling price, wholesale price, minimum price, tax, discount, current stock, minimum stock, maximum stock, preferred supplier, image, description, active/inactive.

**Units [MVP]:** Piece, Box, Packet, Kg, Gram, Liter, Meter, Feet, Dozen, Custom unit.

**Product variants [P2]:** e.g. T-Shirt → S/M/L/XL; Paint → 1L/5L/20L.

**Barcode system [MVP core]:**

```
Scan Barcode → Product Found → Enter Quantity → Add to Cart
```

- Camera scanning, SKU/barcode lookup, barcode generation
- Barcode label printing: [FUTURE]

### 8.4 Sales Management [MVP]

Supports: cash sale, credit sale (baki), partial payment, full payment, discount, tax, multiple products, walk-in or selected customer, payment method, product return, invoice generation.

**Payment methods:** Cash · Bank · Mobile wallet (bKash/Nagad/Rocket) · Card · Other.

**Automatic sales processing — the core automation:**

```
Sale completed
  → Invoice created
  → Stock decreases
  → Revenue recorded
  → Customer balance updated (if credit)
  → Cash/Bank account updated (amount received)
  → Double-entry journal created
  → Profit calculation updated
```

The user never touches any of these sections manually.

### 8.5 Purchase Management [MVP]

Supplier, products, quantity, purchase price, discount, tax, total, paid amount, due amount, purchase invoice, purchase return.

```
Purchase recorded
  → Stock increases
  → Supplier payable increases
  → Cash decreases (if paid)
  → Double-entry journal created
```

### 8.6 Customer Management [MVP]

Profile: name, phone, address, email, customer code, opening balance, credit limit, photo optional.

Computed automatically: total purchases, total payments, **current due**, full transaction history.

Customer ledger view:

```
Date | Description | Debit | Credit | Balance
```

### 8.7 Customer Due Management [MVP]

- Auto-calculated: total due, paid amount, remaining due, due history, payment history
- Recording "Customer paid ৳5,000" instantly decreases the customer balance
- Due list sorted by amount/age; per-customer statement sharing [P2]
- Due reminders via WhatsApp/SMS/shareable message: [FUTURE] — **only with explicit user authorization per message**

### 8.8 Supplier Management & Dues [MVP]

Profile: name, phone, address, company, opening balance, history, total purchases, total payments, current payable.

```
Supplier Payable = Purchases − Payments
```

Record supplier payments; full supplier ledger available.

### 8.9 Payments & Accounts [MVP]

Every shop has accounts, each with its own automatic ledger:

- **Cash account per shop** (e.g. "Khulna Branch Cash")
- Bank accounts
- Mobile wallets: **bKash, Nagad, Rocket**
- Card, Other

Cash ledger example:

```
Khulna Branch Cash — Opening: ৳50,000
+ Sales cash received:  ৳20,000
− Expenses paid:         ৳3,000
− Supplier payment:      ৳5,000
= Current Cash:         ৳62,000
```

### 8.10 Expense Management [MVP]

Default categories: Rent, Salary, Electricity, Internet, Transport, Maintenance, Marketing, Packaging, Office expense, Other (custom categories allowed).

Each expense records: category, amount, date, shop, payment account, description, receipt photo attachment.

### 8.11 Inventory Management [MVP]

Tracks: opening stock, purchases, sales, sales returns, purchase returns, transfers in/out, adjustments, damaged/lost stock, current stock.

```
Opening Stock + Purchases + Transfers In
− Sales − Transfers Out − Returns ± Adjustments
= Current Stock
```

- **Low stock alerts [MVP]:** per-product minimum stock → ⚠ alert + report
- **Costing method [MVP]:** Average Cost. Profit is calculated from actual transaction cost data — never `Selling Price − Last Purchase Price`.
- FIFO / batch costing: [FUTURE]

### 8.12 Returns [MVP]

**Sales return:** stock increases → revenue reverses → customer balance adjusts.
**Purchase return:** stock decreases → supplier payable adjusts.

### 8.13 Invoice System [MVP]

Invoice includes: business logo & info, invoice number, customer, line items (qty, unit price), discount, tax, total, paid, due, date, salesperson, branch.

Delivery: on-screen view + share as image/text [MVP]; PDF, print, WhatsApp/Email share: [P2].

### 8.14 Double-Entry Accounting Engine [MVP — engine, not UI]

Built into the backend; users never create manual journal entries for normal transactions.

| Event | Journal effect |
|---|---|
| Credit sale | Customer Receivable +10,000 / Sales Revenue +10,000 |
| Customer payment | Cash/Bank +6,000 / Customer Receivable −6,000 |
| Purchase | Inventory +20,000 / Supplier Payable +20,000 |
| Supplier payment | Supplier Payable −10,000 / Cash/Bank −10,000 |

This engine powers: Profit & Loss, Balance Sheet, Cash Flow, General Ledger, Trial Balance, Receivables, Payables.

Full chart-of-accounts UI and manual journals: [P2/Phase 4].

### 8.15 Dashboard & Reports

**Dashboard [MVP]:** today's sales, purchases, expenses, profit; current stock value; customer receivable; supplier payable; cash balance; bank/MFS balance; low stock list; recent transactions.

Owner view: All Business → All Shops → Shop-wise performance.

**Reports:**

| Group | MVP | Later |
|---|---|---|
| Sales | Daily / monthly sales, product-wise, customer-wise | Weekly, employee-wise, shop-wise drill-downs |
| Purchases | Date-wise, supplier-wise, product-wise | Shop-wise |
| Inventory | Current stock, stock valuation, low stock | Stock movement, dead stock, fast-moving |
| Financial | Basic profit report, receivable, payable, expense report | Full P&L, Balance Sheet, Cash Flow, Trial Balance, General Ledger |

Export: CSV/Excel [P2], PDF [P2].

### 8.16 Employees & Devices [MVP]

Employee profile: name, phone, role, branch, status, permissions. (Salary, attendance, commission, targets: [FUTURE].)

**Device management [MVP]:** each registered device records device ID, name, user, branch, app version, last sync, last activity. Owner can **revoke** a device remotely.

```
My Devices
├── Samsung A55 — Khulna Branch — Last Sync: 2 minutes ago
└── Redmi Note — Dhaka Branch — Last Sync: 15 minutes ago
```

### 8.17 Audit Log [MVP]

Every sensitive action is logged: user, action, affected record (e.g. invoice number), time, branch.

Tracked: login, sale create/edit/delete, refunds, payments, stock adjustments, price changes, permission changes.

**Rule:** financial records are **voided/reversed, never physically deleted.**

### 8.18 Quick Actions & Search [MVP]

Home-screen quick actions — a sale must be creatable in a few taps:

```
+ Sale   + Purchase   + Customer Payment   + Supplier Payment   + Expense   + Stock Transfer
```

Global search across: products, customers, suppliers, invoices, transactions, SKU, barcode, phone number.

### 8.19 Notifications [MVP]

FCM push + in-app: low stock, customer due, supplier due, sync failures, backup completed, payment reminders, important business alerts.

### 8.20 Backup & Restore [MVP]

- Continuous automatic cloud backup (MongoDB Atlas is the backup source)
- Restore on login to a new device
- Data export: CSV/Excel [P2], PDF reports [P2]

---

## 9. Offline-First Architecture & Sync Engine [MVP — CORE]

### 9.1 Flow

```
React Native (Android) → SQLite (local operational storage) → local transaction committed
→ Sync Queue → (internet available) → Node.js API → MongoDB Atlas
```

**Offline-capable operations:** create sale, create purchase, add customer, add supplier, add product, record payment, record expense, view reports from local data.

### 9.2 Sync metadata

Every local transaction carries:

```
local_id (client-generated UUID — created offline)
server_id (assigned on sync)
sync_status · created_at · updated_at · device_id · version (for optimistic concurrency)
```

**Statuses:** `PENDING → SYNCING → SYNCED` · `FAILED` (auto-retried with backoff) · `CONFLICT`

### 9.3 Conflict policy (initial version)

| Data type | Policy |
|---|---|
| Transaction records (sales, purchases, payments, expenses) | **Immutable** — never edited, corrections via reversing entries |
| Master data (products, customers, suppliers) | Server-authoritative; last-write-wins by field-level timestamp; conflicts logged |
| Unresolvable conflicts | Conflict log retained; user notified for manual resolution |

### 9.4 Sync API

```
POST /api/v1/sync/push   (client pushes PENDING ops, idempotent by local_id + device_id)
POST /api/v1/sync/pull   (client pulls changes since last cursor)
```

Retries are automatic; sync success rate is a tracked KPI (§17).

### 9.5 Local SQLite schema (operational minimum — not a blind copy of MongoDB)

```
local_business · local_shop · local_products · local_customers · local_suppliers
local_sales · local_sale_items · local_purchases · local_payments · local_expenses
local_inventory · sync_queue · sync_metadata
```

---

## 10. Technical Architecture

### 10.1 System diagram

```
                        UNIVERSAL BUSINESS OS
                                 │
                   ┌─────────────┴─────────────┐
                   │                           │
             📱 Android App               ☁️ Cloud
                   │                           │
         React Native + Expo              Node.js
                   │                      Express.js
                   ↓                           │
               SQLite                          ↓
                   │                    MongoDB Atlas
                   │                           │
                   └──────── Sync ─────────────┘
                                 │
                          Business Engine
        ┌───────────────┬────────┼────────┬───────────────┐
        ↓               ↓        ↓        ↓               ↓
      Sales         Purchase  Inventory  Accounting     Reports
                                 │
                          AI Assistant (Future)
```

### 10.2 Mobile stack (Android)

```
React Native + Expo (TypeScript, strict)
Expo Router
expo-sqlite (offline storage)
TanStack Query (server state)
Zustand (client state)
expo-camera + Google ML Kit (barcode)
expo-secure-store (token storage — Android Keystore backed)
FCM via expo-notifications (push)
i18n: Bangla + English
```

### 10.3 Backend stack

Per the engineering blueprint (all versions verified per that document's **Version Safety Rule** — never copied from docs):

```
Node.js (current Active LTS) · Express · TypeScript (strict)
Mongoose + MongoDB Atlas · Zod validation
JWT (access + refresh) · bcryptjs · helmet · cors · express-rate-limit
express-mongo-sanitize · Winston logging · Sentry monitoring
```

Backend modules:

```
/auth /users /businesses /shops /products /categories /customers /suppliers
/sales /purchases /payments /expenses /inventory /transfers /accounting
/reports /sync /notifications /audit /settings
```

Layering (separation of concerns — no business logic in route handlers):

```
Routes → Controllers → Services → Repositories/Data Access → MongoDB
```

### 10.4 API conventions (from blueprint — binding for this product)

- Versioned prefix: `/api/v1/`
- Business- and shop-level authorization enforced on **every** endpoint
- Ownership checks everywhere (`assertOwnership` helper — always 404, never 403, on wrong-business access)
- Pagination on all list endpoints

**Response shapes (uniform):**

```jsonc
// Success
{ "success": true, "data": { ... } }
// Paginated
{ "success": true, "data": [...], "pagination": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 } }
// Error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "fields": { "email": ["Invalid email"] } } }
```

**Core endpoints:**

```
POST /api/v1/auth/register · /auth/login · /auth/refresh
GET|POST /api/v1/businesses · /shops · /products · /customers · /suppliers
PUT /api/v1/products/:id
POST|GET /api/v1/sales · /purchases · POST /api/v1/payments
GET /api/v1/reports/profit-loss · /reports/inventory · /reports/sales
POST /api/v1/sync/push · /sync/pull
GET /health (liveness) · GET /ready (readiness)
```

Every endpoint is documented using the blueprint's API documentation template (description, auth, role, request, all response codes, Postman example, use cases, business rules).

### 10.5 MongoDB collections

```
users · businesses · shops · memberships · roles · permissions · devices
products · categories · product_variants
customers · suppliers
sales · sale_items · sale_returns
purchases · purchase_items · purchase_returns
payments · expenses
inventory_movements · stock_transfers
accounts · journal_entries · journal_entry_lines
invoices · notifications · audit_logs · sync_events · settings
```

Indexes designed around actual query patterns (business_id + shop_id + date is the dominant access pattern).

### 10.6 Transaction integrity

A sale is **one logical transaction**: create sale + decrease inventory + create receivable + create journal entry + create payment entry. If any step fails, nothing is partially committed — MongoDB multi-document transactions used where appropriate. No partial financial data, ever.

### 10.7 Money & time rules

| Concern | Rule |
|---|---|
| Money | Stored as **integers in paisa** (৳ × 100) — never floats. Displayed as ৳ with Bangla formatting |
| Time | Stored in **UTC**; rendered in **Asia/Dhaka (UTC+6)** |
| Fiscal year | Bangladesh fiscal year 1 July – 30 June (configurable) |
| IDs | Server: MongoDB ObjectId; offline-created records use client UUID (`local_id`) mapped to `server_id` on sync |

---

## 11. Security Requirements [MVP]

Adapted from the blueprint security checklists for a **native Android app**:

### Authentication & tokens

- JWT access token: **15 minutes**, sent in `Authorization: Bearer` header
- Refresh token: **30 days** (extended for mobile UX), **rotated on every use**; reuse of an old refresh token revokes all sessions for that user (breach signal)
- Tokens stored in **expo-secure-store** (Android Keystore) — never in AsyncStorage/plain files
- Passwords hashed with bcrypt (cost ≥ 10); never stored or logged in plain text
- Account lockout: 5 failed attempts → 15-minute lock
- Device authentication: each device registered and revocable (§8.16)

### API & data protection

- helmet, explicit CORS allowlist, `express.json({ limit: '10kb' })`, express-mongo-sanitize
- Rate limiting: global API limit + strict auth-route limit; `/health` excluded
- Zod validation on every route body/query/params
- All queries scoped by `business_id` (+ `shop_id`) — cross-tenant access impossible
- Soft-delete pattern on master data; financial records voided, never deleted
- `crypto.timingSafeEqual` for all token comparisons
- Audit log on all sensitive actions (§8.17)
- Winston structured logging with **no secrets/PII**; Sentry with sensitive-data scrubbing
- HTTPS enforced; Atlas IP allowlist + restricted DB user
- Local SQLite contains operational business data only; credentials never in SQLite

### Compliance posture

- No message (WhatsApp/SMS reminder) ever sent without explicit user authorization
- Data export endpoint for account portability
- `npm audit` clean (zero high/critical) before every release; Dependabot/Snyk monitoring; `npm ci` in CI

---

## 12. Android App Screen Map

**Authentication:** Splash · Onboarding · Login · Register · Forgot password · OTP verification

**Business setup:** Create business · Business type · Shop setup · Currency · Tax · Initial settings

**Main app:** Dashboard · Sales · Purchases · Products · Inventory · Customers · Suppliers · Expenses · Payments · Accounts · Reports · Settings · Employees/Permissions · Devices · Sync status

---

## 13. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | Fast cold start on low-end Android (2–3 GB RAM); smooth product search with 5,000+ products locally |
| Offline | 100% of daily operations work with zero connectivity |
| Sync | Reliable, idempotent, auto-retrying; sync success rate ≥ 99.5% |
| Data safety | SQLite + Atlas cloud backup + restore path; crash recovery without data loss |
| Network | Low mobile-data usage (delta sync, compressed payloads) |
| Battery | No aggressive background polling; sync on connectivity change + app foreground |
| API | Scalable, indexed queries, monitored, error-logged; p95 response < 500ms for core reads |
| Observability | Crash reporting, error monitoring, audit logs, sync event logs |

---

## 14. SaaS Subscription Model [Phase 7]

| Plan | Includes |
|---|---|
| **Free** | 1 business, 1 shop, limited products, basic sales, basic reports |
| **Basic** | Unlimited products, customer/supplier dues, inventory, reports, cloud backup |
| **Pro** | Multiple shops, employees/RBAC, advanced accounting & reports, multi-device sync, (later) AI assistant |
| **Business** | Advanced roles, large inventory, many branches, advanced analytics, priority support |

⚠️ Pricing must be validated with the Bangladesh market (pilot businesses) before launch. Billing via local payment rails (bKash/Nagad) when subscription phase begins.

---

## 15. Product Roadmap

| Phase | Scope |
|---|---|
| **1 — Foundation** | Expo Android app, Express+Atlas backend, auth, business, shop, users, roles |
| **2 — Core Business** | Products, categories, customers, suppliers, sales, purchases, payments, expenses |
| **3 — Inventory** | Stock movements, returns, transfers, low-stock alerts, barcode; variants |
| **4 — Accounting** | Chart of accounts, double-entry engine, journals, GL, trial balance, P&L, Balance Sheet, Cash Flow |
| **5 — Offline** | SQLite, offline transactions, sync queue, push/pull, conflict handling, device management |
| **6 — Reports** | Owner + shop dashboards, sales/purchase/inventory/financial reports |
| **7 — SaaS** | Subscriptions, billing, feature limits, team management |
| **8 — Advanced** | AI assistant, WhatsApp integration, Google Sheets, advanced analytics, FIFO/batch costing |

> Note: Phases 1–5 overlap heavily in practice — the MVP ships a **vertical slice**: foundation + core business + inventory basics + offline sync + basic profit reports.

---

## 16. MVP Definition & Acceptance Criteria

### 16.1 MVP scope

```
Authentication · Business · Shop · Users/RBAC
Products · Customers · Suppliers
Sales · Purchases · Payments · Expenses
Inventory (movements, low stock) · Customer Due · Supplier Due
Basic Profit · Basic Reports · Invoice
Offline SQLite · MongoDB Sync · Cloud backup/restore
```

**MVP goal:**

> A real shop should be able to stop depending on a paper notebook for daily sales, purchases, stock and due management.

### 16.2 Acceptance criteria — the MVP is successful when a real business can:

1. Create its business
2. Create one or more shops
3. Add products
4. Add opening stock
5. Add customers and suppliers
6. Sell products
7. Purchase products
8. Record customer payments
9. Record supplier payments
10. Record expenses
11. Have inventory update automatically
12. Have customer dues calculated automatically
13. Have supplier dues calculated automatically
14. Generate invoices
15. Work without internet
16. Store offline transactions locally
17. Synchronize with MongoDB when internet returns
18. Recover data from cloud backup
19. View basic sales, stock and profit reports
20. Let multiple authorized users operate the business per their roles

### 16.3 Explicitly OUT of MVP

AI assistant, WhatsApp/SMS reminders, Google Sheets integration, PDF printing, barcode label printing, iOS app, subscriptions/billing, FIFO costing, accounting-period locking, service-business jobs module.

---

## 17. Success Metrics

| Category | Metrics |
|---|---|
| **Activation** | Business created · first product added · first sale completed |
| **Engagement** | Daily active businesses · sales recorded per business · transactions per day |
| **Retention** | 7-day · 30-day · monthly active businesses |
| **Business value** | Transactions recorded · stock items managed · dues managed · expenses recorded |
| **Technical** | Sync success/failure rate · crash-free rate · API p95 latency · offline transaction success rate |

---

## 18. Pilot & Go-To-Market Strategy

```
Stage 1 → The pilot hardware shop (family shop) — instrument everything, log every usability failure
Stage 2 → 3–5 local businesses
Stage 3 → 10–20 businesses
Stage 4 → 100+ businesses
Stage 5 → Paid SaaS (plans from §14)
```

Do **not** try to sell to 1,000 businesses immediately. Track every failure and usability problem at each stage.

---

## 19. Critical Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Too complicated for non-technical owners | Extremely simple Bangla-first UI; onboarding under 10 minutes; pilot feedback loops |
| Accounting errors | Dedicated engineering + test suite for the accounting engine; property-based tests on journal balance |
| Data loss | SQLite + Atlas backup + restore flow; immutable transactions |
| Sync conflicts | Immutable transaction records, server-authoritative master data, conflict logs |
| Slow data entry | Quick actions, barcode scanning, smart defaults, fuzzy search |
| Feature bloat | Modular feature activation by business type; strict MVP gate |

---

## 20. Future Modules (post-MVP, defined but not built)

- **AI Business Assistant** — answers in Bangla from authorized business data only: *"এই মাসে আমার profit কম কেন?", "কোন customer-এর সবচেয়ে বেশি বাকি?", "কোন product stock শেষ হওয়ার পথে?"*
- **Due reminders** — WhatsApp/SMS/shareable payment messages (with explicit per-message authorization)
- **Google Sheets** — import (products, customers, suppliers, opening stock via CSV/Excel/Sheets) and export; Sheets is an integration source, never the core database
- **Accounting periods** — fiscal-year closing, locked periods, profit transfer
- **Payroll** — salary, attendance, commission, sales targets

---

## Appendix A — How this PRD maps to the Engineering Blueprint

| Blueprint section | Application in this product |
|---|---|
| Version Safety Rule | Every dependency verified via npm + advisory search before pinning; no versions copied from docs |
| Repo structure | Backend follows the blueprint's `modules/` layout exactly; mobile replaces the Vite frontend with the Expo app |
| Env validation | Zod-validated `.env`, crash on bad config |
| Middleware stack | Sentry → helmet → CORS → body limit → mongo-sanitize → rate limit → routes → error handler |
| Error/success shapes | Adopted verbatim (§10.4) |
| Token standard | Adapted for native Android: refresh token in secure storage instead of HttpOnly cookie; rotation + reuse detection retained |
| Security checklists | Backend checklist fully adopted; frontend checklist adapted (secure-store instead of in-memory token store; no DOM/XSS surface in RN; forms validated with Zod) |
| API docs + Postman | Every endpoint documented per template; collection committed under `backend/postman/` |
| CI baseline | `npm ci`, typecheck, lint, test, `npm audit --audit-level=high` on every PR |

---

## Appendix B — Glossary

| Term | Meaning |
|---|---|
| Baki / Due | Credit owed by a customer (receivable) or to a supplier (payable) |
| MFS | Mobile Financial Service — bKash, Nagad, Rocket |
| Offline-first | App is fully functional without internet; cloud is a sync/backup layer |
| Sync queue | Local list of un-synced operations with status tracking |
| Multi-tenant | One system serving many businesses with fully isolated data |
| Average cost | Inventory costing: cost = moving weighted average of purchase costs |

---

*End of PRD — Universal Business OS (Android MVP), v1.0*
