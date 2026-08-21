/**
 * Payment settlement sub-resources (05.11).
 *
 * `POST /api/v1/sales/:id/payments` and `POST /api/v1/purchases/:id/payments`
 * settle an outstanding document balance. There is deliberately NO second
 * payment implementation here: the Payment document, the party balance, the
 * Account balance, the balanced journal and the PAYMENT_RECORDED audit row are
 * all produced by the verified 05.05 engine through
 * `applyPaymentInSession`, running inside THIS function's transaction. What this
 * file adds is the part 05.05 cannot know about — the document's own
 * `paidAmount` / `dueAmount` / `paymentStatus` — so the money movement and the
 * document update commit or abort together.
 *
 * The client never states who is being paid or what kind of payment it is: the
 * customer/supplier, the `type` and the `saleId`/`purchaseId` link are all read
 * from the stored document, so a caller cannot settle sale A's invoice against
 * customer B.
 */
import { Types } from "mongoose";
import { Sale } from "../models/Sale";
import { Purchase } from "../models/Purchase";
import { Payment } from "../models/Payment";
import { AuditLog } from "../models/AuditLog";
import { PaymentMethod } from "../config/accounts";
import {
  applyPaymentInSession,
  assertCanRecordPayment,
  assertPaymentAmount,
  findPaymentByIdempotencyKey,
  toPublicPayment,
} from "./payment.service";
import { derivePaymentStatus, toPublicSale, getSale } from "./sale.service";
import { toPublicPurchase, getPurchase } from "./purchase.service";
import { withTransaction } from "../db/transactions";
import { ApiError } from "../utils/ApiError";

/**
 * Everything a settlement accepts. `type`, `customerId`, `supplierId`,
 * `saleId` and `purchaseId` are absent by design — they are derived from the
 * document being settled.
 */
export interface SettlementInput {
  businessId: string;
  shopId: string;
  amount: number;
  method: PaymentMethod;
  accountId: string;
  note?: string | null;
  idempotencyKey: string;
  paymentDate?: Date | string | null;
  localId?: string | null;
  /** Snapshotted from the verified token claims by the controller (05.13). */
  deviceId?: string | null;
}

export type SalePaymentResult = {
  payment: ReturnType<typeof toPublicPayment>;
  sale: ReturnType<typeof toPublicSale>;
  duplicate: boolean;
};

export type PurchasePaymentResult = {
  payment: ReturnType<typeof toPublicPayment>;
  purchase: ReturnType<typeof toPublicPurchase>;
  duplicate: boolean;
};

/**
 * Only a posted document can be settled. A DRAFT has no invoiceNo, no journal
 * and no due recorded against the party, so paying it would move money against
 * nothing; a VOIDED document has already had its due reversed, so paying it
 * would move money twice. Both are refused before any write.
 */
function assertSettleable(status: string, kind: "sale" | "purchase"): void {
  if (status === "DRAFT") {
    throw ApiError.badRequest(`A draft ${kind} cannot be settled — finalize it first`);
  }
  if (status === "VOIDED") {
    throw ApiError.badRequest(`A voided ${kind} cannot be settled`);
  }
}

export async function recordSalePayment(
  userId: string,
  businessId: string,
  shopId: string,
  saleId: string,
  input: SettlementInput
): Promise<SalePaymentResult> {
  assertPaymentAmount(input.amount);
  await assertCanRecordPayment(userId, businessId, shopId);
  if (!Types.ObjectId.isValid(saleId)) throw ApiError.notFound("Sale not found");

  const result = await withTransaction(async (session) => {
    const sale = await Sale.findOne({
      _id: new Types.ObjectId(saleId),
      businessId: new Types.ObjectId(businessId),
      shopId: new Types.ObjectId(shopId),
    }).session(session);
    if (!sale) throw ApiError.notFound("Sale not found");

    // Idempotency is checked BEFORE the state and overpayment guards: a replayed
    // request must return the original payment even though the sale it already
    // settled now has nothing left to pay.
    const replay = await findPaymentByIdempotencyKey(businessId, input.idempotencyKey, session);
    if (replay) return { payment: replay, sale, duplicate: true };

    assertSettleable(sale.status, "sale");
    if (!sale.customerId) {
      throw ApiError.badRequest("A walk-in sale has no customer to settle against");
    }
    if (sale.dueAmount <= 0) throw ApiError.badRequest("This sale is already fully paid");
    if (input.amount > sale.dueAmount) {
      throw ApiError.badRequest("Payment exceeds the sale outstanding due");
    }

    // The verified 05.05 engine does the money: Payment, customer due, account
    // credit, balanced journal, PAYMENT_RECORDED audit — in THIS transaction.
    const applied = await applyPaymentInSession(
      userId,
      {
        businessId,
        shopId,
        type: "customer_payment",
        customerId: String(sale.customerId),
        saleId: String(sale._id),
        amount: input.amount,
        method: input.method,
        accountId: input.accountId,
        note: input.note ?? null,
        idempotencyKey: input.idempotencyKey,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : null,
        localId: input.localId ?? null,
        deviceId: input.deviceId ?? null,
      },
      session
    );

    // Guarded $inc, never a read-modify-write: two settlements racing on the
    // same invoice can never drive dueAmount below zero.
    const updated = await Sale.findOneAndUpdate(
      {
        _id: sale._id,
        businessId: sale.businessId,
        dueAmount: { $gte: input.amount },
      },
      { $inc: { paidAmount: input.amount, dueAmount: -input.amount } },
      { new: true, session: session ?? undefined }
    );
    if (!updated) throw ApiError.badRequest("Payment exceeds the sale outstanding due");
    updated.paymentStatus = derivePaymentStatus(updated.total, updated.paidAmount);
    await updated.save({ session: session ?? undefined });

    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: sale.businessId,
          action: "SALE_PAYMENT_RECORDED",
          ip: null,
          details: JSON.stringify({
            saleId: String(sale._id),
            invoiceNo: sale.invoiceNo,
            paymentId: String(applied.payment._id),
            shopId,
            amount: input.amount,
            paidAmount: updated.paidAmount,
            dueAmount: updated.dueAmount,
            paymentStatus: updated.paymentStatus,
            idempotencyKey: input.idempotencyKey,
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return { payment: applied.payment, sale: updated, duplicate: false };

  });

  return {
    payment: toPublicPayment(result.payment),
    sale: toPublicSale(result.sale),
    duplicate: result.duplicate,
  };
}

export async function recordPurchasePayment(
  userId: string,
  businessId: string,
  shopId: string,
  purchaseId: string,
  input: SettlementInput
): Promise<PurchasePaymentResult> {
  assertPaymentAmount(input.amount);
  await assertCanRecordPayment(userId, businessId, shopId);
  if (!Types.ObjectId.isValid(purchaseId)) throw ApiError.notFound("Purchase not found");

  const result = await withTransaction(async (session) => {
    const purchase = await Purchase.findOne({
      _id: new Types.ObjectId(purchaseId),
      businessId: new Types.ObjectId(businessId),
      shopId: new Types.ObjectId(shopId),
    }).session(session);
    if (!purchase) throw ApiError.notFound("Purchase not found");

    const replay = await findPaymentByIdempotencyKey(businessId, input.idempotencyKey, session);
    if (replay) return { payment: replay, purchase, duplicate: true };

    assertSettleable(purchase.status, "purchase");
    if (purchase.dueAmount <= 0) throw ApiError.badRequest("This purchase is already fully paid");
    if (input.amount > purchase.dueAmount) {
      throw ApiError.badRequest("Payment exceeds the purchase outstanding due");
    }

    const applied = await applyPaymentInSession(
      userId,
      {
        businessId,
        shopId,
        type: "supplier_payment",
        supplierId: String(purchase.supplierId),
        purchaseId: String(purchase._id),
        amount: input.amount,
        method: input.method,
        accountId: input.accountId,
        note: input.note ?? null,
        idempotencyKey: input.idempotencyKey,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : null,
        localId: input.localId ?? null,
        deviceId: input.deviceId ?? null,
      },
      session
    );

    const updated = await Purchase.findOneAndUpdate(
      {
        _id: purchase._id,
        businessId: purchase.businessId,
        dueAmount: { $gte: input.amount },
      },
      { $inc: { paidAmount: input.amount, dueAmount: -input.amount } },
      { new: true, session: session ?? undefined }
    );
    if (!updated) throw ApiError.badRequest("Payment exceeds the purchase outstanding due");
    updated.paymentStatus = derivePaymentStatus(updated.total, updated.paidAmount);
    await updated.save({ session: session ?? undefined });

    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: purchase.businessId,
          action: "PURCHASE_PAYMENT_RECORDED",
          ip: null,
          details: JSON.stringify({
            purchaseId: String(purchase._id),
            invoiceNo: purchase.invoiceNo,
            paymentId: String(applied.payment._id),
            shopId,
            amount: input.amount,
            paidAmount: updated.paidAmount,
            dueAmount: updated.dueAmount,
            paymentStatus: updated.paymentStatus,
            idempotencyKey: input.idempotencyKey,
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return { payment: applied.payment, purchase: updated, duplicate: false };
  });

  return {
    payment: toPublicPayment(result.payment),
    purchase: toPublicPurchase(result.purchase),
    duplicate: result.duplicate,
  };
}

/**
 * Settlement history for one document. Tenant scope, shop scope and the 404
 * contract are delegated to the verified `getSale`/`getPurchase` readers, so a
 * foreign document's payments can never be enumerated. Reading is open to every
 * ACTIVE member, matching `GET /sales/:id`.
 */
export async function listSalePayments(
  userId: string,
  businessId: string,
  shopId: string,
  saleId: string
): Promise<ReturnType<typeof toPublicPayment>[]> {
  const sale = await getSale(userId, businessId, shopId, saleId);
  const payments = await Payment.find({
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
    saleId: new Types.ObjectId(sale.id),
  }).sort({ paymentDate: 1, createdAt: 1 });
  return payments.map(toPublicPayment);
}

export async function listPurchasePayments(
  userId: string,
  businessId: string,
  shopId: string,
  purchaseId: string
): Promise<ReturnType<typeof toPublicPayment>[]> {
  const purchase = await getPurchase(userId, businessId, shopId, purchaseId);
  const payments = await Payment.find({
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
    purchaseId: new Types.ObjectId(purchase.id),
  }).sort({ paymentDate: 1, createdAt: 1 });
  return payments.map(toPublicPayment);
}
