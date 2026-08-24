# Phase 12 — Enhancements

## Objective
Implement barcode scanning, FCM push notifications, CSV/Excel export, product variants, PDF/print invoices, and chart of accounts UI.

## Dependencies
- Phase 04 — Products, Customers & Suppliers
- Phase 08 — Dashboard & Reports

## Status

> **Phase 12 VERIFIED (2026-08-24):** Recovery audit found substantial
> existing infrastructure (barcode lookup API from Phase 04, invoice
> serializer from Phase 05, RFC-4180 CSV exporter from Phase 11) with the
> remaining requirements genuinely missing. Baseline re-proven first:
> 577/577 tests, typechecks clean, Atlas 34/34. The uncommitted Phase 09–11
> work was preserved untouched.
>
> **Server.**
> - Chart of accounts: `GET /api/v1/accounting/chart` serves the canonical
>   config (`config/accounts.ts`) grouped by type with normal balances plus
>   the expense-category→journal-account map. No AccountChart collection by
>   design — one source of truth. RBAC = accounting personas at route+service.
> - In-app notifications: new `Notification` / `NotificationRead` /
>   `NotificationPreference` models. Materialization is LAZY and IDEMPOTENT —
>   `GET /notifications` upserts rows for every currently-true condition via a
>   unique `{businessId, dedupKey}` index (`LOW_STOCK:<productId>:<day>`,
>   `CUSTOMER_DUE:<customerId>:<day>` when due ≥ credit limit,
>   `SUPPLIER_DUE:<supplierId>:<day>`, `SYNC_FAILURE:<syncEventId>` once per
>   failed event). ZERO writes inside verified financial transactions; read
>   state is per-user; preferences only SUPPRESS types at read time.
>   Endpoints: list (+unreadCount), mark-read (idempotent), read-all,
>   get/put per-user preferences.
> - Product variants: embedded `Product.variants[]` {name, sku, barcode,
>   priceAdjustmentPaisa} — case-insensitive unique names, business-wide
>   variant-barcode uniqueness (shared scanner namespace), max 20. Barcode
>   lookup now resolves variant barcodes too (top-level shape preserved;
>   adds `matchedVariant`). Sale lines accept an optional `variantName` that
>   is RESOLVED against the product's catalog server-side (unknown → 400),
>   snapshotted onto the line, and its price delta feeds the DEFAULT unit
>   price only — totals stay server-computed and stock stays product-level
>   so the verified sale/void/return engines are untouched.
> - Custom expense categories: `Business.customExpenseCategories[]`
>   (uppercase, ≤15 × 30 chars) editable through business update (Owner/
>   Admin + audit row). Expense validation moved to the service union of
>   built-ins + customs (still 400 on unknown); journal naming reuses
>   `expenseAccountName` unchanged, so reports/P&L group custom categories
>   automatically.
> - Offline inventory movements (Phase 10 deferred item): StockMovement
>   gained a nullable `localId` behind a unique partial
>   `{businessId, refType, localId}` index; adjust/opening services do
>   in-transaction pre-check + duplicate-key recovery — ONE queued op =
>   ONE stock mutation, retry/concurrency add nothing. `/sync/push`
>   dispatches `inventory_adjust` / `inventory_opening` through the exact
>   online Zod schemas and services.
> - Printable invoices: `GET /invoices/:type/:id/print` renders the
>   authoritative Invoice projection into escaped UTF-8 HTML (browser print
>   dialog saves PDF; chosen over pdfkit because pure-JS PDF cannot shape
>   Bangla complex scripts). requireAuth additionally accepts
>   `?access_token=` for this browser flow (header form still preferred).
> - Excel export: `GET /api/v1/export/excel?type=…` produces real .xlsx via
>   exceljs from the SAME tabular projection as CSV (shared builder), same
>   `data:export` permission + DATA_EXPORTED audit rows.
>
> **Bugs found & fixed en route.**
> 1. REAL timezone bug (pre-existing, latent): bare `YYYY-MM-DD` date-range
>    bounds used local `setHours(23,59,59)` in report.service AND
>    accounting.service — after ~18:00 UTC in UTC+6 the "today" window
>    excluded same-day sales. Fixed to whole-UTC-day bounds in both layers
>    (dashboard's self-consistent local "today" left untouched per its
>    documented limitation). Caught because three Atlas runs failed
>    `/reports/sales reconcile`; root-caused with a live probe before fixing.
> 2. Expense model's mongoose-level enum would have 500'd custom categories
>    — replaced by the service-side union validation.
> 3. The grown Atlas suite exceeded the hardcoded 100 req/min limiter —
>    limiter ceiling is now env-configurable (`RATE_LIMIT_MAX`, default
>    unchanged) and the harness runs with it raised via cross-env.
>
> **Mobile.** expo-camera ~57.0.4 installed. BarcodeScannerModal (CameraView +
> permission flow + manual-entry fallback) wired into the Sales create modal:
> scan → tenant-scoped lookup → cart line prefilled with the variant-aware
> price. Notifications screen (list/unread/mark-all) wired via Settings;
> Accounting hub gained a Chart-of-Accounts section rendered from the server
> payload; Business Settings edits custom categories; Expenses merges them
> into the category chips; adjust/opening modals now queue offline through
> authMutation with the two new op types; sale rows share an invoice summary
> and open the print view. bn/en parity asserted 428/428.
> Mobile runtime verification pending (no emulator/device available).
>
> **Verification.** 23 new backend tests (test/enhancements.test.ts): chart
> content/RBAC/isolation; notification materialization idempotency, unread
> lifecycle, preference suppression without deleting rows, auth/isolation/
> validation; variant CRUD guards (duplicate names, barcode collisions),
> variant barcode lookup, inactive-product sellable-not-scannable semantics,
> sale snapshot + default-price delta + unknown-variant rejection; custom
> category journaling (balanced, account named "Delivery", balance math),
> caps/RBAC/cross-tenant; queued inventory_adjust/opening exactly-once with
> retry + concurrency + CONFLICT isolation; print HTML escaping + scope +
> validation; Excel workbook parsed back and reconciled with raw documents +
> permission gate. Real Atlas 39/39: chart over HTTP, deduped low-stock rows
> persisted in Atlas, variant lookup against live docs, offline adjust
> exactly-once under retry AND concurrency, Excel rows == Atlas sales count.
> Full suite 600/600 (577 baseline preserved); npm test exits 0; backend/
> mobile typechecks 0 errors.

## Tasks

### Mobile

- [x] Barcode scanning (expo-camera CameraView, SDK-57 aligned)
- [x] Scan Barcode → Find Product → Add to Cart flow (server-resolved)
- [ ] FCM push notifications setup — BLOCKED (no Firebase project/credentials available); Device.fcmToken field shipped as infrastructure
- [x] In-app notifications (low stock, customer due, supplier due, sync failures)
- [x] CSV export (Phase 11) / [x] Excel export (exceljs .xlsx)
- [x] PDF/print invoices (authoritative print view; browser/native print → PDF)
- [x] Product variants (S/M/L/XL catalog + pricing snapshot)
- [x] Chart of accounts UI (Accounting hub section)
- [x] Custom expense categories
- [ ] Service business jobs module (P2) — DEFERRED (see below)

### Backend

- [x] Notification service (in-app engine + per-user preferences)
- [ ] FCM delivery integration — BLOCKED (external dependency: Firebase credentials)
- [x] Export service (CSV — Phase 11, regression-proven)
- [x] Export service (Excel)
- [x] Product variant model + API
- [x] Chart of accounts service + API
- [x] Notification preference settings

### Testing

- [x] Barcode scanner tests (lookup security matrix incl. inactive products)
- [x] Notification tests (materialize/dedupe/read/prefs/isolation)
- [x] Export tests (Excel workbook reconciliation; CSV regression intact)
- [x] Product variant tests
- [x] Real-Atlas verification for every new mutation surface

## Acceptance Criteria

- [x] Barcode scanning works (scanner identifies; all authorization stays server-side)
- [ ] Push notifications configured — BLOCKED (no Firebase credentials in environment); full in-app system + token infrastructure delivered instead
- [x] CSV/Excel export works
- [x] Product variants supported
- [x] Chart of accounts UI works
- [x] Tests passing (600/600 + 39/39 real-Atlas)

## Known Limitations / Deferred

- **FCM push delivery BLOCKED** by external dependency: no Firebase project/service account exists in this environment. Everything short of the HTTP call to FCM exists: Device.fcmToken storage, notification records, per-user preferences.
- **Service jobs module DEFERRED**: flagged P2 inside this P2 phase with zero supporting infrastructure anywhere in the PRD phases; forcing it would risk quality. Proposed starting point recorded below.
- True server-side PDF generation deferred deliberately: pure-JS generators do not perform OpenType complex-script shaping required for correct Bangla rendering; the print view renders Bangla correctly through platform text stacks.
- Print URLs carry the access token in the query string (browser limitation); tokens are short-lived JWTs, never logged (logger prints req.path without query).
- Variant stock remains product-level (documented design decision protecting the verified stock/journal engines).
- Mobile runtime verification pending (no emulator/device).

## Testing

Run: `cd server && npm run typecheck && npm test && npm run test:atlas`

## Status
- [ ] Not started
- [ ] In progress
- [x] Incomplete — Phase completed when all acceptance criteria pass
