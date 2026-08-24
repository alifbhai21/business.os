import { Request, Response } from "express";
import * as invoiceService from "../services/invoice.service";
import { renderInvoiceHtml } from "../services/invoicePrint.service";
import { sendSuccess, sendPaginated } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

/**
 * Tenant scope is taken from the resolved context, never from the raw query
 * string: `resolveBusiness` set `currentBusiness.id` from the membership
 * document and `assertShopAccess` set `currentShopId` after proving the shop
 * belongs to that business. A client-supplied businessId therefore cannot widen
 * the scope it was authorized for.
 */
function scopeOf(req: Request): { businessId: string; shopId: string | null } {
  if (!req.currentBusiness) throw ApiError.forbidden("Business context required");
  return { businessId: req.currentBusiness.id, shopId: req.currentShopId ?? null };
}

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, shopId } = scopeOf(req);
  if (!shopId) throw ApiError.badRequest("shopId query param is required");
  const data = await invoiceService.getInvoice(
    req.user.id,
    businessId,
    shopId,
    req.params.type,
    req.params.id
  );
  return sendSuccess(res, data);
});

/**
 * Phase 12 — print-ready invoice. Same authorization and data path as the
 * JSON invoice read; only the representation differs (UTF-8 HTML that the
 * browser's print dialog saves as PDF). All figures come from the stored
 * documents — nothing is client-computable here.
 */
export const getInvoicePrint = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, shopId } = scopeOf(req);
  if (!shopId) throw ApiError.badRequest("shopId query param is required");
  const invoice = await invoiceService.getInvoice(
    req.user.id,
    businessId,
    shopId,
    req.params.type,
    req.params.id
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${invoice.invoiceNo ?? invoice.documentId}.html"`
  );
  return res.status(200).send(renderInvoiceHtml(invoice));
});

export const listSaleInvoices = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, shopId } = scopeOf(req);
  const { items, pagination } = await invoiceService.listSaleInvoices(
    req.user.id,
    businessId,
    shopId,
    req.query as never
  );
  return sendPaginated(res, items, pagination);
});

export const listPurchaseInvoices = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { businessId, shopId } = scopeOf(req);
  const { items, pagination } = await invoiceService.listPurchaseInvoices(
    req.user.id,
    businessId,
    shopId,
    req.query as never
  );
  return sendPaginated(res, items, pagination);
});
