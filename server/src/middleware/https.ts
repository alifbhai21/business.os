import { NextFunction, Request, Response } from "express";

/**
 * Phase 13 — HTTPS enforcement behind a TLS-terminating proxy (Render).
 *
 * Render terminates TLS and forwards the original protocol in
 * `x-forwarded-proto`. Any forwarded request that did NOT arrive over HTTPS
 * is permanently redirected (308 preserves the method/body) to its https
 * form. `/health` and `/ready` are always exempt so platform probes that
 * bypass the TLS edge can never fail.
 *
 * Mounted ONLY in production; requests with no x-forwarded-proto header
 * (direct/internal traffic) pass through untouched.
 */
export function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  const forwarded = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwarded === "string" ? forwarded.split(",")[0].trim().toLowerCase() : undefined;

  const isProbe = req.path === "/health" || req.path === "/ready";
  if (proto && proto !== "https" && !isProbe) {
    const host = req.headers.host;
    if (host) {
      res.redirect(308, `https://${host}${req.originalUrl}`);
      return;
    }
  }
  next();
}
