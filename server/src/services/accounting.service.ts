import { Types, PipelineStage } from "mongoose";
import { JournalEntry } from "../models/JournalEntry";
import { JournalLine } from "../models/JournalLine";
import {
  JOURNAL_ACCOUNTS,
  JOURNAL_ACCOUNT_TYPES,
  EXPENSE_CATEGORIES,
  expenseAccountName,
} from "../config/accounts";
import { membershipFor } from "./membership";
import { parsePagination, buildPagination } from "../utils/pagination";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 07 — read-only accounting reports.
 *
 * Every report is derived from the immutable JournalLine ledger that the
 * Phase 05/06 write engine has been producing all along. Nothing here
 * recomputes business facts from documents — the journals ARE the source of
 * truth, so reports can never silently diverge from the transactional system.
 *
 * All queries are tenant-scoped (businessId) and optionally shop-scoped;
 * shop-pinned memberships are always pinned server-side.
 */

const CASH_ACCOUNT_NAMES = [
  JOURNAL_ACCOUNTS.CASH,
  JOURNAL_ACCOUNTS.BANK,
  JOURNAL_ACCOUNTS.MOBILE_MONEY,
  JOURNAL_ACCOUNTS.CARD,
] as const;

export interface ReportQuery {
  from?: unknown;
  to?: unknown;
}

interface ResolvedScope {
  entryFilter: Record<string, unknown>;
}

async function resolveScope(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ReportQuery
): Promise<ResolvedScope> {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  let effectiveShopId: string | null = shopId ?? null;
  if (shopId) {
    if (membership.shopId && String(membership.shopId) !== shopId) {
      throw ApiError.notFound("Shop not found");
    }
  } else if (membership.shopId) {
    effectiveShopId = String(membership.shopId);
  }

  const entryFilter: Record<string, unknown> = {
    businessId: new Types.ObjectId(businessId),
  };
  if (effectiveShopId) entryFilter.shopId = new Types.ObjectId(effectiveShopId);

  const range: Record<string, unknown> = {};
  if (typeof query.from === "string" && query.from) {
    const d = new Date(query.from);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest("Invalid from date");
    range.$gte = d;
  }
  if (typeof query.to === "string" && query.to) {
    const d = new Date(query.to);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest("Invalid to date");
    // Bare YYYY-MM-DD = whole UTC day (matches the report read layer).
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) d.setTime(d.getTime() + 86_400_000 - 1);
    range.$lte = d;
  }
  if (Object.keys(range).length) entryFilter.date = range;

  return { entryFilter };
}

/** Aggregation helper: flatten scoped entries into typed ledger lines. */
async function ledgerLines(entryFilter: Record<string, unknown>, accountNames?: readonly string[]) {
  return JournalEntry.aggregate<{
    accountName: string;
    accountType: string;
    debit: number;
    credit: number;
    referenceType: string;
  }>([
    { $match: entryFilter },
    {
      $lookup: {
        from: JournalLine.collection.name,
        localField: "_id",
        foreignField: "entryId",
        as: "line",
      },
    },
    { $unwind: "$line" },
    // Line-level filters MUST come after the lookup.
    ...(accountNames ? [{ $match: { "line.accountName": { $in: accountNames } } }] : []),
    {
      $project: {
        accountName: "$line.accountName",
        accountType: "$line.accountType",
        debit: "$line.debit",
        credit: "$line.credit",
        referenceType: "$referenceType",
      },
    },
  ]);
}

/** Per-account debit/credit totals over the scoped period. */
async function accountTotals(entryFilter: Record<string, unknown>) {
  const lines = await ledgerLines(entryFilter);
  const byAccount = new Map<string, { accountName: string; accountType: string; debit: number; credit: number }>();
  for (const l of lines) {
    const acc = byAccount.get(l.accountName) ?? {
      accountName: l.accountName,
      accountType: l.accountType,
      debit: 0,
      credit: 0,
    };
    acc.debit += l.debit;
    acc.credit += l.credit;
    byAccount.set(l.accountName, acc);
  }
  return [...byAccount.values()].map((a) => ({ ...a }));
}

// ── Journal listing ────────────────────────────────────────────────────────

/**
 * Phase 12 — chart of accounts (read-only projection of the canonical
 * config). No AccountChart collection exists by design: the chart is
 * server-authoritative configuration, so the API SERVES it verbatim and the
 * UI renders it — one source of truth, zero drift between engine and UI.
 */
export async function chartOfAccounts(userId: string, businessId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");

  const accounts: Array<{ name: string; accountType: string; normalBalance: string }> = Object.values(
    JOURNAL_ACCOUNTS
  ).map((name) => {
    const accountType = JOURNAL_ACCOUNT_TYPES[name];
    return {
      name,
      accountType,
      normalBalance: accountType === "ASSET" || accountType === "EXPENSE" ? "DEBIT" : "CREDIT",
    };
  });

  // EQUITY is listed for completeness (retained earnings is the balance
  // sheet's balancing figure) even though no journal writes to it directly.
  const byType = (t: string) => accounts.filter((a) => a.accountType === t);
  const grouped = {
    ASSET: byType("ASSET"),
    LIABILITY: byType("LIABILITY"),
    EQUITY: byType("EQUITY"),
    REVENUE: byType("REVENUE"),
    EXPENSE: byType("EXPENSE"),
  };

  return {
    source: "config",
    accounts,
    grouped,
    expenseCategories: EXPENSE_CATEGORIES.map((c) => ({
      category: c,
      accountName: expenseAccountName(c),
    })),
  };
}

export async function listJournal(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ReportQuery & { page?: unknown; limit?: unknown; referenceType?: unknown }
) {
  const { entryFilter } = await resolveScope(userId, businessId, shopId, query);
  const pagination = parsePagination(query as Record<string, unknown>);
  const filter: Record<string, unknown> = { ...entryFilter };
  if (typeof query.referenceType === "string") filter.referenceType = query.referenceType;

  const [total, entries] = await Promise.all([
    JournalEntry.countDocuments(filter),
    JournalEntry.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
  ]);

  const entryIds = entries.map((e) => e._id);
  const lines = await JournalLine.find({ entryId: { $in: entryIds } }).lean();

  const items = entries.map((entry) => ({
    id: String(entry._id),
    date: entry.date,
    description: entry.description,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId ? String(entry.referenceId) : null,
    isReversal: entry.isReversal,
    reversesEntryId: entry.reversesEntryId ? String(entry.reversesEntryId) : null,
    localId: entry.localId ?? null,
    lines: lines
      .filter((l) => String(l.entryId) === String(entry._id))
      .map((l) => ({ accountName: l.accountName, accountType: l.accountType, debit: l.debit, credit: l.credit })),
  }));

  return { items, pagination: buildPagination(total, pagination) };
}

// ── General Ledger ─────────────────────────────────────────────────────────

export async function generalLedger(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ReportQuery & { page?: unknown; limit?: unknown; accountName?: unknown }
) {
  const { entryFilter } = await resolveScope(userId, businessId, shopId, query);
  const pagination = parsePagination(query as Record<string, unknown>);
  const accountName = typeof query.accountName === "string" ? query.accountName.trim() : "";

  const match: Record<string, unknown> = { ...entryFilter };

  // NOTE: the accountName constraint must run AFTER the $lookup/$unwind —
  // accountName lives on lines, not entries.
  const basePipeline: Record<string, unknown>[] = [
    { $match: match },
    {
      $lookup: {
        from: JournalLine.collection.name,
        localField: "_id",
        foreignField: "entryId",
        as: "line",
      },
    },
    { $unwind: "$line" },
    ...(accountName ? [{ $match: { "line.accountName": accountName } }] : []),
    { $sort: { date: 1, _id: 1 } },
  ];

  const countPipeline = [...basePipeline, { $count: "total" }];
  const counted = await JournalEntry.aggregate<{ total: number }>(
    countPipeline as unknown as PipelineStage[]
  );
  const total = counted[0]?.total ?? 0;

  const rows = await JournalEntry.aggregate<Record<string, unknown>>(
    [
      ...basePipeline,
      { $skip: pagination.skip },
      { $limit: pagination.limit },
    ] as unknown as PipelineStage[]
  );

  // Single-account queries additionally get an exact opening balance so the
  // running balance on each row is meaningful. The prior-balance query only
  // makes sense with an explicit lower bound — without one the ledger starts
  // at zero by definition.
  let openingBalance: number | null = null;
  if (accountName && typeof query.from === "string" && query.from) {
    const priorRows = await JournalEntry.aggregate<Record<string, unknown>>([
      { $match: { ...entryFilter, ...(query.from ? { date: { $lt: new Date(String(query.from)) } } : {}) } },
      {
        $lookup: {
          from: JournalLine.collection.name,
          localField: "_id",
          foreignField: "entryId",
          as: "line",
        },
      },
      { $unwind: "$line" },
      { $match: { "line.accountName": accountName } },
      {
        $group: {
          _id: null,
          debit: { $sum: "$line.debit" },
          credit: { $sum: "$line.credit" },
        },
      },
    ] as unknown as PipelineStage[]);
    const prior = priorRows[0] as { debit?: number; credit?: number } | undefined;
    openingBalance = prior ? (prior.debit ?? 0) - (prior.credit ?? 0) : 0;
  }

  let running = openingBalance ?? 0;
  const items = rows.map((r) => {
    const line = r.line as { accountName: string; accountType: string; debit: number; credit: number };
    if (openingBalance !== null) {
      running += line.debit - line.credit;
    }
    return {
      date: r.date as Date,
      description: r.description as string,
      referenceType: r.referenceType as string,
      referenceId: r.referenceId ? String(r.referenceId as Types.ObjectId) : null,
      isReversal: r.isReversal as boolean,
      accountName: line.accountName,
      accountType: line.accountType,
      debit: line.debit,
      credit: line.credit,
      ...(accountName ? { runningBalance: running } : {}),
    };
  });

  return { items, pagination: buildPagination(total, pagination) };
}

// ── Trial Balance ──────────────────────────────────────────────────────────

export async function trialBalance(userId: string, businessId: string, shopId: string | null | undefined, query: ReportQuery) {
  const { entryFilter } = await resolveScope(userId, businessId, shopId, query);
  const accounts = await accountTotals(entryFilter);

  const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
  const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);
  // The write engine refuses unbalanced journals, so this can only be true.
  if (totalDebit !== totalCredit) {
    throw ApiError.internal("Trial balance is out of balance — this indicates a journaling bug");
  }
  return { accounts, totalDebit, totalCredit, balanced: true };
}

// ── Profit & Loss ──────────────────────────────────────────────────────────

export async function profitLoss(userId: string, businessId: string, shopId: string | null | undefined, query: ReportQuery) {
  const { entryFilter } = await resolveScope(userId, businessId, shopId, query);
  const accounts = await accountTotals(entryFilter);

  const pick = (name: string) => accounts.find((a) => a.accountName === name);

  // Net revenue nets contra Sales Returns naturally (same REVENUE class).
  const revenueLines = accounts.filter((a) => a.accountType === "REVENUE");
  const revenue = revenueLines.reduce((s, a) => s + a.credit - a.debit, 0);

  const cogsAccount = pick(JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD);
  const cogs = cogsAccount ? cogsAccount.debit - cogsAccount.credit : 0;

  const opexLines = accounts.filter((a) => a.accountType === "EXPENSE" && a.accountName !== JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD);
  const operatingExpenses = opexLines.reduce((s, a) => s + a.debit - a.credit, 0);

  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - operatingExpenses;

  return {
    revenue: {
      total: revenue,
      accounts: revenueLines.map((a) => ({ accountName: a.accountName, amount: a.credit - a.debit })),
    },
    cogs: {
      total: cogs,
      accounts: cogsAccount ? [{ accountName: cogsAccount.accountName, amount: cogs }] : [],
    },
    grossProfit,
    operatingExpenses: {
      total: operatingExpenses,
      accounts: opexLines.map((a) => ({ accountName: a.accountName, amount: a.debit - a.credit })),
    },
    netProfit,
  };
}

// ── Balance Sheet ──────────────────────────────────────────────────────────

export async function balanceSheet(userId: string, businessId: string, shopId: string | null | undefined, query: ReportQuery) {
  const { entryFilter } = await resolveScope(userId, businessId, shopId, query);
  const accounts = await accountTotals(entryFilter);

  const assetLines = accounts.filter((a) => a.accountType === "ASSET");
  const liabilityLines = accounts.filter((a) => a.accountType === "LIABILITY");
  const equityLines = accounts.filter((a) => a.accountType === "EQUITY"); // none yet

  const totalAssets = assetLines.reduce((s, a) => s + a.debit - a.credit, 0);
  const totalLiabilities = liabilityLines.reduce((s, a) => s + a.credit - a.debit, 0);
  const contributedEquity = equityLines.reduce((s, a) => s + a.credit - a.debit, 0);

  // Retained earnings is the balancing figure: A − L − contributed E.
  const retainedEarnings = totalAssets - totalLiabilities - contributedEquity;

  // Lifetime net income from P&L classes, reported alongside so any gap is
  // VISIBLE rather than silently absorbed: shops seeded before Phase 07 carry
  // unjournaled opening cash (openingCash), which shows up here as
  // unreconciledOpeningEquity instead of corrupting the books.
  const revenueLines = accounts.filter((a) => a.accountType === "REVENUE");
  const netIncome =
    revenueLines.reduce((s, a) => s + a.credit - a.debit, 0) +
    accounts
      .filter((a) => a.accountType === "EXPENSE")
      .reduce((s, a) => s - (a.debit - a.credit), 0);
  const unreconciledOpeningEquity = retainedEarnings - netIncome;
  const totalEquity = contributedEquity + retainedEarnings;
  return {
    asOf: typeof query.to === "string" && query.to ? query.to : new Date().toISOString(),
    assets: {
      total: totalAssets,
      accounts: assetLines.map((a) => ({ accountName: a.accountName, amount: a.debit - a.credit })),
    },
    liabilities: {
      total: totalLiabilities,
      accounts: liabilityLines.map((a) => ({ accountName: a.accountName, amount: a.credit - a.debit })),
    },
    equity: {
      contributed: contributedEquity,
      retainedEarnings,
      total: totalEquity,
    },
    netProfitAllTime: netIncome,
    unreconciledOpeningEquity,
    balanced: totalAssets === totalLiabilities + totalEquity,
  };
}

// ── Cash Flow (direct method over cash-asset journal lines) ───────────────

export async function cashFlow(userId: string, businessId: string, shopId: string | null | undefined, query: ReportQuery) {
  const { entryFilter } = await resolveScope(userId, businessId, shopId, query);
  const lines = await ledgerLines(entryFilter, CASH_ACCOUNT_NAMES);

  const OPERATING_INFLOW = new Set(["SALE", "PAYMENT", "PURCHASE_RETURN"]);
  const OPERATING_OUTFLOW = new Set(["PURCHASE", "EXPENSE", "SALE_RETURN"]);

  const buckets = new Map<string, { inflow: number; outflow: number }>();
  let transferIn = 0;
  let transferOut = 0;

  for (const l of lines) {
    if (l.referenceType === "CASH_TRANSFER") {
      // Inter-account movements never change total cash — tracked separately.
      if (l.debit > 0) transferIn += l.debit;
      else transferOut += l.credit;
      continue;
    }
    const key =
      OPERATING_INFLOW.has(l.referenceType) || OPERATING_OUTFLOW.has(l.referenceType)
        ? "operating"
        : "other";
    const b = buckets.get(key) ?? { inflow: 0, outflow: 0 };
    if (l.debit > 0) b.inflow += l.debit;
    else b.outflow += l.credit;
    buckets.set(key, b);
  }

  const operating = buckets.get("operating") ?? { inflow: 0, outflow: 0 };
  const other = buckets.get("other") ?? { inflow: 0, outflow: 0 };

  return {
    operating: { ...operating, net: operating.inflow - operating.outflow },
    investing: { inflow: 0, outflow: 0, net: 0 },
    financing: { inflow: 0, outflow: 0, net: 0 },
    other: { ...other, net: other.inflow - other.outflow },
    interAccountTransfers: { inflow: transferIn, outflow: transferOut, net: transferIn - transferOut },
    netCashFlow:
      operating.inflow -
      operating.outflow +
      other.inflow -
      other.outflow +
      (transferIn - transferOut),
  };
}
