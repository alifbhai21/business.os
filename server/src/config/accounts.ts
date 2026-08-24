/**
 * Canonical financial constants (Phase 05 foundation).
 *
 * Single source of truth for account types, payment methods, expense
 * categories and journal account names. Services must reference these
 * constants — never scatter literal strings.
 *
 * Journal concepts are deliberately aligned with the future accounting
 * engine (Phase 07): P&L, Balance Sheet and General Ledger will read
 * journal lines keyed by these canonical account names + types.
 */

// ── Physical account types (Account collection) ─────────────
// What an account IS (asset class). Payment methods map onto these.
export const ACCOUNT_TYPES = ["CASH", "BANK", "MOBILE_MONEY", "CARD", "OTHER"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// ── Payment methods (PRD §9.4) ───────────────────────────────
// How a payment is EXECUTED. Methods map to account types:
// CASH→CASH, BANK→BANK, BKASH/NAGAD/ROCKET→MOBILE_MONEY, CARD→CARD, OTHER→OTHER
export const PAYMENT_METHODS = ["CASH", "BANK", "BKASH", "NAGAD", "ROCKET", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ── Expense categories (PRD §9.4 default list) ───────────────
export const EXPENSE_CATEGORIES = [
  "RENT",
  "SALARY",
  "ELECTRICITY",
  "INTERNET",
  "TRANSPORT",
  "MAINTENANCE",
  "MARKETING",
  "PACKAGING",
  "OFFICE",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// ── Journal account concepts ─────────────────────────────────
// Canonical names used inside journal lines. These are the minimum set
// required to journalize sales, purchases, payments and expenses.
export const JOURNAL_ACCOUNTS = {
  CASH: "Cash",
  BANK: "Bank",
  MOBILE_MONEY: "Mobile Money",
  CARD: "Card",
  SALES_REVENUE: "Sales Revenue",
  SALES_RETURNS: "Sales Returns",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  INVENTORY: "Inventory",
  CUSTOMER_RECEIVABLE: "Customer Receivable",
  SUPPLIER_PAYABLE: "Supplier Payable",
  TAX_PAYABLE: "Tax Payable",
  TAX_RECEIVABLE: "Tax Receivable",
  PURCHASE_RETURNS: "Purchase Returns",
} as const;
export type JournalAccountName = (typeof JOURNAL_ACCOUNTS)[keyof typeof JOURNAL_ACCOUNTS];

/** Nominal accounting classification of each journal account concept.
 *
 * Contra accounts reuse their host class so P&L aggregation nets naturally:
 *  - SALES_RETURNS is debit-normal inside REVENUE (nets against Sales Revenue).
 *  - PURCHASE_RETURNS is credit-normal inside EXPENSE (nets against opex).
 */
export const JOURNAL_ACCOUNT_TYPES = {
  [JOURNAL_ACCOUNTS.CASH]: "ASSET",
  [JOURNAL_ACCOUNTS.BANK]: "ASSET",
  [JOURNAL_ACCOUNTS.MOBILE_MONEY]: "ASSET",
  [JOURNAL_ACCOUNTS.CARD]: "ASSET",
  [JOURNAL_ACCOUNTS.INVENTORY]: "ASSET",
  [JOURNAL_ACCOUNTS.CUSTOMER_RECEIVABLE]: "ASSET",
  [JOURNAL_ACCOUNTS.SUPPLIER_PAYABLE]: "LIABILITY",
  [JOURNAL_ACCOUNTS.TAX_PAYABLE]: "LIABILITY",
  // Input tax paid to suppliers is recoverable — an asset, the mirror of the
  // output tax collected on sales (TAX_PAYABLE).
  [JOURNAL_ACCOUNTS.TAX_RECEIVABLE]: "ASSET",
  [JOURNAL_ACCOUNTS.SALES_REVENUE]: "REVENUE",
  [JOURNAL_ACCOUNTS.SALES_RETURNS]: "REVENUE",
  [JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD]: "EXPENSE",
  [JOURNAL_ACCOUNTS.PURCHASE_RETURNS]: "EXPENSE",
} as const;
export type JournalAccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE";

export const JOURNAL_ACCOUNT_TYPES_LIST: JournalAccountType[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
];

/** Journal line account name for an expense category (e.g. "Rent"). */
/** Journal line account name for an expense category (e.g. "Rent").
 *  Phase 12: accepts any category string — built-in enum values AND the
 *  business-defined custom categories share this naming rule. */
export function expenseAccountName(category: string): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}

/** Default cash account name seeded per shop. */
export const DEFAULT_CASH_ACCOUNT_NAME = JOURNAL_ACCOUNTS.CASH;

/**
 * Canonical journal asset account for a physical Account type. Every
 * financial service that moves money through an Account (payments,
 * expenses, sales, purchases) must journalize against these names so the
 * Phase 07 ledger reads a single consistent chart of accounts.
 */
export function journalAssetAccountFor(type: AccountType): {
  name: JournalAccountName;
  accountType: JournalAccountType;
} {
  switch (type) {
    case "BANK":
      return { name: JOURNAL_ACCOUNTS.BANK, accountType: "ASSET" };
    case "MOBILE_MONEY":
      return { name: JOURNAL_ACCOUNTS.MOBILE_MONEY, accountType: "ASSET" };
    case "CARD":
      return { name: JOURNAL_ACCOUNTS.CARD, accountType: "ASSET" };
    case "CASH":
    case "OTHER":
    default:
      return { name: JOURNAL_ACCOUNTS.CASH, accountType: "ASSET" };
  }
}