import { Types, ClientSession } from "mongoose";
import { Sale } from "../models/Sale";
import { Purchase } from "../models/Purchase";
import { StockMovement } from "../models/StockMovement";
import { Product } from "../models/Product";
import { Customer } from "../models/Customer";
import { Supplier } from "../models/Supplier";
import { Payment } from "../models/Payment";
import { Business } from "../models/Business";
import { AuditLog } from "../models/AuditLog";
import { JournalEntry, JournalReferenceType } from "../models/JournalEntry";
import { membershipFor } from "./membership";
import { incrementBalance, decrementBalance } from "./account.service";
import { reverseJournal } from "./journal.service";
import { toPublicSale } from "./sale.service";
import { toPublicPurchase } from "./purchase.service";
import { withTransaction } from "../db/transactions";
import { assertSafePaisa, roundPaisa } from "../utils/money";
import { ApiError } from "../utils/ApiError";

export interface VoidInput {
  reason?: string | null;
}

/**
 * PRD role matrix — voiding a posted financial document is an owner/manager
 * action. Inventory Manager may RECORD a purchase and Salesperson may record a
 * sale, but neither may unwind one; Accountant settles payments but does not
 * cancel source documents.
 */
const VOID_ROLES = ["Owner", "Admin", "Manager"] as const;

/** Service-level RBAC + tenant/shop scope — guards direct service calls too. */
async function assertCanVoid(userId: string, businessId: string, shopId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }
  if (!(VOID_ROLES as readonly string[]).includes(membership.role)) {
    throw ApiError.forbidden("Insufficient role");
  }
  return membership;
}

/**
 * Weighted-average cost after removing a purchase receipt.
 *
 * avgCost is a derived field, so it is NOT un-blended with the inverse of the
 * purchase formula (that only works when nothing happened since). It is derived
 * from inventory VALUE instead, which is what keeps the Product cache consistent
 * with the Inventory journal account the reversal credits:
 *
 *   remainingValue = currentStock × currentAvgCost − voidedCostAmount
 *   remainingStock = currentStock − voidedQty
 *   avgCost        = remainingValue / remainingStock
 *
 * Because the reversal credits Inventory by exactly `voidedCostAmount`, the
 * product's stored value drops by exactly the same figure — ledger and cache
 * stay in step, and a purchase voided while it is still the latest receipt
 * round-trips to the original avgCost even through paisa rounding.
 *
 * When no stock (or no value) remains the average is undefined, so it collapses
 * to 0 — the same degradation Sale already handles by falling back to
 * Product.purchasePrice for its cost snapshot.
 */
export function calcAvgCostAfterVoid(
  currentStock: number,
  currentAvgCost: number,
  voidedQty: number,
  voidedCostAmount: number
): number {
  assertSafePaisa(currentAvgCost, "avgCost");
  assertSafePaisa(voidedCostAmount, "costAmount");
  if (voidedQty <= 0) throw ApiError.badRequest("qty must be > 0");
  const remainingValue = currentStock * currentAvgCost - voidedCostAmount;
  const remainingStock = currentStock - voidedQty;
  if (remainingStock <= 0 || remainingValue <= 0) return 0;
  return roundPaisa(remainingValue / remainingStock);
}

/**
 * Reverse the journal a source document posted, using the verified 05.04
 * engine. The original entry and its lines are never mutated or deleted; a new
 * `REVERSAL` entry with mirrored debit/credit is written and linked back via
 * `reversesEntryId`.
 */
async function reverseSourceJournal(
  businessId: string,
  shopId: string,
  referenceType: JournalReferenceType,
  referenceId: Types.ObjectId,
  description: string,
  session: ClientSession | null
) {
  const original = await JournalEntry.findOne({
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
    referenceType,
    referenceId,
    isReversal: false,
  }).session(session);
  if (!original) {
    throw ApiError.badRequest(`No ${referenceType} journal entry was found to reverse`);
  }
  const reversal = await reverseJournal(
    businessId,
    shopId,
    String(original._id),
    description,
    session
  );
  return { original, reversal };
}

/**
 * Settlement payments recorded against a document are their own financial
 * records with their own journals and balance effects. Reversing them is not
 * part of 05.09, so a document that has any is refused rather than
 * double-refunded.
 */
async function assertNotSettled(
  businessId: Types.ObjectId,
  filter: Record<string, unknown>,
  label: string,
  session: ClientSession | null
) {
  const settled = await Payment.countDocuments({ businessId, ...filter }).session(session);
  if (settled > 0) {
    throw ApiError.badRequest(
      `This ${label} has recorded payments; reverse the payments before voiding it`
    );
  }
}

/**
 * Void a COMPLETED sale: restore stock, unwind the customer due and the cash
 * taken at sale time, mirror the journal, and flip the sale to VOIDED — all in
 * ONE MongoDB transaction. The sale document, its invoiceNo, its original
 * journal and its original audit trail are never deleted or mutated.
 *
 * Idempotent: voiding an already-VOIDED sale is a no-op that reports
 * `duplicate: true`.
 */
export async function voidSale(
  userId: string,
  businessId: string,
  shopId: string,
  saleId: string,
  input: VoidInput = {}
): Promise<{ sale: ReturnType<typeof toPublicSale>; duplicate: boolean }> {
  await assertCanVoid(userId, businessId, shopId);
  if (!Types.ObjectId.isValid(saleId)) throw ApiError.notFound("Sale not found");

  const result = await withTransaction(async (session) => {
    const sale = await Sale.findOne({
      _id: new Types.ObjectId(saleId),
      businessId: new Types.ObjectId(businessId),
      shopId: new Types.ObjectId(shopId),
    }).session(session);
    if (!sale) throw ApiError.notFound("Sale not found");
    // Re-void applies nothing a second time.
    if (sale.status === "VOIDED") return { sale, duplicate: true };
    if (sale.status !== "COMPLETED") {
      throw ApiError.badRequest("Only a completed sale can be voided");
    }
    await assertNotSettled(sale.businessId, { saleId: sale._id }, "sale", session);

    // --- Stock: put every sold unit back, with an immutable reversal movement ---
    for (const line of sale.items) {
      const product = await Product.findOne({
        _id: line.productId,
        businessId: sale.businessId,
      }).session(session);
      if (!product) throw ApiError.notFound("Product not found");

      const previous = await Product.findOneAndUpdate(
        { _id: product._id, businessId: sale.businessId },
        { $inc: { currentStock: line.qty } },
        { new: false, session: session ?? undefined }
      );
      if (!previous) throw ApiError.notFound("Product not found");

      await StockMovement.create(
        [
          {
            businessId: sale.businessId,
            shopId: sale.shopId,
            productId: product._id,
            type: "sale_void",
            qtyChange: line.qty,
            prevStock: previous.currentStock,
            newStock: previous.currentStock + line.qty,
            unitCost: line.costPrice,
            refType: "SALE_VOID",
            refId: sale._id,
            createdBy: new Types.ObjectId(userId),
          },
        ],
        { session: session ?? undefined, ordered: true }
      );
    }

    // --- Customer due: guarded so a settled due can never be driven negative ---
    if (sale.customerId && sale.dueAmount > 0) {
      const customer = await Customer.findOne({
        _id: sale.customerId,
        businessId: sale.businessId,
      }).session(session);
      if (!customer) throw ApiError.notFound("Customer not found");
      const res = await Customer.updateOne(
        {
          _id: customer._id,
          businessId: customer.businessId,
          currentDue: { $gte: sale.dueAmount },
        },
        { $inc: { currentDue: -sale.dueAmount } },
        { session: session ?? undefined }
      );
      if (res.matchedCount === 0) {
        throw ApiError.badRequest(
          "Customer due is lower than this sale's due; reverse the customer payment first"
        );
      }
    }

    // --- Account: the cash taken at sale time leaves again (guarded) ---
    if (sale.paidAmount > 0) {
      if (!sale.paymentAccountId) {
        throw ApiError.badRequest(
          "The account that received this sale's payment is unknown; it cannot be voided automatically"
        );
      }
      await decrementBalance(
        businessId,
        shopId,
        String(sale.paymentAccountId),
        sale.paidAmount,
        session
      );
    }

    // --- Journal: symmetric reversal, original untouched ---
    const { original, reversal } = await reverseSourceJournal(
      businessId,
      shopId,
      "SALE",
      sale._id as Types.ObjectId,
      `Void of sale ${sale.invoiceNo ?? String(sale._id)}`,
      session
    );

    // --- Status: COMPLETED → VOIDED. Amounts stay as the historical record. ---
    sale.status = "VOIDED";
    await sale.save({ session: session ?? undefined });

    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: sale.businessId,
          action: "SALE_VOIDED",
          ip: null,
          details: JSON.stringify({
            saleId: String(sale._id),
            invoiceNo: sale.invoiceNo,
            shopId,
            customerId: sale.customerId ? String(sale.customerId) : null,
            total: sale.total,
            paidAmount: sale.paidAmount,
            dueAmount: sale.dueAmount,
            originalEntryId: String(original._id),
            reversalEntryId: String(reversal.entry._id),
            reason: input.reason ?? null,
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return { sale, duplicate: false };
  });

  return { sale: toPublicSale(result.sale), duplicate: result.duplicate };
}

/**
 * Void a COMPLETED purchase: remove the received stock, restore the weighted
 * average cost, unwind the supplier payable and refund the cash paid at purchase
 * time, mirror the journal, and flip the purchase to VOIDED — all in ONE
 * MongoDB transaction. Nothing is deleted; the purchase keeps its invoiceNo,
 * its original journal and its original audit entry.
 *
 * Idempotent: voiding an already-VOIDED purchase reports `duplicate: true`.
 */
export async function voidPurchase(
  userId: string,
  businessId: string,
  shopId: string,
  purchaseId: string,
  input: VoidInput = {}
): Promise<{ purchase: ReturnType<typeof toPublicPurchase>; duplicate: boolean }> {
  await assertCanVoid(userId, businessId, shopId);
  if (!Types.ObjectId.isValid(purchaseId)) throw ApiError.notFound("Purchase not found");

  const result = await withTransaction(async (session) => {
    const purchase = await Purchase.findOne({
      _id: new Types.ObjectId(purchaseId),
      businessId: new Types.ObjectId(businessId),
      shopId: new Types.ObjectId(shopId),
    }).session(session);
    if (!purchase) throw ApiError.notFound("Purchase not found");
    if (purchase.status === "VOIDED") return { purchase, duplicate: true };
    if (purchase.status !== "COMPLETED") {
      throw ApiError.badRequest("Only a completed purchase can be voided");
    }
    await assertNotSettled(
      purchase.businessId,
      { purchaseId: purchase._id },
      "purchase",
      session
    );

    const business = await Business.findById(purchase.businessId).session(session);
    if (!business) throw ApiError.notFound("Business not found");

    // --- Stock out + avgCost restored + reversal movement, per line ---
    for (const line of purchase.items) {
      const product = await Product.findOne({
        _id: line.productId,
        businessId: purchase.businessId,
      }).session(session);
      if (!product) throw ApiError.notFound("Product not found");

      // Same stock policy as Sale: the guarded $inc refuses to drive stock
      // negative unless the business explicitly allows it. Goods already sold
      // on cannot be un-received by default.
      const guard = business.allowNegativeStock ? {} : { currentStock: { $gte: line.qty } };
      const previous = await Product.findOneAndUpdate(
        { _id: product._id, businessId: purchase.businessId, ...guard },
        { $inc: { currentStock: -line.qty } },
        { new: false, session: session ?? undefined }
      );
      if (!previous) {
        throw ApiError.badRequest(`Insufficient stock to void this purchase for ${product.name}`);
      }

      const restoredAvgCost = calcAvgCostAfterVoid(
        previous.currentStock,
        previous.avgCost,
        line.qty,
        line.costAmount
      );
      await Product.updateOne(
        { _id: product._id, businessId: purchase.businessId },
        { $set: { avgCost: restoredAvgCost } },
        { session: session ?? undefined }
      );

      await StockMovement.create(
        [
          {
            businessId: purchase.businessId,
            shopId: purchase.shopId,
            productId: product._id,
            type: "purchase_void",
            qtyChange: -line.qty,
            prevStock: previous.currentStock,
            newStock: previous.currentStock - line.qty,
            unitCost: line.netUnitCost,
            refType: "PURCHASE_VOID",
            refId: purchase._id,
            createdBy: new Types.ObjectId(userId),
          },
        ],
        { session: session ?? undefined, ordered: true }
      );
    }

    // --- Supplier payable: guarded so a settled payable never goes negative ---
    if (purchase.dueAmount > 0) {
      const supplier = await Supplier.findOne({
        _id: purchase.supplierId,
        businessId: purchase.businessId,
      }).session(session);
      if (!supplier) throw ApiError.notFound("Supplier not found");
      const res = await Supplier.updateOne(
        {
          _id: supplier._id,
          businessId: supplier.businessId,
          currentPayable: { $gte: purchase.dueAmount },
        },
        { $inc: { currentPayable: -purchase.dueAmount } },
        { session: session ?? undefined }
      );
      if (res.matchedCount === 0) {
        throw ApiError.badRequest(
          "Supplier payable is lower than this purchase's due; reverse the supplier payment first"
        );
      }
    }

    // --- Account: the cash paid to the supplier comes back in ---
    if (purchase.paidAmount > 0) {
      if (!purchase.paymentAccountId) {
        throw ApiError.badRequest(
          "The account that paid this purchase is unknown; it cannot be voided automatically"
        );
      }
      await incrementBalance(
        businessId,
        shopId,
        String(purchase.paymentAccountId),
        purchase.paidAmount,
        session
      );
    }

    // --- Journal: symmetric reversal, original untouched ---
    const { original, reversal } = await reverseSourceJournal(
      businessId,
      shopId,
      "PURCHASE",
      purchase._id as Types.ObjectId,
      `Void of purchase ${purchase.invoiceNo ?? String(purchase._id)}`,
      session
    );

    // --- Status: COMPLETED → VOIDED. Amounts stay as the historical record. ---
    purchase.status = "VOIDED";
    await purchase.save({ session: session ?? undefined });

    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: purchase.businessId,
          action: "PURCHASE_VOIDED",
          ip: null,
          details: JSON.stringify({
            purchaseId: String(purchase._id),
            invoiceNo: purchase.invoiceNo,
            shopId,
            supplierId: String(purchase.supplierId),
            total: purchase.total,
            paidAmount: purchase.paidAmount,
            dueAmount: purchase.dueAmount,
            originalEntryId: String(original._id),
            reversalEntryId: String(reversal.entry._id),
            reason: input.reason ?? null,
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return { purchase, duplicate: false };
  });

  return { purchase: toPublicPurchase(result.purchase), duplicate: result.duplicate };
}
