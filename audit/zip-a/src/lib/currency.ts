/**
 * Convert Paisa (integer) to Taka decimal display string.
 * e.g., 10500 paisa -> "৳ 105.00" or "৳১০৫.০০"
 */
export function formatTaka(paisa: number, isBangla: boolean = false): string {
  const taka = (paisa / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const formatted = `৳ ${taka}`;

  if (!isBangla) return formatted;

  // Convert digits to Bangla digits
  const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return formatted.replace(/[0-9]/g, (w) => banglaDigits[parseInt(w)]);
}

/**
 * Convert Taka input (e.g. 150 or "150.50") to Paisa integer.
 */
export function takaToPaisa(taka: number | string): number {
  const val = typeof taka === "string" ? parseFloat(taka) : taka;
  if (isNaN(val)) return 0;
  return Math.round(val * 100);
}

/**
 * Convert Paisa integer to plain Taka float for inputs.
 */
export function paisaToTaka(paisa: number): number {
  return paisa / 100;
}
