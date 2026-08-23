import { Types, ClientSession } from "mongoose";
import { Sale, SaleDocument } from "../models/Sale";
import { Purchase, PurchaseDocument } from "../models/Purchase";
import { StockMovement } from "../models/StockMovement";
import { Product } from "../models/Product";
import { Customer } from "../models/Customer";
import { Supplier } from "../models/Supplier";
import { Business } from "../models/Business";
import { AuditLog } from "../models/AuditLog";
import { JournalEntry } from "../models/JournalEntry";
import { JournalLine } from "../models/JournalLine";
import { StockReturn } from "../models/StockReturn";
import { membershipFor, isDuplicateKeyError } from "./membership";
import { incrementBalance, decrementBalance } from "./account.service";
import { writeJournal, JournalLineInput } from "./journal.service";
import { JOURNAL_ACCOUNTS } from "../config/accounts";
import { toPublicSale } from "./sale.service";
import { toPublicPurchase } from "./purchase.service";
import { withTransaction } from "../db/transactions";
import { assertSafePaisa, roundPaisa } from "../utils/money";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 06 â€” Sales & Purchase returns.
 *
 * A return reverses a PORTION (or all) of a completed sale/purchase:
 *   - stock is restored/removed with an immutable `sale_return`/`purchase_return`
 *     StockMovement,
 *   - the customer due / supplier payable is adjusted,
 *   - the cash paid at the time is refunded/collected back,
 *   - a NEW balanced journal entry (SALE_RETURN / PURCHASE_RETURN) is written
 *     that reverses the proportional amounts of the original entry,
 *   - an audit record is written.
 *
 * The original sale/purchase document, its invoiceNo, its original journal and
 * its original audit trail are NEVER mutated or deleted.
 *
 * Concurrency safety: each line carries a `returnedQty` counter. The return
 * transaction uses a guarded atomic `$inc` (`returnedQty + qty <= originalQty`)
 * so concurrent returns can never drive the cumulative returned quantity above
 * the original quantity â€” no double stock restoration, no double financial
 * reversal.
 *
 * Idempotency: a `localId` makes a retried return resolve to the original
 * return document (duplicate:true) instead of applying twice.
 */

const RETURN_ROLES = ["Owner", "Admin", "Manager"] as const;

async function assertCanReturn(userId: string, businessId: string, shopId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }
  if (!(RETURN_ROLES as readonly string[]).includes(membership.role)) {
    throw ApiError.forbidden("Insufficient role");
  }
  return membership;
}

export interface ReturnLineInput {
  productId: string;
  qty: number;
}

export interface SaleReturnInput {
  businessId: string;
  shopId: string;
  saleId: string;
  items: ReturnLineInput[];
  reason?: string | null;
  localId?: string | null;
}

export interface PurchaseReturnInput {
  businessId: string;
  shopId: string;
  purchaseId: string;
  items: ReturnLineInput[];
  reason?: string | null;
  localId?: string | null;
}

/**
 * Compute the proportional reversal of the original journal for the returned
 * lines. The original entry's lines are read; each line's debit/credit is
 * scaled by (returnedAmount / originalAmount) for the returned product lines.
 *
 * Because the original journal is balanced (debit === credit), scaling every
 * line by the same ratio keeps the reversal balanced.
 */
/**
 * Phase 07 â€” spec-shaped return journals.
 *
 * The original entry's lines are routed by account semantics (never mirrored
 * blindly) so the P&L presents dedicated contra accounts:
 *
 * SALE_RETURN (per phase-07.md):
 *   Dr Sales Returns (net revenue share)   | Cr Cash/Bank (paid share)
 *   Dr Tax Payable (tax share)             | Cr Customer Receivable (due share)
 *   Dr Inventory (EXACT Î£ returnedQtyÃ—costPrice) | Cr Cost of Goods Sold (same)
 *
 * PURCHASE_RETURN keeps the perpetual-inventory release (Cr Inventory) so the
 * Inventory GL never diverges from physical stock value; the remaining legs
 * mirror the original proportionally.
 *
 * Every independently rounded line can drift Â±1 paisa from perfect balance,
 * so `reconcileLines` moves any residual onto the largest-magnitude line.
 */

function reconcileLines(lines: JournalLineInput[]): JournalLineInput[] {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const l of lines) {
    debitTotal += l.debit;
    creditTotal += l.credit;
  }
  const delta = debitTotal - creditTotal;
  if (delta === 0) return lines;
  if (delta > 0) {
    // Too much debit: shave the residual off the largest debit line.
    let target = lines[0];
    for (const l of lines) if (l.debit > target.debit) target = l;
    target.debit -= delta;
  } else {
    let target = lines[0];
    for (const l of lines) if (l.credit > target.credit) target = l;
    target.credit += delta;
  }
  return lines.filter((l) => l.debit !== 0 || l.credit !== 0);
}

export async function buildSaleReturnJournalLines(
  businessId: string,
  shopId: string,
  sale: SaleDocument,
  returnedAmount: number,
  returnedCost: number,
  session: ClientSession | null
): Promise<JournalLineInput[]> {
  if (returnedAmount <= 0) return [];
  const original = await JournalEntry.findOne({
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
    referenceType: "SALE",
    referenceId: sale._id as Types.ObjectId,
    isReversal: false,
  }).session(session);
  if (!original) {
    throw ApiError.badRequest("No SALE journal entry was found to reverse");
  }
  const originalLines = await JournalLine.find({ entryId: original._id }).session(session);
  if (originalLines.length === 0) {
    throw ApiError.badRequest("Original journal has no lines to reverse");
  }

  const ratio = returnedAmount / sale.total;
  const lines: JournalLineInput[] = [];
  for (const line of originalLines) {
    if (
      line.accountName === JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD ||
      line.accountName === JOURNAL_ACCOUNTS.INVENTORY
    ) {
      continue; // handled exactly below, not ratio-scaled
    }
    const scaledDebit = roundPaisa(line.debit * ratio);
    const scaledCredit = roundPaisa(line.credit * ratio);
    if (line.accountName === JOURNAL_ACCOUNTS.SALES_REVENUE) {
      if (scaledCredit > 0) {
        lines.push({
          accountName: JOURNAL_ACCOUNTS.SALES_RETURNS,
          accountType: "REVENUE",
          debit: scaledCredit,
          credit: 0,
        });
      }
      continue;
    }
    // Tax Payable / Customer Receivable / cash assets mirror with swapped sides.
    if (scaledDebit > 0 || scaledCredit > 0) {
      lines.push({
        accountName: line.accountName,
        accountType: line.accountType as JournalLineInput["accountType"],
        debit: scaledCredit,
        credit: scaledDebit,
      });
    }
  }
  // Exact inventory restoration + COGS reversal from the cost snapshots.
  if (returnedCost > 0) {
    lines.push({
      accountName: JOURNAL_ACCOUNTS.INVENTORY,
      accountType: "ASSET",
      debit: returnedCost,
      credit: 0,
    });
    lines.push({
      accountName: JOURNAL_ACCOUNTS.COST_OF_GOODS_SOLD,
      accountType: "EXPENSE",
      debit: 0,
      credit: returnedCost,
    });
  }
  return reconcileLines(lines);
}

export async function buildPurchaseReturnJournalLines(
  businessId: string,
  shopId: string,
  purchase: PurchaseDocument,
  returnedAmount: number,
  session: ClientSession | null
): Promise<JournalLineInput[]> {
  if (returnedAmount <= 0) return [];
  const original = await JournalEntry.findOne({
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
    referenceType: "PURCHASE",
    referenceId: purchase._id as Types.ObjectId,
    isReversal: false,
  }).session(session);
  if (!original) {
    throw ApiError.badRequest("No PURCHASE journal entry was found to reverse");
  }
  const originalLines = await JournalLine.find({ entryId: original._id }).session(session);
  if (originalLines.length === 0) {
    throw ApiError.badRequest("Original journal has no lines to reverse");
  }

  const ratio = returnedAmount / purchase.total;
  const lines: JournalLineInput[] = [];
  for (const line of originalLines) {
    const scaledDebit = roundPaisa(line.debit * ratio);
    const scaledCredit = roundPaisa(line.credit * ratio);
    if (scaledDebit > 0 || scaledCredit > 0) {
      lines.push({
        accountName: line.accountName,
        accountType: line.accountType as JournalLineInput["accountType"],
        debit: scaledCredit,
        credit: scaledDebit,
      });
    }
  }
  return reconcileLines(lines);
}

/**
 * Return a portion (or all) of a COMPLETED sale.
 *
 * For each returned line:
 *   - guarded atomic `$inc` on the line's `returnedQty` (never exceeds qty),
 *   - stock restored with a `sale_return` movement,
 *   - the proportional revenue/tax is reversed via a balanced SALE_RETURN
 *     journal entry,
 *   - the customer due is reduced by the returned due portion,
 *   - the cash paid at sale time is refunded (guarded) by the returned paid
 *     portion.
 */
export async function returnSale(
  userId: string,
  input: SaleReturnInput
): Promise<{ sale: ReturnType<typeof toPublicSale>; duplicate: boolean }> {
  await assertCanReturn(userId, input.businessId, input.shopId);
  if (!Types.ObjectId.isValid(input.saleId)) throw ApiError.notFound("Sale not found");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw ApiError.badRequest("At least one return line is required");
  }

  let result: { sale: SaleDocument; duplicate: boolean };
  try {
    result = await withTransaction(async (session) => {
      const sale = await Sale.findOne({
        _id: new Types.ObjectId(input.saleId),
        businessId: new Types.ObjectId(input.businessId),
        shopId: new Types.ObjectId(input.shopId),
      }).session(session);
      if (!sale) throw ApiError.notFound("Sale not found");
      if (sale.status !== "COMPLETED") {
        throw ApiError.badRequest("Only a completed sale can be returned");
      }

      // Offline-sync idempotency: the same localId never applies a second
      // return â€” a retried request resolves to the original's effects.
      if (input.localId) {
        const existing = await StockReturn.findOne({
          businessId: new Types.ObjectId(input.businessId),
          localId: input.localId,
        }).session(session);
        if (existing) return { sale, duplicate: true };
      }

      const business = await Business.findById(sale.businessId).session(session);
      if (!business) throw ApiError.notFound("Business not found");

      // Validate each return line against the sale's own items.
      let totalReturnedAmount = 0;
      let totalReturnedPaid = 0;
      let totalReturnedDue = 0;
      let totalReturnedCost = 0;

      // The immutable return record â€” also the refId of every reversal
      // StockMovement, the reversal journal entry and the audit row.
      const created = await StockReturn.create(
        [
          {
            businessId: sale.businessId,
            shopId: sale.shopId,
            type: "SALE_RETURN",
            sourceDocId: sale._id,
            items: input.items.map((line) => ({
              productId: new Types.ObjectId(line.productId),
              qty: line.qty,
            })),
            returnedAmount: 0,
            returnedPaid: 0,
            returnedDue: 0,
            reason: input.reason ?? null,
            createdBy: new Types.ObjectId(userId),
            localId: input.localId ?? null,
          },
        ],
        { session: session ?? undefined, ordered: true }
      );
      const stockReturn = created[0];
      const returnRefId = stockReturn._id;

      for (const line of input.items) {
      if (!Types.ObjectId.isValid(line.productId)) throw ApiError.notFound("Product not found");
      const qty = assertSafePaisa(line.qty, "qty");
      if (qty <= 0) throw ApiError.badRequest("qty must be > 0");

      const saleLine = sale.items.find(
        (it) => String(it.productId) === line.productId
      );
      if (!saleLine) throw ApiError.badRequest("Product is not part of this sale");

      // Guarded atomic $inc: returnedQty + qty <= original qty. Using $expr with
      // $arrayElemAt keeps the guard evaluated against the document's CURRENT
      // state at update time, so concurrent returns can never over-return.
      const updated = await Sale.findOneAndUpdate(
        {
          _id: sale._id,
          businessId: sale.businessId,
          items: { $elemMatch: { productId: saleLine.productId } },
          $expr: {
            $lte: [
              { $add: [{ $arrayElemAt: ["$items.returnedQty", { $indexOfArray: ["$items.productId", saleLine.productId] }] }, qty] },
              { $arrayElemAt: ["$items.qty", { $indexOfArray: ["$items.productId", saleLine.productId] }] },
            ],
          },
        },
        { $inc: { "items.$[elem].returnedQty": qty } },
        {
          arrayFilters: [{ "elem.productId": saleLine.productId }],
          new: true,
          session: session ?? undefined,
        }
      );
      if (!updated) {
        throw ApiError.badRequest(
          `Return quantity exceeds the remaining returnable quantity for ${saleLine.productName}`
        );
      }

      // Stock: restore the returned units.
      const product = await Product.findOne({
        _id: saleLine.productId,
        businessId: sale.businessId,
      }).session(session);
      if (!product) throw ApiError.notFound("Product not found");
      const previous = await Product.findOneAndUpdate(
        { _id: product._id, businessId: product.businessId },
        { $inc: { currentStock: qty } },
        { new: false, session: session ?? undefined }
      );
      if (!previous) throw ApiError.notFound("Product not found");
      await StockMovement.create(
        [
          {
            businessId: sale.businessId,
            shopId: sale.shopId,
            productId: product._id,
            type: "sale_return",
            qtyChange: qty,
            prevStock: previous.currentStock,
            newStock: previous.currentStock + qty,
            unitCost: saleLine.costPrice,
            refType: "SALE_RETURN",
            refId: returnRefId,
            createdBy: new Types.ObjectId(userId),
          },
        ],
        { session: session ?? undefined, ordered: true }
      );

      // Proportional financial reversal for this line.
      const lineTotal = saleLine.lineTotal;
      const lineRatio = qty / saleLine.qty;
      const lineReturnedAmount = roundPaisa(lineTotal * lineRatio);
      totalReturnedAmount += lineReturnedAmount;
      // The paid/due split follows the sale's overall paid/due ratio.
      const paidRatio = sale.total > 0 ? sale.paidAmount / sale.total : 0;
      totalReturnedPaid += roundPaisa(lineReturnedAmount * paidRatio);
      totalReturnedDue += lineReturnedAmount - roundPaisa(lineReturnedAmount * paidRatio);
      // Phase 07: exact COGS/inventory value from the authoritative snapshot.
      totalReturnedCost += qty * saleLine.costPrice;
    }

    // Persist the authoritative reversal totals on the return record.
    stockReturn.returnedAmount = totalReturnedAmount;
    stockReturn.returnedPaid = totalReturnedPaid;
    stockReturn.returnedDue = totalReturnedDue;
    await stockReturn.save({ session: session ?? undefined });

    // Customer due: reduce by the returned due portion (guarded).
    if (sale.customerId && totalReturnedDue > 0) {
      const customer = await Customer.findOne({
        _id: sale.customerId,
        businessId: sale.businessId,
      }).session(session);
      if (!customer) throw ApiError.notFound("Customer not found");
      const res = await Customer.updateOne(
        {
          _id: customer._id,
          businessId: customer.businessId,
          currentDue: { $gte: totalReturnedDue },
        },
        { $inc: { currentDue: -totalReturnedDue } },
        { session: session ?? undefined }
      );
      if (res.matchedCount === 0) {
        throw ApiError.badRequest(
          "Customer due is lower than the returned due; reverse the customer payment first"
        );
      }
    }

    // Refund the cash paid at sale time (guarded).
    if (totalReturnedPaid > 0) {
      if (!sale.paymentAccountId) {
        throw ApiError.badRequest(
          "The account that received this sale's payment is unknown; it cannot be refunded automatically"
        );
      }
      await decrementBalance(
        input.businessId,
        input.shopId,
        String(sale.paymentAccountId),
        totalReturnedPaid,
        session
      );
    }

    // Balanced journal reversal (SALE_RETURN) — Phase 07 contra accounting.
    if (totalReturnedAmount > 0) {
      const lines = await buildSaleReturnJournalLines(
        input.businessId,
        input.shopId,
        sale,
        totalReturnedAmount,
        totalReturnedCost,
        session
      );
      if (lines.length > 0) {
        await writeJournal(
          {
            businessId: input.businessId,
            shopId: input.shopId,
            description: `Return of sale ${sale.invoiceNo ?? String(sale._id)}`,
            referenceType: "SALE_RETURN",
            referenceId: String(returnRefId),
            lines,
          },
          session
        );
      }
    }

    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: sale.businessId,
          action: "SALE_RETURNED",
          ip: null,
          details: JSON.stringify({
            saleId: String(sale._id),
            invoiceNo: sale.invoiceNo,
            shopId: input.shopId,
            returnId: String(returnRefId),
            returnedAmount: totalReturnedAmount,
            returnedPaid: totalReturnedPaid,
            returnedDue: totalReturnedDue,
            reason: input.reason ?? null,
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return { sale, duplicate: false };
    });
  } catch (err) {
    // A concurrent create with the same localId lost the race on the unique
    // index â€” the original return's effects stand; this call adds nothing.
    if (isDuplicateKeyError(err) && input.localId) {
      const existing = await StockReturn.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      });
      const freshSale = existing
        ? await Sale.findOne({
            _id: new Types.ObjectId(input.saleId),
            businessId: new Types.ObjectId(input.businessId),
            shopId: new Types.ObjectId(input.shopId),
          })
        : null;
      if (existing && freshSale) {
        return { sale: toPublicSale(freshSale), duplicate: true };
      }
    }
    throw err;
  }

  return { sale: toPublicSale(result.sale), duplicate: result.duplicate };
}

/**
 * Return a portion (or all) of a COMPLETED purchase.
 *
 * For each returned line:
 *   - guarded atomic `$inc` on the line's `returnedQty` (never exceeds qty),
 *   - stock removed with a `purchase_return` movement,
 *   - the proportional inventory cost is reversed via a balanced
 *     PURCHASE_RETURN journal entry,
 *   - the supplier payable is reduced by the returned due portion,
 *   - the cash paid at purchase time is collected back (guarded) by the
 *     returned paid portion.
 */
export async function returnPurchase(
  userId: string,
  input: PurchaseReturnInput
): Promise<{ purchase: ReturnType<typeof toPublicPurchase>; duplicate: boolean }> {
  await assertCanReturn(userId, input.businessId, input.shopId);
  if (!Types.ObjectId.isValid(input.purchaseId)) throw ApiError.notFound("Purchase not found");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw ApiError.badRequest("At least one return line is required");
  }

  let result: { purchase: PurchaseDocument; duplicate: boolean };
  try {
    result = await withTransaction(async (session) => {
    const purchase = await Purchase.findOne({
      _id: new Types.ObjectId(input.purchaseId),
      businessId: new Types.ObjectId(input.businessId),
      shopId: new Types.ObjectId(input.shopId),
    }).session(session);
    if (!purchase) throw ApiError.notFound("Purchase not found");
    if (purchase.status !== "COMPLETED") {
      throw ApiError.badRequest("Only a completed purchase can be returned");
    }

    // Offline-sync idempotency: the same localId never applies a second
    // return â€” a retried request resolves to the original's effects.
    if (input.localId) {
      const existing = await StockReturn.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      }).session(session);
      if (existing) return { purchase, duplicate: true };
    }

    const business = await Business.findById(purchase.businessId).session(session);
    if (!business) throw ApiError.notFound("Business not found");

    let totalReturnedAmount = 0;
    let totalReturnedPaid = 0;
    let totalReturnedDue = 0;

    // The immutable return record â€” also the refId of every reversal
    // StockMovement, the reversal journal entry and the audit row.
    const created = await StockReturn.create(
      [
        {
          businessId: purchase.businessId,
          shopId: purchase.shopId,
          type: "PURCHASE_RETURN",
          sourceDocId: purchase._id,
          items: input.items.map((line) => ({
            productId: new Types.ObjectId(line.productId),
            qty: line.qty,
          })),
          returnedAmount: 0,
          returnedPaid: 0,
          returnedDue: 0,
          reason: input.reason ?? null,
          createdBy: new Types.ObjectId(userId),
          localId: input.localId ?? null,
        },
      ],
      { session: session ?? undefined, ordered: true }
    );
    const stockReturn = created[0];
    const returnRefId = stockReturn._id;

    for (const line of input.items) {
      if (!Types.ObjectId.isValid(line.productId)) throw ApiError.notFound("Product not found");
      const qty = assertSafePaisa(line.qty, "qty");
      if (qty <= 0) throw ApiError.badRequest("qty must be > 0");

      const purchaseLine = purchase.items.find(
        (it) => String(it.productId) === line.productId
      );
      if (!purchaseLine) throw ApiError.badRequest("Product is not part of this purchase");

      // Guarded atomic $inc: returnedQty + qty <= original qty. Using $expr with
      // $arrayElemAt keeps the guard evaluated against the document's CURRENT
      // state at the atomic update, so concurrent returns can never make it exceed.
      const updated = await Purchase.findOneAndUpdate(
        {
          _id: purchase._id,
          businessId: purchase.businessId,
          items: { $elemMatch: { productId: purchaseLine.productId } },
          $expr: {
            $lte: [
              { $add: [{ $arrayElemAt: ["$items.returnedQty", { $indexOfArray: ["$items.productId", purchaseLine.productId] }] }, qty] },
              { $arrayElemAt: ["$items.qty", { $indexOfArray: ["$items.productId", purchaseLine.productId] }] },
            ],
          },
        },
        { $inc: { "items.$[elem].returnedQty": qty } },
        {
          arrayFilters: [{ "elem.productId": purchaseLine.productId }],
          new: true,
          session: session ?? undefined,
        }
      );
      if (!updated) {
        throw ApiError.badRequest(
          `Return quantity exceeds the remaining returnable quantity for ${purchaseLine.productName}`
        );
      }

      // Stock: remove the returned units (respecting allowNegativeStock).
      const product = await Product.findOne({
        _id: purchaseLine.productId,
        businessId: purchase.businessId,
      }).session(session);
      if (!product) throw ApiError.notFound("Product not found");
      const guard = business.allowNegativeStock ? {} : { currentStock: { $gte: qty } };
      const previous = await Product.findOneAndUpdate(
        { _id: product._id, businessId: product.businessId, ...guard },
        { $inc: { currentStock: -qty } },
        { new: false, session: session ?? undefined }
      );
      if (!previous) {
        throw ApiError.badRequest(`Insufficient stock to return this purchase for ${product.name}`);
      }
      await StockMovement.create(
        [
          {
            businessId: purchase.businessId,
            shopId: purchase.shopId,
            productId: product._id,
            type: "purchase_return",
            qtyChange: -qty,
            prevStock: previous.currentStock,
            newStock: previous.currentStock - qty,
            unitCost: purchaseLine.netUnitCost,
            refType: "PURCHASE_RETURN",
            refId: returnRefId,
            createdBy: new Types.ObjectId(userId),
          },
        ],
        { session: session ?? undefined, ordered: true }
      );

      // Proportional financial reversal for this line.
      const lineTotal = purchaseLine.lineTotal;
      const lineRatio = qty / purchaseLine.qty;
      const lineReturnedAmount = roundPaisa(lineTotal * lineRatio);
      totalReturnedAmount += lineReturnedAmount;
      const paidRatio = purchase.total > 0 ? purchase.paidAmount / purchase.total : 0;
      totalReturnedPaid += roundPaisa(lineReturnedAmount * paidRatio);
      totalReturnedDue += lineReturnedAmount - roundPaisa(lineReturnedAmount * paidRatio);
    }

    // Persist the authoritative reversal totals on the return record.
    stockReturn.returnedAmount = totalReturnedAmount;
    stockReturn.returnedPaid = totalReturnedPaid;
    stockReturn.returnedDue = totalReturnedDue;
    await stockReturn.save({ session: session ?? undefined });

    // Supplier payable: reduce by the returned due portion (guarded).
    if (totalReturnedDue > 0) {
      const supplier = await Supplier.findOne({
        _id: purchase.supplierId,
        businessId: purchase.businessId,
      }).session(session);
      if (!supplier) throw ApiError.notFound("Supplier not found");
      const res = await Supplier.updateOne(
        {
          _id: supplier._id,
          businessId: supplier.businessId,
          currentPayable: { $gte: totalReturnedDue },
        },
        { $inc: { currentPayable: -totalReturnedDue } },
        { session: session ?? undefined }
      );
      if (res.matchedCount === 0) {
        throw ApiError.badRequest(
          "Supplier payable is lower than the returned due; reverse the supplier payment first"
        );
      }
    }

    // Collect back the cash paid at purchase time (guarded).
    if (totalReturnedPaid > 0) {
      if (!purchase.paymentAccountId) {
        throw ApiError.badRequest(
          "The account that paid this purchase is unknown; it cannot be refunded automatically"
        );
      }
      await incrementBalance(
        input.businessId,
        input.shopId,
        String(purchase.paymentAccountId),
        totalReturnedPaid,
        session
      );
    }

    // Balanced journal reversal (PURCHASE_RETURN).
    if (totalReturnedAmount > 0) {
      const lines = await buildPurchaseReturnJournalLines(
        input.businessId,
        input.shopId,
        purchase,
        totalReturnedAmount,
        session
      );
      if (lines.length > 0) {
        await writeJournal(
          {
            businessId: input.businessId,
            shopId: input.shopId,
            description: `Return of purchase ${purchase.invoiceNo ?? String(purchase._id)}`,
            referenceType: "PURCHASE_RETURN",
            referenceId: String(returnRefId),
            lines,
          },
          session
        );
      }
    }

    await AuditLog.create(
      [
        {
          userId: new Types.ObjectId(userId),
          businessId: purchase.businessId,
          action: "PURCHASE_RETURNED",
          ip: null,
          details: JSON.stringify({
            purchaseId: String(purchase._id),
            invoiceNo: purchase.invoiceNo,
            shopId: input.shopId,
            returnId: String(returnRefId),
            returnedAmount: totalReturnedAmount,
            returnedPaid: totalReturnedPaid,
            returnedDue: totalReturnedDue,
            reason: input.reason ?? null,
          }),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );

    return { purchase, duplicate: false };
    });
  } catch (err) {
    // A concurrent create with the same localId lost the race on the unique
    // index â€” the original return's effects stand; this call adds nothing.
    if (isDuplicateKeyError(err) && input.localId) {
      const existing = await StockReturn.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      });
      const freshPurchase = existing
        ? await Purchase.findOne({
            _id: new Types.ObjectId(input.purchaseId),
            businessId: new Types.ObjectId(input.businessId),
            shopId: new Types.ObjectId(input.shopId),
          })
        : null;
      if (existing && freshPurchase) {
        return { purchase: toPublicPurchase(freshPurchase), duplicate: true };
      }
    }
    throw err;
  }

  return { purchase: toPublicPurchase(result.purchase), duplicate: result.duplicate };
}

// Re-export the serializers so the controller can map documents.
export { toPublicSale, toPublicPurchase };
