/**
 * Format paisa (integer) to BDT display string
 * All monetary values stored as integers in paisa (1 BDT = 100 paisa)
 */
export function formatCurrency(paisa: number): string {
  const taka = paisa / 100;
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(taka);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-BD").format(n);
}

export function paisaToBDT(paisa: number): number {
  return paisa / 100;
}

export function bdtToPaisa(bdt: number): number {
  return Math.round(bdt * 100);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-BD", {
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
