import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const credFile = join(here, "..", ".runtime", "credentials.json");

export interface E2ECredentials {
  phone: string;
  email: string;
  password: string;
  businessName: string;
  shopName: string;
  branchCode: string;
}

/**
 * Runtime-generated isolated E2E credentials. The password is random per suite
 * and is NEVER printed to the terminal or included in reports.
 * The account is created through the application's real registration flow.
 */
export function loadOrCreateCredentials(): E2ECredentials {
  if (existsSync(credFile)) {
    return JSON.parse(readFileSync(credFile, "utf8")) as E2ECredentials;
  }
  const suffix = randomBytes(3).toString("hex");
  const phone = `01700${suffix}01`; // 11-digit BD-style test phone
  const creds: E2ECredentials = {
    phone,
    email: `${phone}@placeholder.local`,
    password: `E2e-${randomBytes(12).toString("base64url")}!7`,
    businessName: `E2E Test Business ${suffix}`,
    shopName: `E2E Main Shop ${suffix}`,
    branchCode: `E2E${suffix.toUpperCase()}`,
  };
  mkdirSync(dirname(credFile), { recursive: true });
  writeFileSync(credFile, JSON.stringify(creds, null, 2));
  return creds;
}
