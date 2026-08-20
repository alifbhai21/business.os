import { Types, ClientSession } from "mongoose";
import {
  Sale,
  SaleDocument,
  SaleItem,
  SalePaymentStatus,
  SALE_STATUSES,
  PAYMENT_STATUSES,
} from "../models/Sale";
import { StockMovement } from "../models/StockMovement";
import { Product } from "../models/Product";
import { Customer } from "../models/Customer";
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
import { incrementBalance } from "./account.service";
import { writeJournal, JournalLineInput } from "./journal.service";
import { nextSequence, COUNTER_KEYS } from "./counter.service";
import { withTransaction } from "../db/transactions";
import {
  assertSafePaisa,
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

export interface SaleItemInput {
  productId: string;
  qty: number;
  unitPrice?: number;
  discountAmount?: number;
}

export interface SalePaymentInput {
  paidAmount?: number;
  accountId?: string | null;
}

export interface CreateSaleInput extends SalePaymentInput {
  businessId: string;
  shopId: string;
  customerId?: string | null;
  customerName?: string | null;
  items: SaleItemInput[];
  discountAmount?: number;
  discountPercent?: number;
  notes?: string | null;
  saleDate?: Date | string | null;
  localId?: string | null;
  draft?: boolean;
}

export interface ListSalesQuery {
  page?: unknown;
  limit?: unknown;
  status?: unknown;
  paymentStatus?: unknown;
  customerId?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
}

function itemToPublic(item: SaleItem) {
  return {
    productId: String(item.productId),
    productName: item.productName,
    qty: item.qty,
    unitPrice: item.unitPrice,
    costPrice: item.costPrice,
    discountAmount: item.discountAmount,
    taxAmount: item.taxAmount,
    lineTotal: item.lineTotal,
  };
}

function toPublic(s: SaleDocument) {
  return {
    id: String(s._id),
    businessId: String(s.businessId),
    shopId: String(s.shopId),
    invoiceNo: s.invoiceNo,
    customerId: s.customerId ? String(s.customerId) : null,
    customerName: s.customerName,
    items: s.items.map(itemToPublic),
    subtotal: s.subtotal,
    discountAmount: s.discountAmount,
    taxAmount: s.taxAmount,
    total: s.total,
    paidAmount: s.paidAmount,
    dueAmount: s.dueAmount,
    paymentStatus: s.paymentStatus,
    status: s.status,
    notes: s.notes,
    saleDate: s.saleDate,
    localId: s.localId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/** PRD role matrix — sales are recorded by front-of-house roles, not Accountant. */
const SALE_WRITE_ROLES = ["Owner", "Admin", "Manager", "Salesperson"] as const;

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
  if (!(SALE_WRITE_ROLES as readonly string[]).includes(membership.role)) {
    throw ApiError.forbidden("Insufficient role");
  }
  return membership;
}

/** Server-derived payment status — never accepted from the client. */
export function derivePaymentStatus(total: number, paid: number): SalePaymentStatus {
  if (paid <= 0) return "UNPAID";
  if (calcDue(total, paid) === 0) return "PAID";
  return "PARTIAL";
}

interface BuiltLines {
  items: SaleItem[];
  subtotal: number;
  lineDiscountTotal: number;
  taxAmount: number;
}

/**
 * Build sale lines from client input by reading each Product from the resolved
 * business. Prices, tax and line totals are computed here — the client may
 * only propose a unitPrice and a per-line discount. Tax uses the product's own
 * taxRate and is rounded PER LINE (money.ts policy), never once on the
 * aggregate.
 */
async function buildLines(
  businessId: string,
  items: SaleItemInput[],
  session: ClientSession | null
): Promise<BuiltLines> {
  const built: SaleItem[] = [];
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

    const unitPrice = assertSafePaisa(
      input.unitPrice ?? product.sellingPrice,
      "unitPrice"
    );
    if (unitPrice < 0) throw ApiError.badRequest("unitPrice must be >= 0");

    const lineSubtotal = calcLineTotal(qty, unitPrice);
    const lineDiscount = calcFlatDiscount(input.discountAmount ?? 0);
    if (lineDiscount < 0) throw ApiError.badRequest("Line discount must be >= 0");
    if (lineDiscount > lineSubtotal) {
      throw ApiError.badRequest(`Line discount exceeds the line subtotal for ${product.name}`);
    }

    const taxable = lineSubtotal - lineDiscount;
    const lineTax = calcLineTax(taxable, product.taxRate);
    // Cost snapshot: avgCost once purchases maintain it, else purchasePrice.
    const costPrice = product.avgCost > 0 ? product.avgCost : product.purchasePrice;

    built.push({
      productId: product._id as Types.ObjectId,
      productName: product.name,
      qty,
      unitPrice,
      costPrice: assertSafePaisa(costPrice, "costPrice"),
      discountAmount: lineDiscount,
      taxAmount: lineTax,
      lineTotal: taxable + lineTax,
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
 * Total discount = per-line discounts + a header discount. The header discount
 * is applied to the already-line-discounted subtotal and, by design, does NOT
 * retroactively reduce per-line tax (it behaves as a settlement discount).
 */
function resolveDiscount(
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
    throw ApiError.badRequest("Discount exceeds the sale subtotal");
  }
  return assertSafePaisa(lineDiscountTotal + headerDiscount, "discountAmount");
}

/**
 * Apply every financial and inventory effect of a sale, inside the caller's
 * transaction. Called once per sale — either inline at creation or later from
 * POST /sales/:id/finalize. Never call this outside withTransaction.
 */
async function finalizeInSession(
  userId: string,
  sale: SaleDocument,
  business: BusinessDocument,
  payment: SalePaymentInput,
  session: ClientSession | null
): Promise<void> {
  const businessId = String(sale.businessId);
  const shopId = String(sale.shopId);

  const paidAmount = assertSafePaisa(payment.paidAmount ?? 0, "paidAmount");
  if (paidAmount < 0) throw ApiError.badRequest("paidAmount must be >= 0");
  if (paidAmount > sale.total) {
    throw ApiError.badRequest("paidAmount cannot exceed the sale total");
  }
  const dueAmount = calcDue(sale.total, paidAmount);
  if (!sale.customerId && dueAmount > 0) {
    throw ApiError.badRequest("A credit sale requires a customer");
  }

  // --- Invoice number: atomic BusinessCounter, never countDocuments()+1 ---
  // The counter is per (business, shop); invoiceNo is unique per BUSINESS, so
  // the shop's branchCode (unique within the business) scopes the number.
  const shop = await Shop.findOne({ _id: sale.shopId, businessId: sale.businessId }).session(session);
  if (!shop) throw ApiError.notFound("Shop not found");
  const sequence = await nextSequence(businessId, shopId, COUNTER_KEYS.SALE, session);
  const invoiceNo = formatDocumentNo(
    "INV",
    fiscalYearOf(sale.saleDate, business.fiscalYear),
    sequence,
    shop.branchCode
  );

  // --- Stock: atomic guarded decrement + immutable movement per line ---
  for (const line of sale.items) {
    const product = await Product.findOne({
      _id: line.productId,
      businessId: sale.businessId,
    }).session(session);
    if (!product) throw ApiError.notFound("Product not found");
    if (product.status !== "ACTIVE") {
      throw ApiError.badRequest(`Product is not active: ${product.name}`);
    }

    const guard = business.allowNegativeStock ? {} : { currentStock: { $gte: line.qty } };
    const previous = await Product.findOneAndUpdate(
      { _id: product._id, businessId: sale.businessId, ...guard },
      { $inc: { currentStock: -line.qty } },
      { new: false, session: session ?? undefined }
    );
    if (!previous) {
      throw ApiError.badRequest(`Insufficient stock for ${product.name}`);
    }

    await StockMovement.create(
      [
        {
          businessId: sale.businessId,
          shopId: sale.shopId,
          productId: product._id,
          type: "sale",
          qtyChange: -line.qty,
          prevStock: previous.currentStock,
          newStock: previous.currentStock - line.qty,
          unitCost: line.costPrice,
          refType: "SALE",
          refId: sale._id,
          createdBy: new Types.ObjectId(userId),
        },
      ],
      { session: session ?? undefined, ordered: true }
    );
  }

  // --- Customer due (credit portion only) ---
  if (sale.customerId && dueAmount > 0) {
    const res = await Customer.updateOne(
      { _id: sale.customerId, businessId: sale.businessId },
      { $inc: { currentDue: dueAmount } },
      { session: session ?? undefined }
    );
    if (res.matchedCount === 0) throw ApiError.notFound("Customer not found");
  }

  // --- Payment account (cash portion only) ---
  let assetAccountName: string = JOURNAL_ACCOUNTS.CASH;
  let assetAccountType: JournalAccountType = JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.CASH];
  if (paidAmount > 0) {
    if (!payment.accountId) throw ApiError.badRequest("accountId is required when paidAmount > 0");
    const account = await Account.findOne({
      _id: new Types.ObjectId(payment.accountId),
      businessId: sale.businessId,
      shopId: sale.shopId,
    }).session(session);
    if (!account) throw ApiError.notFound("Account not found");
    const asset = journalAssetAccountFor(account.type);
    assetAccountName = asset.name;
    assetAccountType = asset.accountType;
    await incrementBalance(businessId, shopId, String(account._id), paidAmount, session);
  }

  // --- Sale document ---
  sale.invoiceNo = invoiceNo;
  sale.paidAmount = paidAmount;
  sale.dueAmount = dueAmount;
  sale.paymentStatus = derivePaymentStatus(sale.total, paidAmount);
  sale.status = "COMPLETED";
  await sale.save({ session: session ?? undefined });

  // --- Balanced journal ---
  // DEBIT cash/bank (settled) + customer receivable (credit portion)
  // CREDIT sales revenue (net of discount) + tax payable
  const revenue = sale.subtotal - sale.discountAmount;
  const lines: JournalLineInput[] = [];
  if (paidAmount > 0) {
    lines.push({
      accountName: assetAccountName,
      accountType: assetAccountType,
      debit: paidAmount,
      credit: 0,
    });
  }
  if (dueAmount > 0) {
    lines.push({
      accountName: JOURNAL_ACCOUNTS.CUSTOMER_RECEIVABLE,
      accountType: JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.CUSTOMER_RECEIVABLE],
      debit: dueAmount,
      credit: 0,
    });
  }
  if (revenue > 0) {
    lines.push({
      accountName: JOURNAL_ACCOUNTS.SALES_REVENUE,
      accountType: JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.SALES_REVENUE],
      debit: 0,
      credit: revenue,
    });
  }
  if (sale.taxAmount > 0) {
    lines.push({
      accountName: JOURNAL_ACCOUNTS.TAX_PAYABLE,
      accountType: JOURNAL_ACCOUNT_TYPES[JOURNAL_ACCOUNTS.TAX_PAYABLE],
      debit: 0,
      credit: sale.taxAmount,
    });
  }
  await writeJournal(
    {
      businessId,
      shopId,
      description: `Sale ${invoiceNo}`,
      referenceType: "SALE",
      referenceId: String(sale._id),
      lines,
    },
    session
  );

  // --- Audit ---
  await AuditLog.create(
    [
      {
        userId: new Types.ObjectId(userId),
        businessId: sale.businessId,
        action: "SALE_FINALIZED",
        ip: null,
        details: JSON.stringify({
          saleId: String(sale._id),
          invoiceNo,
          shopId,
          customerId: sale.customerId ? String(sale.customerId) : null,
          total: sale.total,
          paidAmount,
          dueAmount,
        }),
      },
    ],
    { session: session ?? undefined, ordered: true }
  );
}

export async function createSale(
  userId: string,
  input: CreateSaleInput
): Promise<{ sale: ReturnType<typeof toPublic>; duplicate: boolean }> {
  await assertCanWrite(userId, input.businessId, input.shopId);
  const isDraft = input.draft === true;
  if (isDraft && (input.paidAmount ?? 0) > 0) {
    throw ApiError.badRequest("A draft sale cannot record a payment");
  }

  const run = async (session: ClientSession | null) => {
    // Offline-sync idempotency: the same localId never creates a second sale.
    if (input.localId) {
      const existing = await Sale.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      }).session(session);
      if (existing) return { sale: existing, duplicate: true };
    }

    const business = await Business.findById(new Types.ObjectId(input.businessId)).session(session);
    if (!business) throw ApiError.notFound("Business not found");

    const built = await buildLines(input.businessId, input.items, session);
    const discountAmount = resolveDiscount(
      built.subtotal,
      built.lineDiscountTotal,
      input.discountAmount,
      input.discountPercent
    );
    const total = calcTotal(built.subtotal, discountAmount, built.taxAmount);
    if (total <= 0) throw ApiError.badRequest("Sale total must be greater than zero");

    let customerName = input.customerName?.trim() || null;
    if (input.customerId) {
      const customer = await Customer.findOne({
        _id: new Types.ObjectId(input.customerId),
        businessId: new Types.ObjectId(input.businessId),
      }).session(session);
      if (!customer) throw ApiError.notFound("Customer not found");
      customerName = customer.name; // snapshot from the record, not the client
    }

    const created = await Sale.create(
      [
        {
          businessId: new Types.ObjectId(input.businessId),
          shopId: new Types.ObjectId(input.shopId),
          invoiceNo: null,
          customerId: input.customerId ? new Types.ObjectId(input.customerId) : null,
          customerName,
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
          saleDate: input.saleDate ? new Date(input.saleDate) : new Date(),
          createdBy: new Types.ObjectId(userId),
          localId: input.localId ?? null,
        },
      ],
      { session: session ?? undefined, ordered: true }
    );
    const sale = created[0];

    if (isDraft) {
      await AuditLog.create(
        [
          {
            userId: new Types.ObjectId(userId),
            businessId: sale.businessId,
            action: "SALE_CREATED",
            ip: null,
            details: JSON.stringify({
              saleId: String(sale._id),
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
        sale,
        business,
        { paidAmount: input.paidAmount, accountId: input.accountId },
        session
      );
    }

    return { sale, duplicate: false };
  };

  try {
    const result = await withTransaction(run);
    return { sale: toPublic(result.sale), duplicate: result.duplicate };
  } catch (err) {
    // Concurrent create with the same localId lost the race on the unique index.
    if (isDuplicateKeyError(err) && input.localId) {
      const existing = await Sale.findOne({
        businessId: new Types.ObjectId(input.businessId),
        localId: input.localId,
      });
      if (existing) return { sale: toPublic(existing), duplicate: true };
    }
    throw err;
  }
}

export async function finalizeSale(
  userId: string,
  businessId: string,
  shopId: string,
  saleId: string,
  input: SalePaymentInput = {}
): Promise<{ sale: ReturnType<typeof toPublic>; duplicate: boolean }> {
  await assertCanWrite(userId, businessId, shopId);
  if (!Types.ObjectId.isValid(saleId)) throw ApiError.notFound("Sale not found");

  const result = await withTransaction(async (session) => {
    const sale = await Sale.findOne({
      _id: new Types.ObjectId(saleId),
      businessId: new Types.ObjectId(businessId),
      shopId: new Types.ObjectId(shopId),
    }).session(session);
    if (!sale) throw ApiError.notFound("Sale not found");
    if (sale.status === "VOIDED") {
      throw ApiError.badRequest("A voided sale cannot be finalized");
    }
    // Idempotent: a duplicate finalize returns the sale without re-applying
    // stock, due, account or journal effects.
    if (sale.status === "COMPLETED") return { sale, duplicate: true };

    const business = await Business.findById(new Types.ObjectId(businessId)).session(session);
    if (!business) throw ApiError.notFound("Business not found");

    await finalizeInSession(userId, sale, business, input, session);
    return { sale, duplicate: false };
  });

  return { sale: toPublic(result.sale), duplicate: result.duplicate };
}

export async function listSales(
  userId: string,
  businessId: string,
  shopId: string | null | undefined,
  query: ListSalesQuery = {}
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
  if (typeof query.status === "string" && (SALE_STATUSES as readonly string[]).includes(query.status)) {
    filter.status = query.status;
  }
  if (
    typeof query.paymentStatus === "string" &&
    (PAYMENT_STATUSES as readonly string[]).includes(query.paymentStatus)
  ) {
    filter.paymentStatus = query.paymentStatus;
  }
  if (typeof query.customerId === "string" && Types.ObjectId.isValid(query.customerId)) {
    filter.customerId = new Types.ObjectId(query.customerId);
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
  if (Object.keys(dateRange).length > 0) filter.saleDate = dateRange;

  const pagination = parsePagination(query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    Sale.countDocuments(filter),
    Sale.find(filter)
      .sort({ saleDate: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  return { items: rows.map(toPublic), pagination: buildPagination(total, pagination) };
}

export async function getSale(
  userId: string,
  businessId: string,
  shopId: string,
  saleId: string
): Promise<ReturnType<typeof toPublic>> {
  await assertAccess(userId, businessId, shopId);
  if (!Types.ObjectId.isValid(saleId)) throw ApiError.notFound("Sale not found");
  const sale = await Sale.findOne({
    _id: new Types.ObjectId(saleId),
    businessId: new Types.ObjectId(businessId),
    shopId: new Types.ObjectId(shopId),
  });
  if (!sale) throw ApiError.notFound("Sale not found");
  return toPublic(sale);
}
