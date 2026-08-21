import { Types, ClientSession } from "mongoose";
import { Expense, ExpenseDocument } from "../models/Expense";
import { Account } from "../models/Account";
import { AuditLog } from "../models/AuditLog";
import {
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  expenseAccountName,
  journalAssetAccountFor,
} from "../config/accounts";
import { membershipFor, isDuplicateKeyError } from "./membership";
import { decrementBalance } from "./account.service";
import { writeJournal } from "./journal.service";
import { withTransaction } from "../db/transactions";
import { assertSafePaisa } from "../utils/money";
import { parsePagination, buildPagination } from "../utils/pagination";
import { ApiError } from "../utils/ApiError";

export interface CreateExpenseInput {
  businessId: string;
  shopId: string;
  category: ExpenseCategory;
  amount: number;
  paymentAccountId: string;
  note?: string | null;
  receiptUrl?: string | null;
  expenseDate?: Date | string | null;
  localId?: string | null;
  /** Snapshotted from the verified token claims by the controller (05.13). */
  deviceId?: string | null;
}

export interface ListExpensesQuery {
  page?: unknown;
  limit?: unknown;
  category?: unknown;
}

function toPublic(e: ExpenseDocument) {
  return {
    id: String(e._id),
    businessId: String(e.businessId),
    shopId: String(e.shopId),
    category: e.category,
    amount: e.amount,
    paymentAccountId: String(e.paymentAccountId),
    note: e.note,
    receiptUrl: e.receiptUrl,
    expenseDate: e.expenseDate,
    localId: e.localId,
    deviceId: e.deviceId ? String(e.deviceId) : null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

const EXPENSE_WRITE_ROLES = ["Owner", "Admin", "Manager", "Accountant"] as const;

async function assertAccess(userId: string, businessId: string, shopId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }
  return membership;
}

// Service-level RBAC — guards direct service calls, not just the HTTP route
// middleware. Reading stays open to all ACTIVE members.
async function assertCanRecord(userId: string, businessId: string, shopId: string) {
  const membership = await assertAccess(userId, businessId, shopId);
  if (!(EXPENSE_WRITE_ROLES as readonly string[]).includes(membership.role)) {
    throw ApiError.forbidden("Insufficient role");
  }
  return membership;
}

/**
 * Record an expense atomically: deduct the payment account, write the Expense
 * document, write a balanced JournalEntry (DEBIT Expense:<category> /
 * CREDIT the asset account) and an audit record. Any failure rolls back all
 * of it — there are no compensating writes.
 *
 * Offline-sync idempotency (05.13): a `localId` is the device's own id for the
 * operation, so a retried offline expense resolves to the ORIGINAL record with
 * `duplicate: true` instead of deducting the account a second time. The
 * unique partial index on {businessId, localId} closes the concurrent race the
 * in-transaction lookup cannot.
 */
export async function createExpense(
  userId: string,
  input: CreateExpenseInput
): Promise<{ expense: ReturnType<typeof toPublic>; duplicate: boolean }> {
  assertSafePaisa(input.amount, "amount");
  if (input.amount <= 0) throw ApiError.badRequest("amount must be positive paisa");
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) {
    throw ApiError.badRequest("Invalid expense category");
  }
  await assertCanRecord(userId, input.businessId, input.shopId);

  const run = async (session: ClientSession | null) => {
    if (input.localId) {
      const existing = await Expense.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      }).session(session);
      if (existing) return { expense: existing, duplicate: true };
    }

    // The payment account must belong to THIS business AND THIS shop.
    const account = await Account.findOne({
      _id: new Types.ObjectId(input.paymentAccountId),
      businessId: new Types.ObjectId(input.businessId),
      shopId: new Types.ObjectId(input.shopId),
    }).session(session ?? null);
    if (!account) throw ApiError.notFound("Account not found");

    // Existing account policy: balances never go negative (atomic guard).
    await decrementBalance(
      input.businessId,
      input.shopId,
      String(account._id),
      input.amount,
      session
    );

    const created = await Expense.create(
      [
        {
          businessId: new Types.ObjectId(input.businessId),
          shopId: new Types.ObjectId(input.shopId),
          category: input.category,
          amount: input.amount,
          paymentAccountId: new Types.ObjectId(account._id),
          note: input.note ?? null,
          receiptUrl: input.receiptUrl ?? null,
          expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
          createdBy: new Types.ObjectId(userId),
          localId: input.localId ?? null,
          deviceId: input.deviceId ? new Types.ObjectId(input.deviceId) : null,
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    const asset = journalAssetAccountFor(account.type);
    await writeJournal(
      {
        businessId: input.businessId,
        shopId: input.shopId,
        description: `Expense — ${expenseAccountName(input.category)}`,
        referenceType: "EXPENSE",
        referenceId: String(created[0]._id),
        lines: [
          {
            accountName: expenseAccountName(input.category),
            accountType: "EXPENSE",
            debit: input.amount,
            credit: 0,
          },
          {
            accountName: asset.name,
            accountType: asset.accountType,
            debit: 0,
            credit: input.amount,
          },
        ],
      },
      session
    );

    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: new Types.ObjectId(input.businessId),
          action: "EXPENSE_CREATED",
          ip: null,
          details: JSON.stringify({
            expenseId: String(created[0]._id),
            shopId: input.shopId,
            category: input.category,
            amount: input.amount,
            paymentAccountId: String(account._id),
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return { expense: created[0], duplicate: false };
  };

  try {
    const result = await withTransaction(run);
    return { expense: toPublic(result.expense), duplicate: result.duplicate };
  } catch (err) {
    // A concurrent create with the same localId lost the race on the unique index.
    if (isDuplicateKeyError(err) && input.localId) {
      const existing = await Expense.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      });
      if (existing) return { expense: toPublic(existing), duplicate: true };
    }
    throw err;
  }
}

export async function listExpenses(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ListExpensesQuery = {}
) {
  let effectiveShopId: string | null = shopId ?? null;
  if (shopId) {
    await assertAccess(userId, businessId, shopId);
  } else {
    const membership = await membershipFor(userId, businessId);
    if (!membership) throw ApiError.notFound("Business not found");
    // Shop-scoped members may only list their own shop's expenses.
    if (membership.shopId) effectiveShopId = String(membership.shopId);
  }

  const filter: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  if (effectiveShopId) filter.shopId = new Types.ObjectId(effectiveShopId);
  if (
    typeof query.category === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(query.category)
  ) {
    filter.category = query.category;
  }

  const pagination = parsePagination(query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    Expense.countDocuments(filter),
    Expense.find(filter)
      .sort({ expenseDate: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  return { items: rows.map(toPublic), pagination: buildPagination(total, pagination) };
}

export async function getExpense(
  userId: string,
  businessId: string,
  shopId: string,
  expenseId: string
): Promise<ReturnType<typeof toPublic>> {
  await assertAccess(userId, businessId, shopId);
  if (!Types.ObjectId.isValid(expenseId)) throw ApiError.notFound("Expense not found");
  const expense = await Expense.findOne({
    _id: new Types.ObjectId(expenseId),
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
  });
  if (!expense) throw ApiError.notFound("Expense not found");
  return toPublic(expense);
}
