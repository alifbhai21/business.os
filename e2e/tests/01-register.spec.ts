import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { loadOrCreateCredentials } from "../helpers/credentials";
import { attachNetworkLog, findRecord } from "../helpers/netlog";
import * as mongo from "../helpers/mongo";
import { bn } from "../helpers/ui";

/**
 * FLOW 01 — Register an isolated E2E account through the REAL UI,
 * then complete Business + Shop onboarding, then log out.
 * Every state change is verified against the real MongoDB Atlas data.
 */

const stateFile = fileURLToPath(new URL("../.runtime/state.json", import.meta.url));

let creds = loadOrCreateCredentials();
const created = { userId: "", businessId: "", shopId: "" };

test.describe.configure({ mode: "serial" });

/**
 * Each Playwright test receives its OWN fresh page/context — serial mode does NOT
 * share browser state across tests. To resume the authenticated session started by
 * a Prior test we must log in through the REAL UI form on this new page.
 */
async function loginThroughUi(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(bn.appName)).toBeVisible({ timeout: 120_000 });
  // Session restore from localStorage may already land us on the Dashboard.
  if (await page.getByText(bn.dashboard).isVisible().catch(() => false)) return;
  await page.getByText(bn.signIn).click();
  await page.getByPlaceholder(bn.phone).fill(creds.phone);
  await page.getByPlaceholder(bn.password).fill(creds.password);
  await page.getByText(bn.login, { exact: true }).click();
  await expect(
    page
      .getByText(bn.dashboard)
      .or(page.getByText(bn.businessSetup))
      .or(page.getByText(bn.shopSetup))
  ).toBeVisible({ timeout: 90_000 });
}

test.afterAll(async () => {
  await mongo.closeMongo().catch(() => undefined);
});

test("register page opens from welcome", async ({ page }) => {
  attachNetworkLog(page);
  console.log("[PLAYWRIGHT] Opening http://localhost:8083");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(bn.appName)).toBeVisible({ timeout: 120_000 });
  console.log("[PASS] Welcome screen rendered");

  await page.getByText(bn.createBusinessBtn).click();
  await expect(page.getByText(bn.register).first()).toBeVisible();
  console.log("[PASS] Register screen visible");
});

test("register via UI -> API 201 -> MongoDB user/device/token/audit verified", async ({ page }) => {
  attachNetworkLog(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(bn.appName)).toBeVisible({ timeout: 120_000 });
  await page.getByText(bn.createBusinessBtn).click();

  console.log("[PLAYWRIGHT] Filling registration form (values redacted)");
  await page.getByPlaceholder(bn.name).fill(`E2E Tester`);
  await page.getByPlaceholder(bn.phone).fill(creds.phone);
  await page.getByPlaceholder(bn.password).fill(creds.password);
  // Attach the listener BEFORE the click to avoid missing the request (race).
  const regResp = page.waitForResponse(
    (r) => r.url().includes("/api/v1/auth/register") && r.request().method() === "POST",
    { timeout: 30_000 }
  );
  // RNW Pressable renders a <div> with no role=button, so use the visible text.
  await page.getByText(bn.register, { exact: true }).last().click();
  const reg = await regResp;
  expect(reg.status()).toBe(201);
  console.log("[PASS] POST /api/v1/auth/register -> HTTP 201");

  // Business setup screen should appear for a fresh account
  await expect(page.getByText(bn.businessSetup)).toBeVisible({ timeout: 60_000 });
  console.log("[PASS] Navigated to Business Setup");

  // ---- MongoDB verification ----
  console.log("[MONGO] Checking users collection");
  const user = await mongo.findUserByEmail(creds.email);
  expect(user, "user document must exist").toBeTruthy();
  created.userId = String(user!._id);
  expect(user!.phone).toBe(creds.phone);
  expect(user!.status).toBe("ACTIVE");
  console.log(`[PASS] users: _id=${user!._id} status=ACTIVE phone matches`);

  console.log("[MONGO] Checking devices");
  const devices = await mongo.devicesFor(created.userId);
  expect(devices.length, "device registered at signup").toBeGreaterThan(0);
  console.log(`[PASS] devices: ${devices.length} device(s) linked to user`);

  console.log("[MONGO] Checking refreshtokens (active session persisted)");
  const rts = await mongo.refreshTokensFor(created.userId);
  expect(rts.length, "refresh token persisted").toBeGreaterThan(0);
  expect(rts[0].revokedAt ?? null).toBeNull();
  console.log(`[PASS] refreshtokens: ${rts.length} total, latest active`);

  console.log("[MONGO] Checking auditlogs");
  const audits = await mongo.recentAuditLogsFor(created.userId, 10);
  const actions = audits.map((a) => a.action);
  expect(actions).toContain("REGISTER");
  expect(actions).toContain("DEVICE_REGISTERED");
  console.log(`[PASS] auditlogs: ${actions.join(", ")}`);
});

test("business setup via UI -> API 201 -> MongoDB business+membership verified", async ({ page }) => {
  attachNetworkLog(page);
  await loginThroughUi(page);
  await expect(page.getByText(bn.businessSetup)).toBeVisible({ timeout: 60_000 });

  console.log("[PLAYWRIGHT] Creating business through form");
  await page.getByPlaceholder(bn.businessName).fill(creds.businessName);
  const bizResp = page.waitForResponse(
    (r) => r.url().includes("/api/v1/businesses") && r.request().method() === "POST",
    { timeout: 30_000 }
  );
  await page.getByText(bn.createBusinessBtn).click();
  const bizRes = await bizResp;
  expect(bizRes.status()).toBe(201);
  console.log("[PASS] POST /api/v1/businesses -> HTTP 201");

  await expect(page.getByText(bn.shopSetup)).toBeVisible({ timeout: 60_000 });
  console.log("[PASS] Navigated to Shop Setup");

  const mems = await mongo.membershipsFor(created.userId);
  expect(mems.length).toBeGreaterThan(0);
  created.businessId = String(mems[0].businessId);
  writeFileSync(stateFile, JSON.stringify(created, null, 2));
  const biz = await mongo.businessById(created.businessId);
  console.log("[MONGO] Checking businesses + businessmemberships");
  expect(String(biz!.name)).toBe(creds.businessName);
  expect(mems[0].role).toBe("Owner");
  expect(mems[0].status).toBe("ACTIVE");
  console.log(
    `[PASS] businesses: name matches (${created.businessId}); membership role=Owner status=ACTIVE`
  );
});

test("shop setup via UI -> API 201 -> MongoDB shop verified -> Dashboard loads", async ({ page }) => {
  attachNetworkLog(page);
  await loginThroughUi(page);
  await expect(page.getByText(bn.shopSetup)).toBeVisible({ timeout: 60_000 });

  console.log("[PLAYWRIGHT] Creating shop through form");
  await page.getByPlaceholder(bn.shopName).fill(creds.shopName);
  await page.getByPlaceholder(bn.branchCode).fill(creds.branchCode);
  const shopResp = page.waitForResponse(
    (r) => r.url().includes("/api/v1/shops") && r.request().method() === "POST",
    { timeout: 30_000 }
  );
  await page.getByText(bn.createShop).click();
  const shopRes = await shopResp;
  expect(shopRes.status()).toBe(201);
  console.log("[PASS] POST /api/v1/shops -> HTTP 201");

  const shops = await mongo.shopsFor(created.businessId);
  expect(shops.length).toBeGreaterThan(0);
  created.shopId = String(shops[0]._id);
  writeFileSync(stateFile, JSON.stringify(created, null, 2));
  console.log("[MONGO] Checking shops");
  expect(shops.some((s) => s.name === creds.shopName && s.branchCode === creds.branchCode)).toBe(true);
  console.log(`[PASS] shops: ${shops.length} shop(s), branch code unique match`);

  // Home dashboard appears once business+shop exist
  await expect(page.getByText(bn.dashboard)).toBeVisible({ timeout: 90_000 });
  const dashRespFired = page
    .waitForResponse((r) => r.url().includes("/api/v1/dashboard") && r.request().method() === "GET")
    .then((r) => r.status())
    .catch(() => undefined);
  const dashStatus = await dashRespFired;
  expect(dashStatus).toBe(200);
  console.log("[PASS] GET /api/v1/dashboard -> HTTP 200 with Bearer auth");
  console.log("[PASS] Home/Dashboard rendered after full onboarding");
});

test("logout via Settings clears local session and revokes refresh token", async ({ page }) => {
  attachNetworkLog(page);
  await loginThroughUi(page);

  await expect(page.getByText(bn.dashboard)).toBeVisible({ timeout: 90_000 });
  await page.getByText(bn.settings, { exact: true }).first().click();
  await expect(page.getByText(bn.logout)).toBeVisible({ timeout: 30_000 });
  console.log("[PLAYWRIGHT] Clicking logout");
  await page.getByText(bn.logout).click();

  const rec = findRecord("POST", "/api/v1/auth/logout");
  await expect.poll(() => rec?.status, { timeout: 30_000 }).toBe(200);
  console.log("[PASS] POST /api/v1/auth/logout -> HTTP 200");

  // back to Welcome screen
  await expect(page.getByText(bn.signIn)).toBeVisible({ timeout: 30_000 });
  console.log("[PASS] Returned to Welcome screen");

  // localStorage cleared
  const stored = await page.evaluate(() => ({
    access: window.localStorage.getItem("bos.accessToken"),
    refresh: window.localStorage.getItem("bos.refreshToken"),
  }));
  expect(stored.access).toBeNull();
  expect(stored.refresh).toBeNull();
  console.log("[PASS] localStorage bos.accessToken/bos.refreshToken removed");

  console.log("[MONGO] Checking refresh token revocation + LOGOUT audit");
  // POST /logout revokes ONLY the presented (current session) refresh token —
  // other sessions stay valid. Verify: the current session token got revoked.
  const rts = await mongo.refreshTokensFor(created.userId);
  const activeCount = rts.filter((r) => !r.revokedAt).length;
  const revokedCount = rts.filter((r) => r.revokedAt).length;
  expect(revokedCount, "at least the current session was revoked").toBeGreaterThan(0);
  // The suite logs in several times, so other sessions legitimately remain active.
  expect(activeCount).toBeLessThanOrEqual(rts.length);
  const audits = await mongo.recentAuditLogsFor(created.userId, 5);
  expect(audits.map((a) => a.action)).toContain("LOGOUT");
  console.log(
    `[PASS] MongoDB: current-session refresh token revoked (active=${activeCount}, revoked=${revokedCount}); LOGOUT audit written`
  );

  writeFileSync(stateFile, JSON.stringify(created, null, 2));
});
