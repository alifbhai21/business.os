import { Types, ClientSession } from "mongoose";
import { Payment, PaymentDocument, PaymentType } from "../models/Payment";
import { Account } from "../models/Account";
import { Customer } from "../models/Customer";
import { Supplier } from "../models/Supplier";
import { AuditLog } from "../models/AuditLog";
import {
  JOURNAL_ACCOUNTS,
  JOURNAL_ACCOUNT_TYPES,
  JournalAccountName,
  PaymentMethod,
  AccountType,
} from "../config/accounts";
import { membershipFor } from "./membership";
import { JournalAccountType } from "../config/accounts";
import { incrementBalance, decrementBalance } from "./account.service";
import { writeJournal } from "./journal.service";
import { withTransaction } from "../db/transactions";
import { assertSafePaisa } from "../utils/money";
import { ApiError } from "../utils/ApiError";

export interface RecordPaymentInput {
  businessId: string;
  shopId: string;
  type: PaymentType;
  customerId?: string | null;
  supplierId?: string | null;
  saleId?: string | null;
  purchaseId?: string | null;
  amount: number;
  method: PaymentMethod;
  accountId: string;
  note?: string | null;
  idempotencyKey: string;
  paymentDate?: Date | null;
  localId?: string | null;
}

function toPublic(p: PaymentDocument) {
  return {
    id: String(p._id),
    businessId: String(p.businessId),
    shopId: String(p.shopId),
    type: p.type,
    customerId: p.customerId ? String(p.customerId) : null,
    supplierId: p.supplierId ? String(p.supplierId) : null,
    saleId: p.saleId ? String(p.saleId) : null,
    purchaseId: p.purchaseId ? String(p.purchaseId) : null,
    amount: p.amount,
    method: p.method,
    accountId: String(p.accountId),
    note: p.note,
    idempotencyKey: p.idempotencyKey,
    paymentDate: p.paymentDate,
    localId: p.localId,
  };
}

const PAYMENT_CREATE_ROLES = ["Owner", "Admin", "Manager", "Accountant"] as const;

async function assertAccess(userId: string, businessId: string, shopId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }
  return membership;
}

// Service-level RBAC for creating payments — guards direct service calls,
// not just the HTTP route middleware. Reading stays open to all ACTIVE members.
async function assertCanRecord(userId: string, businessId: string, shopId: string) {
  const membership = await assertAccess(userId, businessId, shopId);
  if (!(PAYMENT_CREATE_ROLES as readonly string[]).includes(membership.role)) {
    throw ApiError.forbidden("Insufficient role");
  }
  return membership;
}

function journalAccountFor(accountType: AccountType): {
  name: JournalAccountName;
  accountType: JournalAccountType;
} {
  switch (accountType) {
    case "BANK":
      return { name: JOURNAL_ACCOUNTS.BANK, accountType: "ASSET" };
    case "MOBILE_MONEY":
      return { name: JOURNAL_ACCOUNTS.MOBILE_MONEY, accountType: "ASSET" };
    case "CARD":
      return { name: JOURNAL_ACCOUNTS.CARD, accountType: "ASSET" };
    case "CASH":
    default:
      return { name: JOURNAL_ACCOUNTS.CASH, accountType: "ASSET" };
  }
}

export async function recordPayment(
  userId: string,
  input: RecordPaymentInput
): Promise<{ payment: ReturnType<typeof toPublic>; duplicate: boolean }> {
  assertSafePaisa(input.amount, "amount");
  if (input.amount <= 0) throw ApiError.badRequest("amount must be positive paisa");
  await assertCanRecord(userId, input.businessId, input.shopId);

  const result = await withTransaction(async (session) => {
    const existing = await Payment.findOne({
      businessId: new Types.ObjectId(input.businessId),
      idempotencyKey: input.idempotencyKey,
    }).session(session ?? null);
    if (existing) return { payment: existing, duplicate: true };

    const account = await Account.findOne({
      _id: new Types.ObjectId(input.accountId),
      businessId: new Types.ObjectId(input.businessId),
      shopId: new Types.ObjectId(input.shopId),
    }).session(session ?? null);
    if (!account) throw ApiError.notFound("Account not found");

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    const asset = journalAccountFor(account.type);

    if (input.type === "customer_payment") {
      if (!input.customerId) throw ApiError.badRequest("customerId is required");
      const customer = await Customer.findOne({
        _id: new Types.ObjectId(input.customerId),
        businessId: new Types.ObjectId(input.businessId),
      }).session(session ?? null);
      if (!customer) throw ApiError.notFound("Customer not found");
      if (customer.currentDue < input.amount) {
        throw ApiError.badRequest("Payment exceeds customer outstanding due");
      }

      const payment = await Payment.create(
        [{
          businessId: new Types.ObjectId(input.businessId),
          shopId: new Types.ObjectId(input.shopId),
          type: "customer_payment",
          customerId: new Types.ObjectId(input.customerId),
          supplierId: null,
          saleId: input.saleId ? new Types.ObjectId(input.saleId) : null,
          purchaseId: null,
          amount: input.amount,
          method: input.method,
          accountId: new Types.ObjectId(account._id),
          note: input.note ?? null,
          idempotencyKey: input.idempotencyKey,
          paymentDate,
          createdBy: new Types.ObjectId(userId),
          localId: input.localId ?? null,
        }],
        { session: session ?? undefined, ordered: true }
      );

      const dueRes = await Customer.updateOne(
        {
          _id: customer._id,
          businessId: customer.businessId,
          currentDue: { $gte: input.amount },
        },
        { $inc: { currentDue: -input.amount } },
        { session: session ?? undefined }
      );
      if (dueRes.modifiedCount === 0) throw ApiError.badRequest("Insufficient customer balance");

      await incrementBalance(input.businessId, input.shopId, String(account._id), input.amount, session);

      await writeJournal(
        {
          businessId: input.businessId,
          shopId: input.shopId,
          description: "Customer payment received",
          referenceType: "PAYMENT",
          referenceId: String(payment[0]._id),
          lines: [
            { accountName: asset.name, accountType: asset.accountType, debit: input.amount, credit: 0 },
            {
              accountName: JOURNAL_ACCOUNTS.CUSTOMER_RECEIVABLE,
              accountType: JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.CUSTOMER_RECEIVABLE],
              debit: 0,
              credit: input.amount,
            },
          ],
        },
        session
      );

      await AuditLog.create(
        [{
          userId: new Types.ObjectId(userId),
          businessId: new Types.ObjectId(input.businessId),
          action: "PAYMENT_RECORDED",
          ip: null,
          details: JSON.stringify({
            type: "customer_payment",
            customerId: String(customer._id),
            amount: input.amount,
            shopId: input.shopId,
            idempotencyKey: input.idempotencyKey,
          }),
        }],
        { session: session ?? undefined, ordered: true }
      );

      return { payment: payment[0], duplicate: false };
    }

    // supplier_payment
    if (!input.supplierId) throw ApiError.badRequest("supplierId is required");
    const supplier = await Supplier.findOne({
      _id: new Types.ObjectId(input.supplierId),
      businessId: new Types.ObjectId(input.businessId),
    }).session(session ?? null);
    if (!supplier) throw ApiError.notFound("Supplier not found");
    if (supplier.currentPayable < input.amount) {
      throw ApiError.badRequest("Payment exceeds supplier payable");
    }

    const payment = await Payment.create(
      [{
        businessId: new Types.ObjectId(input.businessId),
        shopId: new Types.ObjectId(input.shopId),
        type: "supplier_payment",
        customerId: null,
        supplierId: new Types.ObjectId(input.supplierId),
        saleId: null,
        purchaseId: input.purchaseId ? new Types.ObjectId(input.purchaseId) : null,
        amount: input.amount,
        method: input.method,
        accountId: new Types.ObjectId(account._id),
        note: input.note ?? null,
        idempotencyKey: input.idempotencyKey,
        paymentDate,
        createdBy: new Types.ObjectId(userId),
        localId: input.localId ?? null,
      }],
      { session: session ?? undefined, ordered: true }
    );

    const payRes = await Supplier.updateOne(
      {
        _id: supplier._id,
        businessId: supplier.businessId,
        currentPayable: { $gte: input.amount },
      },
      { $inc: { currentPayable: -input.amount } },
      { session: session ?? undefined }
    );
    if (payRes.modifiedCount === 0) throw ApiError.badRequest("Insufficient supplier payable");

    await decrementBalance(input.businessId, input.shopId, String(account._id), input.amount, session);

    await writeJournal(
      {
        businessId: input.businessId,
        shopId: input.shopId,
        description: "Supplier payment made",
        referenceType: "PAYMENT",
        referenceId: String(payment[0]._id),
        lines: [
          {
            accountName: JOURNAL_ACCOUNTS.SUPPLIER_PAYABLE,
            accountType: JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.SUPPLIER_PAYABLE],
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
      [{
        userId: new Types.ObjectId(userId),
        businessId: new Types.ObjectId(input.businessId),
        action: "PAYMENT_RECORDED",
        ip: null,
        details: JSON.stringify({
          type: "supplier_payment",
          supplierId: String(supplier._id),
          amount: input.amount,
          shopId: input.shopId,
          idempotencyKey: input.idempotencyKey,
        }),
      }],
      { session: session ?? undefined, ordered: true }
    );

    return { payment: payment[0], duplicate: false };
  });

  return { payment: toPublic(result.payment), duplicate: result.duplicate };
}

export async function listPayments(
  userId: string,
  businessId: string,
  shopId?: string | null
): Promise<ReturnType<typeof toPublic>[]> {
  if (shopId) {
    await assertAccess(userId, businessId, shopId);
  } else {
    const membership = await membershipFor(userId, businessId);
    if (!membership) throw ApiError.notFound("Business not found");
  }
  const filter: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  if (shopId) filter.shopId = new Types.ObjectId(shopId);
  const payments = await Payment.find(filter).sort({ paymentDate: -1, createdAt: -1 });
  return payments.map(toPublic);
}

export async function getPayment(
  userId: string,
  businessId: string,
  shopId: string,
  paymentId: string
): Promise<ReturnType<typeof toPublic>> {
  await assertAccess(userId, businessId, shopId);
  const payment = await Payment.findOne({
    _id: new Types.ObjectId(paymentId),
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
  });
  if (!payment) throw ApiError.notFound("Payment not found");
  return toPublic(payment);
}