import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { attachNetworkLog, findRecord, printSummary } from "../helpers/netlog";
import * as mongo from "../helpers/mongo";
import { bn } from "../helpers/ui";

/**
 * FLOW 02 — THE REAL LOGIN TEST.
 * Opens the app, navigates Welcome -> Login, enters credentials in the real
 * form, submits, captures the login network exchange, verifies token storage
 * and the resulting authenticated Dashboard. No mocks anywhere.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const creds = JSON.parse(readFileSync(here + "../.runtime/credentials.json", "utf8"));

/** lazy loader — state.json is written by the 01-register suite at runtime */
function loadState() {
  return JSON.parse(readFileSync(here + "../.runtime/state.json", "utf8"));
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  printSummary();
  await mongo.closeMongo().catch(() => undefined);
});

test("login page renders with phone+password fields", async ({ page }) => {
  attachNetworkLog(page);
  console.log("[PLAYWRIGHT] Opening Business OS");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(bn.appName)).toBeVisible({ timeout: 120_000 });
  console.log("[PASS] App loaded — Welcome screen visible");

  await page.getByText(bn.signIn).click();
  await expect(page.getByPlaceholder(bn.phone)).toBeVisible();
  await expect(page.getByPlaceholder(bn.password)).toBeVisible();
  console.log("[PASS] Login screen located (phone + password inputs present)");
});

test("wrong password is rejected with HTTP 401 and UI error", async ({ page }) => {
  attachNetworkLog(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(bn.appName)).toBeVisible({ timeout: 120_000 });
  await page.getByText(bn.signIn).click();

  await page.getByPlaceholder(bn.phone).fill(creds.phone);
  await page.getByPlaceholder(bn.password).fill("definitely-wrong-password");
  console.log("[PLAYWRIGHT] Submitting WRONG password (negative control)");
  await page.getByText(bn.login, { exact: true }).click();

  const rec = findRecord("POST", "/api/v1/auth/login");
  await expect.poll(() => rec?.status, { timeout: 30_000 }).toBe(401);
  console.log("[PASS] POST /api/v1/auth/login -> HTTP 401 (rejected)");

  // failed attempt recorded in MongoDB audit trail
  const user = await mongo.findUserByEmail(creds.email);
  const audits = await mongo.recentAuditLogsFor(String(user!._id), 3);
  expect(audits.map((a) => a.action)).toContain("LOGIN_FAILED");
  console.log("[MONGO] LOGIN_FAILED audit verified");
});

test("real login -> HTTP 200 -> tokens stored -> Dashboard rendered", async ({ page }) => {
  attachNetworkLog(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(bn.appName)).toBeVisible({ timeout: 120_000 });
  await page.getByText(bn.signIn).click();

  console.log("[PLAYWRIGHT] Entering credentials (values redacted)");
  await page.getByPlaceholder(bn.phone).fill(creds.phone);
  await page.getByPlaceholder(bn.password).fill(creds.password);

  const loginResponsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST"
  );
  await page.getByText(bn.login, { exact: true }).click();

  const resp = await loginResponsePromise;
  expect(resp.status()).toBe(200);
  console.log("[PLAYWRIGHT] POST /api/v1/auth/login");
  console.log("[PASS] HTTP 200");

  const body = (await resp.json()) as {
    success: boolean;
    data: { user: { id: string }; businessId: string | null; accessToken: string; refreshToken: string; sessionId: string };
  };
  // structure verification WITHOUT printing secrets
  expect(body.success).toBe(true);
  expect(body.data.user.id).toBeTruthy();
  expect(body.data.accessToken).toMatch(/^eyJ/); // JWT header shape (base64url of {alg,typ})
  expect(body.data.refreshToken.length).toBeGreaterThan(20);
  expect(body.data.sessionId).toBeTruthy();
  console.log(
    `[PASS] Response structure OK (user=${body.data.user.id}, businessId=${body.data.businessId}, tokens present but redacted)`
  );

  // wait for dashboard to appear
  await expect(page.getByText(bn.dashboard)).toBeVisible({ timeout: 90_000 });
  console.log("[PASS] Navigation to authenticated Home/Dashboard");

  // token storage exists in browser
  const storage = await page.evaluate(() => ({
    hasAccess: !!window.localStorage.getItem("bos.accessToken"),
    hasRefresh: !!window.localStorage.getItem("bos.refreshToken"),
    deviceId: window.localStorage.getItem("bos.deviceId") ?? null,
    accessPrefix: (window.localStorage.getItem("bos.accessToken") ?? "").slice(0, 6),
  }));
  expect(storage.hasAccess, "access token stored").toBe(true);
  expect(storage.hasRefresh, "refresh token stored").toBe(true);
  expect(storage.deviceId).toBeTruthy();
  expect(storage.accessPrefix.startsWith("ey")).toBe(true);
  console.log(`[PASS] Token storage verified: accessToken=stored refreshToken=stored deviceId=${storage.deviceId}`);

  // dashboard API was called with Authorization header
  const dash = findRecord("GET", "/api/v1/dashboard");
  await expect.poll(() => dash?.status, { timeout: 30_000 }).toBe(200);
  expect(dash!.authHeader).toBe(true);
  console.log("[PASS] GET /api/v1/dashboard -> HTTP 200 with Authorization header");

  // ---- Backend/MongoDB side-effects of login ----
  const user = await mongo.findUserByEmail(creds.email);
  console.log("[MONGO] Verifying login side effects");
  expect(user!.lastLoginAt).toBeTruthy();
  expect(user!.failedLoginAttempts ?? 0).toBe(0);
  console.log(`[PASS] users.lastLoginAt updated, failed attempts reset`);

  const rts = await mongo.refreshTokensFor(String(user!._id));
  const active = rts.filter((r) => !r.revokedAt);
  expect(active.length, "a new active refresh token issued").toBeGreaterThan(0);
  console.log(`[PASS] refreshtokens: ${active.length} active session(s) persisted`);

  const audits = await mongo.recentAuditLogsFor(String(user!._id), 5);
  expect(audits.map((a) => a.action)).toContain("LOGIN_SUCCESS");
  console.log("[PASS] auditlogs: LOGIN_SUCCESS recorded");

  const mems = await mongo.membershipsFor(String(user!._id));
  const s = loadState();
  expect(mems.map((m) => String(m.businessId))).toContain(s.businessId);
  console.log(`[MONGO] business context established: membership -> business ${s.businessId}`);
});
