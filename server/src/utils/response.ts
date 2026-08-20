import { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: { total: number; page: number; limit: number; totalPages: number },
  status = 200,
) {
  return res.status(status).json({ success: true, data, pagination });
}

export function sendMessage(res: Response, message: string, status = 200) {
  return res.status(status).json({ success: true, message });
}