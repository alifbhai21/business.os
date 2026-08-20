/**
 * Invoice numbering helpers.
 *
 * The sequence itself always comes from the atomic BusinessCounter
 * (counter.service.nextSequence) — never countDocuments()+1. These helpers
 * only decide the human-readable label wrapped around that sequence.
 */

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * Fiscal-year start month (1–12) parsed from a Business.fiscalYear setting
 * such as "1 July - 30 June". Falls back to January when unparseable, so a
 * malformed setting can never throw during a sale.
 */
export function fiscalYearStartMonth(fiscalYearSetting?: string | null): number {
  if (!fiscalYearSetting) return 1;
  const first = fiscalYearSetting.toLowerCase().split(/[-–—]/)[0] ?? "";
  for (let i = 0; i < MONTHS.length; i++) {
    if (first.includes(MONTHS[i])) return i + 1;
  }
  return 1;
}

/**
 * Fiscal year label for a date. With a July start, 2026-08-20 falls in fiscal
 * year 2026 and 2026-03-20 falls in fiscal year 2025.
 */
export function fiscalYearOf(date: Date, fiscalYearSetting?: string | null): number {
  const startMonth = fiscalYearStartMonth(fiscalYearSetting);
  const month = date.getMonth() + 1;
  return month >= startMonth ? date.getFullYear() : date.getFullYear() - 1;
}

/**
 * Document number for a shop-scoped sequence.
 *
 * The BusinessCounter sequence is per (business, shop), while invoice numbers
 * must be unique per BUSINESS. The shop's branchCode — already unique within
 * the business — is therefore part of the number, so two branches can both be
 * on sequence 1 without colliding:
 *   formatDocumentNo("INV", 2026, 1, "MAIN") → "INV-2026-MAIN-0001"
 * Omitting the scope yields the plain form: "INV-2026-0001".
 */
export function formatDocumentNo(
  prefix: string,
  fiscalYear: number,
  sequence: number,
  scope?: string | null
): string {
  const seq = String(sequence).padStart(4, "0");
  const trimmedScope = scope?.trim();
  return trimmedScope
    ? `${prefix}-${fiscalYear}-${trimmedScope}-${seq}`
    : `${prefix}-${fiscalYear}-${seq}`;
}
