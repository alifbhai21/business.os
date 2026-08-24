import { Request, Response } from "express";
import * as backupService from "../services/backup.service";
import type { ExportCsvType } from "../validation/backup.schemas";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

/**
 * Phase 11 — data export.
 *
 * JSON: full archive (master data + transactions + journals + audit trail).
 * CSV: one flat entity type per call (?type=sales|…).
 *
 * Both require the `data:export` permission (Owner/Admin/Manager/Accountant)
 * — enforced by route middleware AND re-checked inside the service. Every
 * successful export writes a DATA_EXPORTED AuditLog row.
 */

function attachmentHeaders(res: Response, filename: string, contentType: string): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
}

export const exportJson = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  const result = await backupService.exportData(req.user.id, {
    businessId,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  attachmentHeaders(
    res,
    `business-os-export-${businessId}-${result.exportedAt.slice(0, 10)}.json`,
    "application/json; charset=utf-8"
  );
  return res.status(200).json({ success: true, data: result });
});

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  const type = req.query.type as ExportCsvType;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  if (!type) throw ApiError.badRequest("type query param is required");
  const { csv } = await backupService.exportCsv(req.user.id, {
    businessId,
    type,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  attachmentHeaders(res, `${type}-${businessId}.csv`, "text/csv; charset=utf-8");
  return res.status(200).send(csv);
});

/** Phase 12 — real .xlsx workbook of the same tabular projection. */
export const exportExcel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businessId = req.query.businessId as string;
  const type = req.query.type as ExportCsvType;
  if (!businessId) throw ApiError.badRequest("businessId query param is required");
  if (!type) throw ApiError.badRequest("type query param is required");
  const { workbook } = await backupService.exportExcel(req.user.id, {
    businessId,
    type,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${type}-${businessId}.xlsx"`);
  return res.status(200).send(Buffer.from(workbook));
});
