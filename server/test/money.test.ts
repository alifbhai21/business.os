import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSafePaisa,
  assertSafePaisa,
  roundPaisa,
  takaToPaisa,
  paisaToTaka,
  calcLineTotal,
  calcSubtotal,
  calcLineTax,
  calcTotalTax,
  calcDiscount,
  calcFlatDiscount,
  calcTotal,
  calcDue,
} from "../src/utils/money";

// ── Conversions ──────────────────────────────────────────────
test("money: taka → paisa (integer conversion)", () => {
  assert.equal(takaToPaisa(0), 0);
  assert.equal(takaToPaisa(1), 100);
  assert.equal(takaToPaisa(12.34), 1234);
  assert.equal(takaToPaisa("123.45"), 12345);
  assert.equal(takaToPaisa("1,234.56"), 123456);
  assert.equal(takaToPaisa("12.345"), 1235); // rounds to nearest paisa
});

test("money: paisa → taka (display only)", () => {
  assert.equal(paisaToTaka(0), 0);
  assert.equal(paisaToTaka(100), 1);
  assert.equal(paisaToTaka(12345), 123.45);
});

test("money: rounding to nearest paisa", () => {
  assert.equal(roundPaisa(1.4), 1);
  assert.equal(roundPaisa(1.5), 2);
  assert.equal(roundPaisa(2.5), 3); // Math.round rounds .5 up
});

// ── Integer validation ───────────────────────────────────────
test("money: safe integer paisa validation", () => {
  assert.equal(isSafePaisa(0), true);
  assert.equal(isSafePaisa(12345), true);
  assert.equal(isSafePaisa(1.5), false);
  assert.equal(isSafePaisa(Number.MAX_SAFE_INTEGER), true);
  assert.equal(isSafePaisa(Number.MAX_SAFE_INTEGER + 1), false);
  assert.throws(() => assertSafePaisa(1.5), /safe integer amount in paisa/i);
  assert.throws(() => assertSafePaisa(Number.MAX_SAFE_INTEGER + 1));
});

// ── Line totals / subtotal ───────────────────────────────────
test("money: line total = quantity × unit price", () => {
  assert.equal(calcLineTotal(2, 5000), 10000); // 2 × 50.00 = 100.00
  assert.equal(calcLineTotal(1, 12345), 12345);
});

test("money: subtotal sums line totals (all paisa)", () => {
  assert.equal(calcSubtotal([1000, 2000, 3500]), 6500);
});

// ── Tax ──────────────────────────────────────────────────────
test("money: per-line tax rounds each line, then sums", () => {
  // 15% of 3333 paisa = 499.95 → rounds to 500
  assert.equal(calcLineTax(3333, 15), 500);
  // 0% tax
  assert.equal(calcLineTax(10000, 0), 0);
  // Multiple lines: per-line rounding then sum
  const lines = [3333, 3333, 3334];
  assert.equal(calcTotalTax(lines, 15), 1500); // 500 + 500 + 500
  assert.throws(() => calcLineTax(100, -5));
  assert.throws(() => calcLineTax(100, NaN));
});

// ── Discount ─────────────────────────────────────────────────
test("money: percentage discount rounded to paisa", () => {
  assert.equal(calcDiscount(10000, 10), 1000); // 10% of 100.00
  assert.equal(calcDiscount(9999, 33), 3300); // 3299.67 → 3300
  assert.equal(calcDiscount(10000, 0), 0);
  assert.equal(calcDiscount(10000, 100), 10000);
  assert.throws(() => calcDiscount(10000, 101));
  assert.throws(() => calcDiscount(10000, -1));
});

test("money: flat discount validated as integer paisa", () => {
  assert.equal(calcFlatDiscount(5000), 5000);
  assert.throws(() => calcFlatDiscount(50.5));
});

// ── Total / Due ──────────────────────────────────────────────
test("money: total = subtotal − discount + tax", () => {
  assert.equal(calcTotal(10000, 1000, 500), 9500);
  assert.equal(calcTotal(10000, 0, 0), 10000);
  assert.throws(() => calcTotal(10000, -1, 0));
  assert.throws(() => calcTotal(10000, 0, -1));
});

test("money: due = total − paid, clamped at 0 for overpayment", () => {
  assert.equal(calcDue(10000, 4000), 6000);
  assert.equal(calcDue(10000, 10000), 0);
  assert.equal(calcDue(10000, 15000), 0); // overpayment clamped
  assert.throws(() => calcDue(10000, -1));
  assert.throws(() => calcDue(-1, 0));
});