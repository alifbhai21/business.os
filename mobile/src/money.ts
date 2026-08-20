// Server stores money as integer paisa. The UI edits and displays Taka.
// Example: ৳123.50 <-> 12350 paisa.

export function paisaToTaka(paisa: number): string {
  return (paisa / 100).toFixed(2);
}

export function takaToPaisa(input: string): number {
  const cleaned = input.replace(/,/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function formatTaka(paisa: number): string {
  return `৳${paisaToTaka(paisa)}`;
}