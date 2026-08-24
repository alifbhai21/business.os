import { z } from "zod";

/**
 * Well-known development fallback secrets. In production these MUST be
 * overridden — Phase 13 refuses to boot with them (see productionEnvIssues).
 */
export const DEV_JWT_ACCESS_SECRET = "dev-access-secret-change-me-123456";
export const DEV_JWT_REFRESH_SECRET = "dev-refresh-secret-change-me-123456";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional(),
  MONGODB_URI: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16).default(DEV_JWT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16)
    .default(DEV_JWT_REFRESH_SECRET),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  AUTH_MAX_LOGIN_ATTEMPTS: z.coerce.number().default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().default(15),
  CORS_ORIGIN: z.string().default("*"),
  /** Global per-minute request ceiling (100 in production). The real-Atlas
   *  harness raises it so a long integration run is not itself throttled. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  /** Phase 14 — optional Sentry DSN; error tracking activates only when set. */
  SENTRY_DSN: z.string().optional(),
  /** Phase 14 — force structured JSON logs outside production when needed. */
  LOG_FORMAT: z.enum(["json", "pretty"]).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Phase 13 — production environment gate.
 *
 * Returns a list of human-readable configuration problems that make a
 * PRODUCTION deployment unsafe. Pure function so it is unit-testable without
 * process.exit. Enforced only when NODE_ENV=production:
 *
 *  - a MongoDB URI must be provided (production never silently boots on the
 *    in-memory fallback database);
 *  - JWT secrets must be overridden (the development defaults are public
 *    knowledge in this repository);
 *  - access and refresh secrets must differ;
 *  - CORS_ORIGIN must be an explicit allowlist ("*" combined with
 *     credentials:true is not a valid browser CORS configuration).
 */
export function productionEnvIssues(env: Env): string[] {
  const issues: string[] = [];
  if (!env.DATABASE_URL && !env.MONGODB_URI) {
    issues.push(
      "MONGODB_URI/DATABASE_URL is required in production (refusing to boot on an in-memory database)"
    );
  }
  if (env.JWT_ACCESS_SECRET === DEV_JWT_ACCESS_SECRET) {
    issues.push("JWT_ACCESS_SECRET still uses the well-known development default");
  }
  if (env.JWT_REFRESH_SECRET === DEV_JWT_REFRESH_SECRET) {
    issues.push("JWT_REFRESH_SECRET still uses the well-known development default");
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    issues.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different secrets");
  }
  if (env.CORS_ORIGIN.trim() === "*") {
    issues.push(
      "CORS_ORIGIN must be an explicit comma-separated origin allowlist in production ('*' is unsafe with credentials)"
    );
  }
  return issues;
}

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("❌ Invalid environment configuration:", parsed.error.flatten());
    process.exit(1);
  }
  if (parsed.data.NODE_ENV === "production") {
    const issues = productionEnvIssues(parsed.data);
    if (issues.length > 0) {
      // eslint-disable-next-line no-console
      console.error("❌ Unsafe production configuration:", issues.join(" | "));
      process.exit(1);
    }
  }
  return parsed.data;
}

/** Singleton env instance shared across the app. */
export const env: Env = loadEnv();
