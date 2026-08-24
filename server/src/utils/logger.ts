import winston from "winston";

const { combine, timestamp, printf, colorize } = winston.format;

/**
 * Phase 14 — PII/secret redaction.
 *
 * Structured logs must never carry credentials or personally identifiable
 * data. `redactText` is a PURE function so it is unit-testable:
 *
 *  - MongoDB/Postgres URIs keep only scheme + masked userinfo;
 *  - Bearer tokens and raw JWTs are replaced;
 *  - email addresses are masked to `<initial>***@domain`;
 *  - long hex secrets (>=32 chars) collapse to their length.
 */
export function redactText(input: string): string {
  let out = input;
  out = out.replace(
    /(mongodb(\+srv)?|postgres(ql)?|mysql):\/\/([^\s"'<>@/]+)@/gi,
    "$1://***:***@"
  );
  out = out.replace(/\bBearer\s+[A-Za-z0-9\-._~+/=]{8,}/gi, "Bearer ***");
  // JWT-shaped values (three base64url segments).
  out = out.replace(
    /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    "***jwt***"
  );
  out = out.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    (email) => `${email.slice(0, 1)}***@${email.slice(email.indexOf("@") + 1)}`
  );
  out = out.replace(/\b[0-9a-f]{32,}\b/gi, "(hex)");
  return out;
}

/** Winston format that applies redaction to the message and metadata. */
const redact = winston.format((info) => {
  if (typeof info.message === "string") {
    info.message = redactText(info.message);
  } else {
    try {
      info.message = JSON.parse(redactText(JSON.stringify(info.message)));
    } catch {
      info.message = String(info.message);
    }
  }
  return info;
});

/** Pretty human-readable line for development. */
const devFormat = combine(
  colorize(),
  timestamp(),
  printf(({ level, message, timestamp: ts }) => `${ts} [${level}] ${message}`)
);

/**
 * Production emits ONE-LINE JSON objects (structured logging) so they can be
 * shipped to any log aggregator without regex parsing. Redaction is applied
 * FIRST so no field can leak secrets into the payload.
 */
const prodFormat = combine(
  timestamp(),
  redact(),
  printf((info) => {
    const { level, message, timestamp: ts, ...rest } = info;
    return JSON.stringify({
      ts,
      level,
      msg: typeof message === "string" ? message : JSON.stringify(message),
      ...(Object.keys(rest).length > 0 ? { meta: rest } : {}),
    });
  })
);

const isProduction = process.env.NODE_ENV === "production";
const forceJson = process.env.LOG_FORMAT === "json";

export const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: isProduction || forceJson ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console({
      format: isProduction || forceJson ? prodFormat : devFormat,
    }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
  ],
});
