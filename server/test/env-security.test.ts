import { test } from "node:test";
import assert from "node:assert/strict";
import {
  productionEnvIssues,
  DEV_JWT_ACCESS_SECRET,
  DEV_JWT_REFRESH_SECRET,
  type Env,
} from "../src/config/env";

/**
 * Phase 13 — production environment gate.
 *
 * loadEnv() refuses to boot a PRODUCTION process with unsafe configuration
 * (in-memory DB fallback, well-known dev JWT secrets, wildcard CORS). The
 * gate is a pure function so it is verified here without process.exit.
 */

function prodEnv(over: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "production",
    PORT: 4000,
    DATABASE_URL: "mongodb+srv://prod-user:secret@cluster.mongodb.net/business-os",
    JWT_ACCESS_SECRET: "x".repeat(32),
    JWT_REFRESH_SECRET: "y".repeat(32),
    JWT_ACCESS_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "30d",
    AUTH_MAX_LOGIN_ATTEMPTS: 5,
    AUTH_LOCKOUT_MINUTES: 15,
    CORS_ORIGIN: "https://app.example.com",
    RATE_LIMIT_MAX: 100,
    ...over,
  } as Env;
}

test("env gate: a complete production configuration has no issues", () => {
  assert.deepEqual(productionEnvIssues(prodEnv()), []);
});

test("env gate: missing MongoDB URI in production is rejected", () => {
  const issues = productionEnvIssues(prodEnv({ DATABASE_URL: undefined, MONGODB_URI: undefined }));
  assert.equal(issues.length, 1);
  assert.match(issues[0], /MONGODB_URI\/DATABASE_URL is required/);
});

test("env gate: MONGODB_URI alone satisfies the database requirement", () => {
  const issues = productionEnvIssues(
    prodEnv({ DATABASE_URL: undefined, MONGODB_URI: "mongodb+srv://u:s@c.mongodb.net/business-os" })
  );
  assert.deepEqual(issues, []);
});

test("env gate: development default JWT access secret is rejected in production", () => {
  const issues = productionEnvIssues(prodEnv({ JWT_ACCESS_SECRET: DEV_JWT_ACCESS_SECRET }));
  assert.ok(issues.some((i) => /JWT_ACCESS_SECRET/.test(i)));
});

test("env gate: development default JWT refresh secret is rejected in production", () => {
  const issues = productionEnvIssues(prodEnv({ JWT_REFRESH_SECRET: DEV_JWT_REFRESH_SECRET }));
  assert.ok(issues.some((i) => /JWT_REFRESH_SECRET/.test(i)));
});

test("env gate: identical access/refresh secrets are rejected", () => {
  const same = "z".repeat(32);
  const issues = productionEnvIssues(
    prodEnv({ JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same })
  );
  assert.ok(issues.some((i) => /must be different/.test(i)));
});

test("env gate: wildcard CORS_ORIGIN is rejected in production", () => {
  const issues = productionEnvIssues(prodEnv({ CORS_ORIGIN: "*" }));
  assert.ok(issues.some((i) => /CORS_ORIGIN/.test(i)));
});

test("env gate: every problem is reported together, not just the first", () => {
  const issues = productionEnvIssues(
    prodEnv({
      DATABASE_URL: undefined,
      JWT_ACCESS_SECRET: DEV_JWT_ACCESS_SECRET,
      CORS_ORIGIN: "*",
    })
  );
  assert.equal(issues.length, 3);
});
