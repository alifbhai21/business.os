# Phase 15 — Future Modules

## Objective
Define future product expansions: AI assistant, due reminders, Google Sheets, accounting periods, payroll, SaaS subscriptions, and FIFO costing.

## Why This Phase Exists
These features are explicitly **OUT of MVP** per PRD §16.3 but are defined in the product roadmap (§15).

## Dependencies
- All MVP phases complete

---

## Phase 15 REPORT (2026-08-24) — EVALUATION & PRIORITIZATION COMPLETE

> **Recovery audit:** workspace clean at `47be7f7` (Phases 13–14 committed),
> zero concurrent agents, zero pre-existing Phase 15 implementation
> artifacts (only docs/MICRO_SAAS_RESEARCH.md market research). Baseline
> gate re-proven unchanged: **660/660 backend · 39/39 real-Atlas · 2/2 perf ·
> typecheck/lint 0 · mobile tsc clean**. One genuine defect found and fixed
> during baseline: once Phases 13–14 files were COMMITTED (previously
> untracked), the secret scanner began flagging four FAKE fixture
> credentials inside redaction/env-gate tests — fixed via an explicit
> intent-marker contract (`fixture`, `example.com`, …) in
> scripts/security-scan.mjs without weakening any assertion; scan now clean
> across all 432 tracked files.

### What this phase required (and delivered)

The PRD (§16.3) explicitly excludes these modules from the MVP, and this
phase's acceptance criteria are evaluation gates — *"Each feature evaluated
and prioritized"* and *"User validates with Bangladesh market before build."*
Building them before owner validation would violate both. The deliverable is
therefore a decision-grade evaluation grounded in the live codebase:

**docs/FUTURE_MODULES_EVALUATION.md** contains:
- an architectural-fit audit mapping each module to the verified engines it
  would reuse (journal engine, transaction/idempotency pattern, notification
  evaluator, export path, state-machine precedent, Employee/Business anchors);
- per-module market rationale, effort sizing (S–XL), risk notes, and
  Bangladesh-market validation questions for the owner;
- a recommended build sequence: **Tier 1** due reminders → Sheet/CSV import →
  period locking; **Tier 2** AI assistant → barcode labels → service jobs;
  **Tier 3** payroll → iOS; **Tier 4** SaaS billing (traction-gated) and FIFO
  (vertical-gated);
- cross-cutting invariants every future build must keep (server-authoritative
  money, transactions, idempotency, double RBAC, strict schemas, JWT device
  identity, bn/en parity).

### Requirement matrix

| Module group | Status |
|---|---|
| Evaluation & prioritization deliverable | ✅ COMPLETE (this phase) |
| Due reminders | DEFINED — Tier 1 · awaits market validation |
| Google Sheets / CSV import | DEFINED — Tier 1 · awaits validation |
| Accounting periods (lock/close) | DEFINED — Tier 1 · awaits validation |
| AI Business Assistant (Bangla) | DEFINED — Tier 2 · needs LLM credential when approved |
| Barcode label printing | DEFINED — Tier 2 |
| Service business jobs module | DEFINED — Tier 2 (Phase 12 deferral resolved here) |
| Payroll | DEFINED — Tier 3 (Employee model lacks payroll fields today) |
| iOS app | DEFINED — Tier 3 · BLOCKED on Apple developer account/device lab |
| SaaS subscriptions + billing | DEFINED — Tier 4 · gated on PRD §18 Stage-4 traction |
| FIFO / batch costing | DEFINED — Tier 4 · XL regression risk, vertical-gated |

### Acceptance criteria status

- [x] Each feature evaluated and prioritized
- [ ] User validates with Bangladesh market before build — **BLOCKED BY DESIGN**
      on owner-led market conversations (PRD §18 Stages 1–2). No module may
      start until this gate clears.

## Status
- [ ] Not started
- [x] In progress → evaluation complete; builds gated on owner market validation
- [ ] Incomplete — Phase completed when validated modules are built in later cycles
