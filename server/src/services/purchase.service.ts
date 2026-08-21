import { Types, ClientSession } from "mongoose";
import {
  Purchase,
  PurchaseDocument,
  PurchaseItem,
  PURCHASE_STATUSES,
  PURCHASE_PAYMENT_STATUSES,
} from "../models/Purchase";
import { StockMovement } from "../models/StockMovement";
import { Product } from "../models/Product";
import { Supplier } from "../models/Supplier";
import { Account } from "../models/Account";
import { Business, BusinessDocument } from "../models/Business";
import { Shop } from "../models/Shop";
import { AuditLog } from "../models/AuditLog";
import {
  JOURNAL_ACCOUNTS,
  JOURNAL_ACCOUNT_TYPES,
  JournalAccountType,
  journalAssetAccountFor,
} from "../config/accounts";
import { membershipFor, isDuplicateKeyError } from "./membership";
import { decrementBalance } from "./account.service";
import { writeJournal, JournalLineInput } from "./journal.service";
import { nextSequence, COUNTER_KEYS } from "./counter.service";
import { derivePaymentStatus } from "./sale.service";
import { withTransaction } from "../db/transactions";
import {
  assertSafePaisa,
  roundPaisa,
  calcLineTotal,
  calcLineTax,
  calcDiscount,
  calcFlatDiscount,
  calcTotal,
  calcDue,
} from "../utils/money";
import { fiscalYearOf, formatDocumentNo } from "../utils/invoice";
import { parsePagination, buildPagination } from "../utils/pagination";
import { ApiError } from "../utils/ApiError";

export interface PurchaseItemInput {
  productId: string;
  qty: number;
  unitPrice?: number;
  discountAmount?: number;
}

export interface PurchasePaymentInput {
  paidAmount?: number;
  accountId?: string | null;
}

export interface CreatePurchaseInput extends PurchasePaymentInput {
  businessId: string;
  shopId: string;
  supplierId: string;
  supplierInvoiceNo?: string | null;
  items: PurchaseItemInput[];
  discountAmount?: number;
  discountPercent?: number;
  notes?: string | null;
  purchaseDate?: Date | string | null;
  localId?: string | null;
  /** Snapshotted from the verified token claims by the controller (05.13). */
  deviceId?: string | null;
  draft?: boolean;
}

export interface ListPurchasesQuery {
  page?: unknown;
  limit?: unknown;
  status?: unknown;
  paymentStatus?: unknown;
  supplierId?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
}

function itemToPublic(item: PurchaseItem) {
  return {
    productId: String(item.productId),
    productName: item.productName,
    qty: item.qty,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    taxAmount: item.taxAmount,
    netAmount: item.netAmount,
    costAmount: item.costAmount,
    netUnitCost: item.netUnitCost,
    lineTotal: item.lineTotal,
  };
}

function toPublic(p: PurchaseDocument) {
  return {
    id: String(p._id),
    businessId: String(p.businessId),
    shopId: String(p.shopId),
    invoiceNo: p.invoiceNo,
    supplierInvoiceNo: p.supplierInvoiceNo,
    supplierId: String(p.supplierId),
    supplierName: p.supplierName,
    items: p.items.map(itemToPublic),
    subtotal: p.subtotal,
    discountAmount: p.discountAmount,
    taxAmount: p.taxAmount,
    total: p.total,
    paidAmount: p.paidAmount,
    dueAmount: p.dueAmount,
    paymentAccountId: p.paymentAccountId ? String(p.paymentAccountId) : null,
    paymentStatus: p.paymentStatus,
    status: p.status,
    notes: p.notes,
    purchaseDate: p.purchaseDate,
    localId: p.localId,
    deviceId: p.deviceId ? String(p.deviceId) : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** PRD role matrix — purchases are recorded by stock-owning roles, not Salesperson. */
const PURCHASE_WRITE_ROLES = ["Owner", "Admin", "Manager", "Inventory Manager"] as const;

/** Public serializer shared with void.service (05.09) — no duplicate mapping. */
export { toPublic as toPublicPurchase };

async function assertAccess(userId: string, businessId: string, shopId: string) {
  const membership = await membershipFor(userId, businessId);
  if (!membership) throw ApiError.notFound("Business not found");
  if (membership.shopId && String(membership.shopId) !== shopId) {
    throw ApiError.notFound("Shop not found");
  }
  return membership;
}

// Service-level RBAC — guards direct service calls, not just route middleware.
async function assertCanWrite(userId: string, businessId: string, shopId: string) {
  const membership = await assertAccess(userId, businessId, shopId);
  if (!(PURCHASE_WRITE_ROLES as readonly string[]).includes(membership.role)) {
    throw ApiError.forbidden("Insufficient role");
  }
  return membership;
}

/**
 * Weighted-average cost after receiving stock:
 *
 *   newAvgCost = (oldStock × oldAvgCost + purchasedNetAmount) / (oldStock + qty)
 *
 * `purchasedNetAmount` is the line's discounted pre-tax amount, so the division
 * happens once (no per-unit rounding error compounding). Tax is excluded — it
 * is journalized separately as recoverable input tax, so avgCost stays
 * consistent with the Inventory debit.
 *
 * When (oldStock + qty) <= 0 — possible only when negative stock is allowed —
 * a weighted average is undefined, so this purchase's own unit cost is used.
 */
export function calcNewAvgCost(
  oldStock: number,
  oldAvgCost: number,
  purchasedQty: number,
  purchasedNetAmount: number
): number {
  assertSafePaisa(oldAvgCost, "avgCost");
  assertSafePaisa(purchasedNetAmount, "netAmount");
  if (purchasedQty <= 0) throw ApiError.badRequest("qty must be > 0");
  const denominator = oldStock + purchasedQty;
  if (denominator <= 0) {
    return roundPaisa(purchasedNetAmount / purchasedQty);
  }
  return roundPaisa((oldStock * oldAvgCost + purchasedNetAmount) / denominator);
}

interface BuiltLines {
  items: PurchaseItem[];
  subtotal: number;
  lineDiscountTotal: number;
  taxAmount: number;
}

/**
 * Build purchase lines from client input by reading each Product from the
 * resolved business. The client may only propose a unitPrice (defaulting to the
 * product's purchasePrice) and a per-line discount; tax comes from the
 * product's own taxRate and is rounded PER LINE (money.ts policy).
 */
async function buildLines(
  businessId: string,
  items: PurchaseItemInput[],
  session: ClientSession | null
): Promise<BuiltLines> {
  const built: PurchaseItem[] = [];
  let subtotal = 0;
  let lineDiscountTotal = 0;
  let taxAmount = 0;

  for (const input of items) {
    if (!Types.ObjectId.isValid(input.productId)) throw ApiError.notFound("Product not found");
    const product = await Product.findOne({
      _id: new Types.ObjectId(input.productId),
      businessId: new Types.ObjectId(businessId),
    }).session(session);
    if (!product) throw ApiError.notFound("Product not found");
    if (product.status !== "ACTIVE") {
      throw ApiError.badRequest(`Product is not active: ${product.name}`);
    }

    const qty = assertSafePaisa(input.qty, "qty");
    if (qty <= 0) throw ApiError.badRequest("qty must be > 0");

    const unitPrice = assertSafePaisa(input.unitPrice ?? product.purchasePrice, "unitPrice");
    if (unitPrice < 0) throw ApiError.badRequest("unitPrice must be >= 0");

    const lineSubtotal = calcLineTotal(qty, unitPrice);
    const lineDiscount = calcFlatDiscount(input.discountAmount ?? 0);
    if (lineDiscount < 0) throw ApiError.badRequest("Line discount must be >= 0");
    if (lineDiscount > lineSubtotal) {
      throw ApiError.badRequest(`Line discount exceeds the line subtotal for ${product.name}`);
    }

    const netAmount = lineSubtotal - lineDiscount;
    const lineTax = calcLineTax(netAmount, product.taxRate);

    built.push({
      productId: product._id as Types.ObjectId,
      productName: product.name,
      qty,
      unitPrice,
      discountAmount: lineDiscount,
      taxAmount: lineTax,
      netAmount,
      // Filled in by allocateCostBasis once the header discount is known.
      costAmount: netAmount,
      netUnitCost: roundPaisa(netAmount / qty),
      lineTotal: netAmount + lineTax,
    });

    subtotal += lineSubtotal;
    lineDiscountTotal += lineDiscount;
    taxAmount += lineTax;
  }

  return {
    items: built,
    subtotal: assertSafePaisa(subtotal, "subtotal"),
    lineDiscountTotal: assertSafePaisa(lineDiscountTotal, "lineDiscountTotal"),
    taxAmount: assertSafePaisa(taxAmount, "taxAmount"),
  };
}

/**
 * Header discount for a purchase. Mirrors the verified Sale policy: it applies
 * to the already-line-discounted subtotal and does NOT retroactively reduce
 * per-line tax.
 */
function resolveHeaderDiscount(
  subtotal: number,
  lineDiscountTotal: number,
  headerAmount?: number,
  headerPercent?: number
): number {
  const base = subtotal - lineDiscountTotal;
  const headerDiscount =
    headerPercent !== undefined
      ? calcDiscount(base, headerPercent)
      : calcFlatDiscount(headerAmount ?? 0);
  if (headerDiscount > base) {
    throw ApiError.badRequest("Discount exceeds the purchase subtotal");
  }
  return assertSafePaisa(headerDiscount, "discountAmount");
}

/**
 * Spread the header discount across lines pro-rata by netAmount so each line
 * carries the cost actually paid for it. The last line absorbs the rounding
 * remainder, so the allocated shares sum to exactly the header discount.
 *
 * Returns the total cost basis (Σ costAmount) — this is the Inventory debit,
 * and the caller derives discountAmount from it, which makes the journal
 * balanced by construction regardless of rounding.
 */
function allocateCostBasis(items: PurchaseItem[], headerDiscount: number): number {
  const base = items.reduce((sum, item) => sum + item.netAmount, 0);
  let allocated = 0;
  items.forEach((item, index) => {
    let share =
      index === items.length - 1
        ? headerDiscount - allocated
        : base > 0
          ? roundPaisa((headerDiscount * item.netAmount) / base)
          : 0;
    // Defensive: a line can never be discounted below zero.
    if (share < 0) share = 0;
    if (share > item.netAmount) share = item.netAmount;
    allocated += index === items.length - 1 ? 0 : share;
    item.costAmount = item.netAmount - share;
    item.netUnitCost = roundPaisa(item.costAmount / item.qty);
  });
  return items.reduce((sum, item) => sum + item.costAmount, 0);
}

/**
 * Apply every financial and inventory effect of a purchase, inside the caller's
 * transaction. Called once per purchase — either inline at creation or later
 * from POST /purchases/:id/finalize. Never call this outside withTransaction.
 */
async function finalizeInSession(
  userId: string,
  purchase: PurchaseDocument,
  business: BusinessDocument,
  payment: PurchasePaymentInput,
  session: ClientSession | null
): Promise<void> {
  const businessId = String(purchase.businessId);
  const shopId = String(purchase.shopId);

  const paidAmount = assertSafePaisa(payment.paidAmount ?? 0, "paidAmount");
  if (paidAmount < 0) throw ApiError.badRequest("paidAmount must be >= 0");
  if (paidAmount > purchase.total) {
    throw ApiError.badRequest("paidAmount cannot exceed the purchase total");
  }
  const dueAmount = calcDue(purchase.total, paidAmount);

  // --- Purchase number: atomic BusinessCounter, never countDocuments()+1 ---
  // The counter is per (business, shop); invoiceNo is unique per BUSINESS, so
  // the shop's branchCode (unique per business) scopes it — same convention as
  // the verified Sale numbering.
  const shop = await Shop.findOne({
    _id: purchase.shopId,
    businessId: purchase.businessId,
  }).session(session);
  if (!shop) throw ApiError.notFound("Shop not found");
  const sequence = await nextSequence(businessId, shopId, COUNTER_KEYS.PURCHASE, session);
  const invoiceNo = formatDocumentNo(
    "PUR",
    fiscalYearOf(purchase.purchaseDate, business.fiscalYear),
    sequence,
    shop.branchCode
  );

  // --- Stock increase + weighted-average cost + movement, per line ---
  for (const line of purchase.items) {
    const product = await Product.findOne({
      _id: line.productId,
      businessId: purchase.businessId,
    }).session(session);
    if (!product) throw ApiError.notFound("Product not found");
    if (product.status !== "ACTIVE") {
      throw ApiError.badRequest(`Product is not active: ${product.name}`);
    }

    // Atomic increment returning the pre-update document, so prevStock and the
    // avgCost inputs are exactly the values this transaction modified.
    const previous = await Product.findOneAndUpdate(
      { _id: product._id, businessId: purchase.businessId },
      { $inc: { currentStock: line.qty } },
      { new: false, session: session ?? undefined }
    );
    if (!previous) throw ApiError.notFound("Product not found");

    const newAvgCost = calcNewAvgCost(
      previous.currentStock,
      previous.avgCost,
      line.qty,
      line.costAmount
    );
    // avgCost is never client-supplied — always recomputed here.
    await Product.updateOne(
      { _id: product._id, businessId: purchase.businessId },
      { $set: { avgCost: newAvgCost } },
      { session: session ?? undefined }
    );

    await StockMovement.create(
      [
        {
          businessId: purchase.businessId,
          shopId: purchase.shopId,
          productId: product._id,
          type: "purchase",
          qtyChange: line.qty,
          prevStock: previous.currentStock,
          newStock: previous.currentStock + line.qty,
          unitCost: line.netUnitCost,
          refType: "PURCHASE",
          refId: purchase._id,
          createdBy: new Types.ObjectId(userId),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );
  }

  // --- Supplier payable (credit portion only) ---
  if (dueAmount > 0) {
    const res = await Supplier.updateOne(
      { _id: purchase.supplierId, businessId: purchase.businessId },
      { $inc: { currentPayable: dueAmount } },
      { session: session ?? undefined }
    );
    if (res.matchedCount === 0) throw ApiError.notFound("Supplier not found");
  }

  // --- Payment account (cash portion only) — money OUT of the business ---
  let assetAccountName: string = JOURNAL_ACCOUNTS.CASH;
  let assetAccountType: JournalAccountType = JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.CASH];
  let paymentAccountId: Types.ObjectId | null = null;
  if (paidAmount > 0) {
    if (!payment.accountId) throw ApiError.badRequest("accountId is required when paidAmount > 0");
    const account = await Account.findOne({
      _id: new Types.ObjectId(payment.accountId),
      businessId: purchase.businessId,
      shopId: purchase.shopId,
    }).session(session);
    if (!account) throw ApiError.notFound("Account not found");
    const asset = journalAssetAccountFor(account.type);
    assetAccountName = asset.name;
    assetAccountType = asset.accountType;
    paymentAccountId = account._id as Types.ObjectId;
    // Existing account policy: the guarded decrement rejects an overdraft.
    await decrementBalance(businessId, shopId, String(account._id), paidAmount, session);
  }

  // --- Purchase document ---
  purchase.invoiceNo = invoiceNo;
  purchase.paidAmount = paidAmount;
  purchase.dueAmount = dueAmount;
  // Snapshotted so a 05.09 void refunds into the same account.
  purchase.paymentAccountId = paymentAccountId;
  purchase.paymentStatus = derivePaymentStatus(purchase.total, paidAmount);
  purchase.status = "COMPLETED";
  await purchase.save({ session: session ?? undefined });

  // --- Balanced journal ---
  // DEBIT Inventory (cost basis) + Tax Receivable (recoverable input tax)
  // CREDIT cash/bank (settled) + Supplier Payable (credit portion)
  const inventoryDebit = purchase.items.reduce((sum, item) => sum + item.costAmount, 0);
  const lines: JournalLineInput[] = [];
  if (inventoryDebit > 0) {
    lines.push({
      accountName: JOURNAL_ACCOUNTS.INVENTORY,
      accountType: JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.INVENTORY],
      debit: inventoryDebit,
      credit: 0,
    });
  }
  if (purchase.taxAmount > 0) {
    lines.push({
      accountName: JOURNAL_ACCOUNTS.TAX_RECEIVABLE,
      accountType: JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.TAX_RECEIVABLE],
      debit: purchase.taxAmount,
      credit: 0,
    });
  }
  if (paidAmount > 0) {
    lines.push({
      accountName: assetAccountName,
      accountType: assetAccountType,
      debit: 0,
      credit: paidAmount,
    });
  }
  if (dueAmount > 0) {
    lines.push({
      accountName: JOURNAL_ACCOUNTS.SUPPLIER_PAYABLE,
      accountType: JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.SUPPLIER_PAYABLE],
      debit: 0,
      credit: dueAmount,
    });
  }
  await writeJournal(
    {
      businessId,
      shopId,
      description: `Purchase ${invoiceNo}`,
      referenceType: "PURCHASE",
      referenceId: String(purchase._id),
      lines,
    },
    session
  );

  // --- Audit ---
  await AuditLog.create(
    [
      {
        userId: new Types.ObjectId(userId),
        businessId: purchase.businessId,
        action: "PURCHASE_FINALIZED",
        ip: null,
        details: JSON.stringify({
          purchaseId: String(purchase._id),
          invoiceNo,
          shopId,
          supplierId: String(purchase.supplierId),
          total: purchase.total,
          paidAmount,
          dueAmount,
        }),
      },
    ],
    { session: session ?? undefined, ordered: true }
  );
}

export async function createPurchase(
  userId: string,
  input: CreatePurchaseInput
): Promise<{ purchase: ReturnType<typeof toPublic>; duplicate: boolean }> {
  await assertCanWrite(userId, input.businessId, input.shopId);
  const isDraft = input.draft === true;
  if (isDraft && (input.paidAmount ?? 0) > 0) {
    throw ApiError.badRequest("A draft purchase cannot record a payment");
  }

  const run = async (session: ClientSession | null) => {
    // Offline-sync idempotency: the same localId never creates a second purchase.
    if (input.localId) {
      const existing = await Purchase.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      }).session(session);
      if (existing) return { purchase: existing, duplicate: true };
    }

    const business = await Business.findById(new Types.ObjectId(input.businessId)).session(session);
    if (!business) throw ApiError.notFound("Business not found");

    if (!Types.ObjectId.isValid(input.supplierId)) throw ApiError.notFound("Supplier not found");
    const supplier = await Supplier.findOne({
      _id: new Types.ObjectId(input.supplierId),
      businessId: new Types.ObjectId(input.businessId),
    }).session(session);
    if (!supplier) throw ApiError.notFound("Supplier not found");

    const built = await buildLines(input.businessId, input.items, session);
    const headerDiscount = resolveHeaderDiscount(
      built.subtotal,
      built.lineDiscountTotal,
      input.discountAmount,
      input.discountPercent
    );
    // discountAmount is derived from the allocated cost basis so that
    // Σ costAmount + tax === total holds exactly — the journal can never
    // unbalance from a rounding remainder.
    const costBasis = allocateCostBasis(built.items, headerDiscount);
    const discountAmount = assertSafePaisa(built.subtotal - costBasis, "discountAmount");
    const total = calcTotal(built.subtotal, discountAmount, built.taxAmount);
    if (total <= 0) throw ApiError.badRequest("Purchase total must be greater than zero");

    const created = await Purchase.create(
      [
        {
          businessId: new Types.ObjectId(input.businessId),
          shopId: new Types.ObjectId(input.shopId),
          invoiceNo: null,
          supplierInvoiceNo: input.supplierInvoiceNo ?? null,
          supplierId: supplier._id,
          supplierName: supplier.name, // snapshot from the record, not the client
          items: built.items,
          subtotal: built.subtotal,
          discountAmount,
          taxAmount: built.taxAmount,
          total,
          paidAmount: 0,
          dueAmount: total,
          paymentStatus: "UNPAID",
          status: "DRAFT",
          notes: input.notes ?? null,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
          createdBy: new Types.ObjectId(userId),
          localId: input.localId ?? null,
          deviceId: input.deviceId ? new Types.ObjectId(input.deviceId) : null,
        },
      ],
      { session: session ?? undefined, ordered: true }
    );
    const purchase = created[0];

    if (isDraft) {
      await AuditLog.create(
        [
          {
            userId: new Types.ObjectId(userId),
            businessId: purchase.businessId,
            action: "PURCHASE_CREATED",
            ip: null,
            details: JSON.stringify({
              purchaseId: String(purchase._id),
              shopId: input.shopId,
              status: "DRAFT",
              total,
            }),
          },
        ],
        { session: session ?? undefined, ordered: true }
      );
    } else {
      await finalizeInSession(
        userId,
        purchase,
        business,
        { paidAmount: input.paidAmount, accountId: input.accountId },
        session
      );
    }

    return { purchase, duplicate: false };
  };

  try {
    const result = await withTransaction(run);
    return { purchase: toPublic(result.purchase), duplicate: result.duplicate };
  } catch (err) {
    // Concurrent create with the same localId lost the race on the unique index.
    if (isDuplicateKeyError(err) && input.localId) {
      const existing = await Purchase.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      });
      if (existing) return { purchase: toPublic(existing), duplicate: true };
    }
    throw err;
  }
}

export async function finalizePurchase(
  userId: string,
  businessId: string,
  shopId: string,
  purchaseId: string,
  input: PurchasePaymentInput = {}
): Promise<{ purchase: ReturnType<typeof toPublic>; duplicate: boolean }> {
  await assertCanWrite(userId, businessId, shopId);
  if (!Types.ObjectId.isValid(purchaseId)) throw ApiError.notFound("Purchase not found");

  const result = await withTransaction(async (session) => {
    const purchase = await Purchase.findOne({
      _id: new Types.ObjectId(purchaseId),
      businessId: new Types.ObjectId(businessId),
      shopId: new Types.ObjectId(shopId),
    }).session(session);
    if (!purchase) throw ApiError.notFound("Purchase not found");
    if (purchase.status === "VOIDED") {
      throw ApiError.badRequest("A voided purchase cannot be finalized");
    }
    // Idempotent: a duplicate finalize returns the purchase without re-applying
    // stock, avgCost, payable, account or journal effects.
    if (purchase.status === "COMPLETED") return { purchase, duplicate: true };

    const business = await Business.findById(new Types.ObjectId(businessId)).session(session);
    if (!business) throw ApiError.notFound("Business not found");

    await finalizeInSession(userId, purchase, business, input, session);
    return { purchase, duplicate: false };
  });

  return { purchase: toPublic(result.purchase), duplicate: result.duplicate };
}

export async function listPurchases(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ListPurchasesQuery = {}
) {
  let effectiveShopId: string | null = shopId ?? null;
  if (shopId) {
    await assertAccess(userId, businessId, shopId);
  } else {
    const membership = await membershipFor(userId, businessId);
    if (!membership) throw ApiError.notFound("Business not found");
    if (membership.shopId) effectiveShopId = String(membership.shopId);
  }

  const filter: Record<string, unknown> = { businessId: new Types.ObjectId(businessId) };
  if (effectiveShopId) filter.shopId = new Types.ObjectId(effectiveShopId);
  if (
    typeof query.status === "string" &&
    (PURCHASE_STATUSES as readonly string[]).includes(query.status)
  ) {
    filter.status = query.status;
  }
  if (
    typeof query.paymentStatus === "string" &&
    (PURCHASE_PAYMENT_STATUSES as readonly string[]).includes(query.paymentStatus)
  ) {
    filter.paymentStatus = query.paymentStatus;
  }
  if (typeof query.supplierId === "string" && Types.ObjectId.isValid(query.supplierId)) {
    filter.supplierId = new Types.ObjectId(query.supplierId);
  }
  const dateRange: Record<string, Date> = {};
  if (typeof query.dateFrom === "string") {
    const from = new Date(query.dateFrom);
    if (!Number.isNaN(from.getTime())) dateRange.$gte = from;
  }
  if (typeof query.dateTo === "string") {
    const to = new Date(query.dateTo);
    if (!Number.isNaN(to.getTime())) dateRange.$lte = to;
  }
  if (Object.keys(dateRange).length > 0) filter.purchaseDate = dateRange;

  const pagination = parsePagination(query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    Purchase.countDocuments(filter),
    Purchase.find(filter)
      .sort({ purchaseDate: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  return { items: rows.map(toPublic), pagination: buildPagination(total, pagination) };
}

export async function getPurchase(
  userId: string,
  businessId: string,
  shopId: string,
  purchaseId: string
): Promise<ReturnType<typeof toPublic>> {
  await assertAccess(userId, businessId, shopId);
  if (!Types.ObjectId.isValid(purchaseId)) throw ApiError.notFound("Purchase not found");
  const purchase = await Purchase.findOne({
    _id: new Types.ObjectId(purchaseId),
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
  });
  if (!purchase) throw ApiError.notFound("Purchase not found");
  return toPublic(purchase);
}
