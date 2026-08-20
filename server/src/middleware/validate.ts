import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { ApiError } from "../utils/ApiError";

/** Validate req.body against a Zod schema; throws 400 with field errors. */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        fields[key] = fields[key] ?? [];
        fields[key].push(issue.message);
      }
      const first = parsed.error.issues[0];
      const message = first ? `${first.message} (${first.path.join(".")})` : "Validation failed";
      next(ApiError.badRequest(message, fields));
      return;
    }
    req.body = parsed.data;
    next();
  };
}
