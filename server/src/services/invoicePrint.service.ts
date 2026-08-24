import type { Invoice } from "./invoice.service";

/**
 * Phase 12 — printable invoice view.
 *
 * Renders the SERVER-AUTHORITATIVE Invoice projection (invoice.service.ts)
 * into a self-contained, print-ready HTML document: every number on the page
 * is copied verbatim from the stored document — nothing is recomputed and
 * nothing is accepted from the client. Browsers save the page as PDF via
 * their native print dialog, which also handles Bangla complex-script
 * shaping correctly (pure-JS PDF generators do not shape Indic scripts).
 *
 * All interpolated strings are HTML-escaped; money is rendered from integer
 * paisa with a fixed presentation-only division by 100.
 */

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Presentation-only taka formatting of an integer-paisa amount. */
function taka(paisaValue: number): string {
  return (paisaValue / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function renderInvoiceHtml(invoice: Invoice): string {
  const rows = invoice.items
    .map(
      (item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(item.productName)}</td>
        <td class="num">${item.qty}</td>
        <td class="num">${taka(item.unitPrice)}</td>
        <td class="num">${taka(item.discountAmount)}</td>
        <td class="num">${taka(item.taxAmount)}</td>
        <td class="num">${taka(item.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const party = invoice.counterparty;

  return `<!DOCTYPE html>
<html lang="${invoice.type === "SALE" ? "en" : "en"}">
<head>
<meta charset="utf-8" />
<title>${esc(invoice.invoiceNo ?? invoice.documentId)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, "Segoe UI", "Noto Sans Bengali", Arial, sans-serif;
         color: #111; max-width: 800px; margin: 0 auto; font-size: 13px; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 14px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #555; font-size: 12px; }
  .meta td { padding: 2px 8px 2px 0; font-size: 12px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 10px; }
  table.lines th, table.lines td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  table.lines th { background: #f3f3f3; font-size: 11px; text-transform: uppercase; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 12px; margin-left: auto; width: 280px; }
  .totals td { padding: 3px 8px; }
  .totals .grand { font-weight: 700; border-top: 2px solid #111; font-size: 14px; }
  footer { margin-top: 26px; color: #555; font-size: 11px; display: flex; justify-content: space-between; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px;
           border: 1px solid #999; font-size: 11px; letter-spacing: .5px; }
  @media print { body { font-size: 12px; } }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${esc(invoice.business.name)}</h1>
      <div class="muted">${esc(invoice.shop.name)} · ${esc(invoice.shop.branchCode)}</div>
      ${invoice.business.address ? `<div class="muted">${esc(invoice.business.address)}</div>` : ""}
      ${invoice.business.phone ? `<div class="muted">${esc(invoice.business.phone)}</div>` : ""}
    </div>
    <div style="text-align:right">
      <h2 style="margin:0">${invoice.type === "SALE" ? "INVOICE" : "PURCHASE BILL"}</h2>
      <div><strong>${esc(invoice.invoiceNo ?? "(unnumbered)")}</strong></div>
      <div class="muted">${new Date(invoice.date).toISOString().slice(0, 10)}</div>
      <div class="muted">${esc(invoice.status)} · ${esc(invoice.paymentStatus)}</div>
    </div>
  </header>

  <table class="meta">
    <tr>
      <td class="muted">${party.kind === "CUSTOMER" ? "Bill to" : "Supplier"}:</td>
      <td><strong>${esc(party.name ?? "Walk-in")}</strong></td>
    </tr>
    ${party.phone ? `<tr><td class="muted">Phone:</td><td>${esc(party.phone)}</td></tr>` : ""}
    ${party.address ? `<tr><td class="muted">Address:</td><td>${esc(party.address)}</td></tr>` : ""}
    ${invoice.supplierInvoiceNo ? `<tr><td class="muted">Supplier ref:</td><td>${esc(invoice.supplierInvoiceNo)}</td></tr>` : ""}
  </table>

  <table class="lines">
    <thead>
      <tr>
        <th>#</th><th>Item</th>
        <th class="num">Qty</th><th class="num">Unit price</th>
        <th class="num">Discount</th><th class="num">Tax</th>
        <th class="num">Line total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${taka(invoice.totals.subtotal)}</td></tr>
    <tr><td>Discount</td><td class="num">${taka(invoice.totals.discountAmount)}</td></tr>
    <tr><td>Tax</td><td class="num">${taka(invoice.totals.taxAmount)}</td></tr>
    <tr class="grand"><td>Total (${esc(invoice.currency)})</td><td class="num">${taka(invoice.totals.total)}</td></tr>
    <tr><td>Paid</td><td class="num">${taka(invoice.totals.paidAmount)}</td></tr>
    <tr><td>Due</td><td class="num">${taka(invoice.totals.dueAmount)}</td></tr>
  </table>

  ${invoice.notes ? `<p class="muted">Note: ${esc(invoice.notes)}</p>` : ""}

  <footer>
    <span>${invoice.issuedAt ? "Issued " + new Date(invoice.issuedAt).toISOString().replace("T", " ").slice(0, 16) + "Z" : ""}</span>
    <span class="badge">${invoice.type}</span>
  </footer>
</body>
</html>`;
}
