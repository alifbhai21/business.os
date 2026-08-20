# Universal Business OS — Development Roadmap

**Date:** 2026-08-17
**Auditor:** Lead Software Architect

---

## Target Architecture

```
📱 Mobile App (React Native + Expo)
        ↓
Local SQLite (offline-first)
        ↓
Sync Queue (push/pull)
        ↓
Node.js + Express API (TypeScript)
        ↓
MongoDB Atlas
```

This architecture is **confirmed by the PRD** (§10.1) and aligns with the current `mobile/` + `server/` directory structure. The ZIP files (Next.js web apps) serve as **business logic reference only** — their web frontend and PostgreSQL stack are **discarded**.

---

## Phase Overview

| Phase | Name | Priority | Dependencies | Est. Tasks |
|---|---|---|---|---|
| 01 | Foundation & Project Setup | P0 | None | 20 |
| 02 | Authentication & Security | P0 | 01 | 30 |
| 03 | Business & Shops | P0 | 02 | 25 |
| 04 | Products, Customers & Suppliers | P0 | 03 | 35 |
| 05 | Sales, Purchases & Payments | P0 | 04 | 45 |
| 06 | Inventory, Returns & Transfers | P0 | 05 | 35 |
| 07 | Double-Entry Accounting Engine | P0 | 05 | 30 |
| 08 | Dashboard & Reports | P0 | 05, 07 | 30 |
| 09 | Employees, Roles & Devices | P1 | 03 | 25 |
| 10 | Offline SQLite & Sync Engine | P0 | 05 | 40 |
| 11 | Backup & Restore | P1 | 10 | 15 |
| 12 | Enhancements (Barcode, Notifications, Exports) | P2 | 04, 08 | 25 |
| 13 | Testing, CI/CD & Deployment | P0 | All | 25 |
| 14 | Production Hardening & Monitoring | P1 | 13 | 20 |
| 15 | Future (AI, WhatsApp, SaaS) | P3 | — | 20 |

**Total estimated tasks: ~400**

---

## Phase Details

### Phase 01 — Foundation & Project Setup
- Server: Express + TS + Mongoose scaffold, env validation, middleware stack, health/ready endpoints
- Mobile: Expo project, navigation, theme, i18n dictionaries, API client, secure-store
- Git: repo init, .gitignore, README
- Fix broken mobile imports (api.ts, theme.ts, dictionaries.ts)

### Phase 02 — Authentication & Security
- Register, login, refresh token rotation, logout, OTP, forgot password
- JWT middleware, RBAC, rate limiting, helmet, CORS, Zod validation
- Account lockout, secure token storage

### Phase 03 — Business & Shops
- Business schema/model, shop schema/model, business types, module activation
- Multi-shop creation, shop-specific data scoping
- Onboarding flow (business → shop → opening setup)

### Phase 04 — Products, Customers & Suppliers
- Product CRUD, categories, brands, units, SKU/barcode, pricing, stock
- Customer CRUD with due tracking, credit limit
- Supplier CRUD with payable tracking
- Search, filtering, low-stock

### Phase 05 — Sales, Purchases & Payments
- Sale creation with full automation (stock, customer due, cash, journal)
- Purchase creation with full automation (stock, supplier payable, cash, journal)
- Payment methods (cash, bank, bKash, Nagad, Rocket, card)
- Customer/supplier payment recording
- Expenses, accounts (cash/bank/MFS)
- Invoice generation

### Phase 06 — Inventory, Returns & Transfers
- Stock movements (sale, purchase, return, transfer, adjustment, damage)
- Sales returns, purchase returns
- Stock transfers between shops
- Average cost tracking
- Low stock detection

### Phase 07 — Double-Entry Accounting Engine
- Chart of accounts, journal entries, journal lines
- Automatic journaling for all transactions
- General ledger, trial balance
- P&L, Balance Sheet, Cash Flow

### Phase 08 — Dashboard & Reports
- Owner dashboard (today's sales, profit, receivables, payables, cash, low stock)
- Sales/purchase/inventory/financial reports
- Quick actions, global search

### Phase 09 — Employees, Roles & Devices
- Employee management, role assignment, branch assignment
- RBAC permissions, shop permissions
- Device registration, revoke, last-sync tracking
- Audit log with full coverage

### Phase 10 — Offline SQLite & Sync Engine
- expo-sqlite setup, local schema, migrations
- Offline products/customers/suppliers/sales/purchases/payments/expenses
- Sync queue with status tracking, retry with backoff
- Push/pull API with idempotency, conflict handling
- Sync status UI

### Phase 11 — Backup & Restore
- Cloud backup strategy (MongoDB Atlas)
- Restore on new device
- Data export

### Phase 12 — Enhancements
- Barcode scanning (ML Kit camera)
- FCM push notifications
- CSV/Excel export
- Product variants
- PDF/print invoices
- Chart of accounts UI

### Phase 13 — Testing, CI/CD & Deployment
- Unit/integration/API/database tests
- Offline/sync/security tests
- CI pipeline (npm ci, typecheck, lint, test, audit)
- Deployment: Atlas, Vercel/Render/Railway, Play Store

### Phase 14 — Production Hardening & Monitoring
- Sentry, Winston logging
- Performance optimization
- Security hardening
- Load testing

### Phase 15 — Future
- AI assistant, WhatsApp integration, Google Sheets
- SaaS subscriptions, FIFO costing, payroll

---

## Phase Prioritization Logic

1. **Phase 01** must come first — everything depends on it
2. **Phase 02** blocks all authenticated features
3. **Phases 03-06** form the core business MVP
4. **Phase 07** accounting should be built alongside 05 (auto-journaling on transactions)
5. **Phase 10** offline/sync is a PRD core requirement and can be built incrementally alongside 04-06
6. **Phase 13** testing/CI/CD must be integrated continuously, not just at the end

---

## Recommended Execution Order

```
Phase 01 → Phase 02 → Phase 03 → Phase 04 → Phase 05
   → Phase 06 → Phase 07 → Phase 08 → Phase 09 → Phase 10
   → Phase 11 → Phase 12 → Phase 13 → Phase 14 → Phase 15
```

**Note:** Phases 05 and 07 overlap — the accounting engine should be designed in Phase 05 but fully implemented in Phase 07. Testing infrastructure (Phase 13) should be established from Phase 02 onward, with each phase adding its tests.