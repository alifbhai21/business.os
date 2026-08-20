/**
 * Money utilities — ALL persisted financial values are integer paisa.
 * Floating-point money is never stored or trusted.
 *
 * Safe integer range: |value| <= Number.MAX_SAFE_INTEGER (≈ 90 trillion taka
 * in paisa), well beyond any realistic business ledger.
 */

export function isSafePaisa(value: number): boolean {
  return Number.isSafeInteger(value);
}

/** Validate an integer-paisa value; throws on unsafe/non-integer input. */
export function assertSafePaisa(value: number, field = "amount"): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a safe integer amount in paisa (got ${value})`);
  }
  return value;
}

/** Round any number to the nearest integer paisa. */
export function roundPaisa(value: number): number {
  return Math.round(value);
}

/**
 * Convert taka (number or "123.45" string) to integer paisa.
 * Parses strings defensively, then rounds to the nearest paisa.
 * Returns 0 for unparseable input — validation schemas reject bad input first.
 */
export function takaToPaisa(taka: number | string): number {
  const val = typeof taka === "string" ? Number(taka.replace(/,/g, "").trim()) : taka;
  if (!Number.isFinite(val) || val < 0) return 0;
  return roundPaisa(val * 100);
}

/** Convert integer paisa to taka. Display/input only — never persisted. */
export function paisaToTaka(paisa: number): number {
  assertSafePaisa(paisa, "paisa");
  return paisa / 100;
}

/** Line total = quantity × unit price (both integers; price in paisa). */
export function calcLineTotal(quantity: number, unitPricePaisa: number): number {
  assertSafePaisa(quantity, "quantity");
  assertSafePaisa(unitPricePaisa, "unitPrice");
  return roundPaisa(quantity * unitPricePaisa);
}

/** Subtotal = sum of line totals (each already in integer paisa). */
export function calcSubtotal(lineTotals: number[]): number {
  let sum = 0;
  for (const line of lineTotals) {
    assertSafePaisa(line, "lineTotal");
    sum += line;
  }
  return assertSafePaisa(sum, "subtotal");
}

/**
 * Tax policy: calculate tax PER LINE and round each line to paisa,
 * then sum. Never apply one rounding to the aggregate subtotal only.
 */
export function calcLineTax(lineTotalPaisa: number, taxRatePercent: number): number {
  assertSafePaisa(lineTotalPaisa, "lineTotal");
  if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0) {
    throw new Error(`taxRatePercent must be a finite percentage >= 0 (got ${taxRatePercent})`);
  }
  return roundPaisa((lineTotalPaisa * taxRatePercent) / 100);
}

export function calcTotalTax(lineTotalsPaisa: number[], taxRatePercent: number): number {
  let sum = 0;
  for (const line of lineTotalsPaisa) {
    sum += calcLineTax(line, taxRatePercent);
  }
  return assertSafePaisa(sum, "tax");
}

/** Percentage discount on a subtotal, rounded to paisa. */
export function calcDiscount(subtotalPaisa: number, discountPercent: number): number {
  assertSafePaisa(subtotalPaisa, "subtotal");
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error(`discountPercent must be between 0 and 100 (got ${discountPercent})`);
  }
  return roundPaisa((subtotalPaisa * discountPercent) / 100);
}

/** Flat discount in paisa (validated integer). */
export function calcFlatDiscount(discountPaisa: number): number {
  return assertSafePaisa(discountPaisa, "discount");
}

/** Total = subtotal − discount + tax (all integer paisa). */
export function calcTotal(subtotalPaisa: number, discountPaisa: number, taxPaisa: number): number {
  assertSafePaisa(subtotalPaisa, "subtotal");
  assertSafePaisa(discountPaisa, "discount");
  assertSafePaisa(taxPaisa, "tax");
  if (discountPaisa < 0 || taxPaisa < 0) {
    throw new Error("discount and tax must be non-negative");
  }
  return subtotalPaisa - discountPaisa + taxPaisa;
}

/** Due = total − paid (clamped at 0 for overpayments). */
export function calcDue(totalPaisa: number, paidPaisa: number): number {
  assertSafePaisa(totalPaisa, "total");
  assertSafePaisa(paidPaisa, "paid");
  if (totalPaisa < 0 || paidPaisa < 0) {
    throw new Error("total and paid must be non-negative");
  }
  return Math.max(0, totalPaisa - paidPaisa);
}