# Phase 15 — Future Modules: Evaluation & Prioritization

**Status:** Evaluation complete · Builds gated on Bangladesh-market validation (per PRD §16.3)
**Date:** 2026-08-24
**Grounding:** PRD §15/§16.3/§18–19, docs/phases/phase-15.md, codebase audit @ commit `47be7f7`

---

## Why nothing was built yet — by design

The PRD draws a hard line (§16.3, *Explicitly OUT of MVP*):

> AI assistant, WhatsApp/SMS reminders, Google Sheets integration, PDF printing,
> barcode label printing, iOS app, subscriptions/billing, FIFO costing,
> accounting-period locking, service-business jobs module.

Phase 15's acceptance criteria are therefore **evaluation and prioritization**:

1. ✅ Each feature evaluated and prioritized *(this document)*
2. ⏸ User validates with Bangladesh market before build *(owner gate — BLOCKED on you)*

Building any of these BEFORE your market validation would violate both the PRD's
strict-MVP rule and its Feature-bloat risk mitigation (§19). What follows grounds
every module in what the codebase ALREADY provides, so post-validation builds
reuse verified engines instead of inventing second architectures.

---

## Architectural-fit audit (evidence from the live codebase)

| Existing asset | Verified location | Reusable by |
|---|---|---|
| Balanced double-entry engine + reversal journals | `services/accounting.service.ts`, Ph07 | Period closing/profit transfer, payroll journals |
| `withTransaction` + exactly-once `localId` indexes | `db/transactions.ts`, Ph05 pattern | Every new mutation below |
| Route+service double RBAC, membership scoping | `middleware/rbac.ts`, `membershipFor` | All modules |
| Notification evaluator (lowStock/due/payable/sync scans, dedupKey) | `services/notification.service.ts`, Ph12 | Due reminders |
| Excel (.xlsx)/CSV export (RFC-4180) | `backup.service.exportCsv/exportExcel`, Ph11/12 | Import (inverse path) & Sheets export |
| Strict Zod entity schemas (`productCreateSchema` etc.) | `validation/*.schemas.ts` | Row-level import validation |
| Opening-stock transactional engine | `inventory.service.setOpeningStock`, Ph06 | Sheets opening-stock import |
| Weighted-average costing + value-preserving void recalc | `purchase.service`, `void.service`, Ph05/06/09 | FIFO must coexist/opt-in vs. replace |
| Invoice print view (escaped HTML) | `invoicePrint.service.ts`, Ph12 | Barcode label sheets |
| State-machine precedent (PENDING→…→CANCELLED) | `models/StockTransfer`, Ph06 | Service jobs lifecycle |
| `Employee` model (name/phone/role/shop, unique index) | `models/Employee.ts`, Ph09 | Payroll anchor records |
| `Business.fiscalYear` field | `models/Business.ts`, Ph03 | Accounting-period defaults |
| Barcode scanning + variant barcodes | Ph12 | Label generation source data |

---

## Module evaluations

### 1. Due reminders — WhatsApp/SMS/shareable messages · **P3 · BUILD FIRST**
- **Market rationale:** Due (বাকি) collection is *the* cash-flow pain for Bangladeshi retail;
  polite Bangla payment nudges recover working capital. The global research scan
  (docs/MICRO_SAAS_RESEARCH.md #1) independently validated invoice-chasing as the
  #1 willingness-to-pay pain ($15–29/mo equivalent).
- **Fit:** The notification evaluator already computes overdue customers/suppliers
  every scan. Shareable Bangla reminder texts render client-side from
  server-authoritative figures (never typed by hand → no wrong amounts);
  `wa.me/<phone>?text=…` deep links require **zero external API**.
- **Authorization invariant:** every send is an explicit user tap; the system NEVER
  auto-messages customers. A ReminderLog (idempotent, dedupKey-style) prevents
  accidental duplicate harassment and gives an audit trail.
- **Effort:** S–M (shareable/deep-link first) · M (scheduling) · L (official
  WhatsApp Business API — separate approval, avoid initially).
- **Validation questions:** Do owners want reminders in their own words? SMS vs
  WhatsApp split? Should reminders stop automatically when a customer pays?

### 2. Google Sheets / CSV / Excel import — **P3 · BUILD SECOND**
- **Market rationale:** Migration friction is the #1 adoption blocker for shops
  keeping catalogs in notebooks/Sheets; bulk onboarding decides week-one retention.
- **Fit:** Exact inverse of the verified export path: parse → row-wise strict Zod
  (`productCreateSchema`/customer/supplier) → dry-run preview report → commit rows
  through existing services inside transactions with `localId` anchors so a failed
  batch retries safely; opening stock flows through `setOpeningStock`.
- **Effort:** M. No external credentials (file-based first; Sheets OAuth later).
- **Validation questions:** Which columns do real shops actually keep? Import
  customers before products, or single mega-sheet?

### 3. Accounting periods (lock/close, profit transfer) — **P3 · BUILD THIRD**
- **Market rationale:** Accountants request year-end locking once real books are
  kept; retroactive edits destroy trust in reports.
- **Fit:** `Business.fiscalYear` exists. A `PeriodLock` model + a guard inside the
  four posting services (sale/purchase/payment/expense) rejects documents dated
  before the lock inside the SAME transaction. Year-close posts closing entries
  through the existing balanced-journal engine (debits===credits enforced),
  following the reversal-journal precedent.
- **Effort:** M. Risk: touching hot posting paths → guarded by the 660-test suite
  plus property-based journal balance test.
- **Validation questions:** Monthly or yearly locks? Who may unlock — Owner only?

### 4. AI Business Assistant (Bangla) — **P3 · after the three above**
- **Market rationale:** Strong differentiator; Bangla-first questioning matches PRD
  positioning. Example queries map 1:1 onto EXISTING server aggregations:
  "এই মাসে আমার profit কম কেন?" → `accounting.profitLoss` month-over-month deltas;
  "কোন customer-এর সবচেয়ে বেশি বাকি?" → top-`currentDue` customers;
  "কোন product stock শেষ হওয়ার পথে?" → low-stock evaluator output.
- **Safety architecture:** the LLM only receives PRE-COMPUTED, tenant-scoped JSON
  summaries produced behind `membershipFor`; it never sees raw DB access or other
  tenants' data; answers cite the underlying report so numbers stay
  server-authoritative.
- **Effort:** M–L · external LLM API credential required.
- **Validation questions:** Pay-worth-it at +$5/mo tier? Voice input needed?

### 5. Barcode label printing — **P4 · small, high-leverage retail win**
- **Fit:** scanning/variants exist; labels = escaped-HTML sheet rendering per the
  invoice-print precedent (browser-print to thermal/laser), price + name + barcode.
- **Effort:** S–M. **Validation:** which label sizes dominate (20×25mm roll? A4?)

### 6. Service-business jobs module — **P4**
- **Fit:** `Business.type` already spans non-retail types; a Job lifecycle mirrors
  the StockTransfer state machine (PENDING→IN_PROGRESS→DONE→DELIVERED/CANCELLED)
  with journals only at money events. (Phase 12 flagged jobs as deferred — this is
  its proper home.)
- **Effort:** M–L. **Validation:** repair-shop workflows: advance payment? parts
  linked to inventory?

### 7. Payroll (salary/attendance/commission/targets) — **P4**
- **Fit gap:** `Employee` lacks salary/attendance fields; commissions additionally
  need sale→employee attribution (Sales currently records creator only in audit).
  Salary payouts journal via the existing EXPENSE leg (salaries category).
- **Effort:** L. **Validation:** informal-pay dominance — is formal payroll wanted
  by ≤10-employee shops, or only commission tracking for sales staff?

### 8. iOS app — **P4**
- Same Expo codebase; EAS builds iOS in the cloud. External: Apple Developer
  account ($99/yr) + device-lab verification (none available today — same honest
  limitation as all prior runtime checks).
- **Validation:** any pilot users on iPhone at all?

### 9. SaaS subscriptions + billing — **P4 · strategic gate**
- **Fit:** plan limits slot in as per-business middleware (rate-limit precedent);
  bKash/Nagad start as manual-verify flows (merchant APIs need approvals).
  Research doc validates the $10–40/mo band broadly, but THIS product's willingness
  to pay is unproven until PRD §18 Stages 2–4 complete.
- **Effort:** L–XL. **Gate:** do not start before ~100 active businesses (Stage 5).

### 10. FIFO / batch costing — **P4 · highest regression risk**
- **Fit warning:** weighted-average cost is woven through purchase finalize, COGS
  snapshots, returns and VOID avgCost reconstruction (value-preservation method).
  FIFO means a parallel cost-layer ledger and an OPT-IN per business, never a
  cutover. Only medicine/chemical verticals truly need batch/expiry.
- **Effort:** XL. **Validation:** is any target vertical expiry-regulated?

---

## Recommended sequencing (post-validation)

```
Tier 1 (weeks):      Due reminders (shareable) → Sheet/CSV import → Period locking
Tier 2 (months):     AI assistant (read-only Bangla) → Barcode labels → Service jobs
Tier 3 (post-traction): Payroll → iOS app
Tier 4 (gated):      SaaS billing (≥Stage-4 traction) · FIFO (vertical pull only)
```

Rationale: Tier 1 items reuse the most verified surface per unit of risk, attack
the strongest BD pain (dues) and the biggest adoption blocker (migration), and
harden accounting trust — while deferring every externally-credentialed or
high-regression-risk build until the pilot proves demand.

## Cross-cutting invariants for ALL future builds

Server-authoritative totals · `withTransaction` for money · localId idempotency ·
double-gate RBAC · strict `.strict()` Zod · deviceId from JWT only · immutable
audit trail · no compensating writes · bn/en parity · offline queue only where
the sync dispatcher is extended deliberately.

## Decision requested from owner

Approve/adjust Tier ordering and answer the per-module validation questions above
against real Bangladesh shop conversations (PRD §18 Stage 1–2). Build starts only
on explicit approval per module.
