/**
 * Phase 11 — RFC 4180 CSV serialization.
 *
 * Values containing commas, quotes or newlines are wrapped in double quotes
 * with inner quotes doubled, so exports round-trip through any spreadsheet.
 * All money stays raw integer paisa (server-authoritative; never formatted).
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: readonly string[], rows: Array<Array<unknown>>): string {
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ];
  // CRLF line endings per RFC 4180; BOM-free UTF-8 (caller sets charset).
  return lines.join("\r\n") + "\r\n";
}
