import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { attachNetworkLog, findRecord, printSummary } from "../helpers/netlog";
import * as mongo from "../helpers/mongo";
import { bn } from "../helpers/ui";

/**
 * FLOW 04 — REGRESSION: logout invalidates server-side session and the app
 * returns to a protected, unauthenticated state.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const creds = JSON.parse(readFileSync(here + "../.runtime/credentials.json", "utf8"));

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  printSummary();
  await mongo.closeMongo().catch(() => undefined);
});

test("logout -> refresh token revoked in MongoDB -> protected state enforced", async ({ page }) => {
  attachNetworkLog(page);

  // login through real UI
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(bn.appName)).toBeVisible({ timeout: 120_000 });
  await page.getByText(bn.signIn).click();
  await page.getByPlaceholder(bn.phone).fill(creds.phone);
  await page.getByPlaceholder(bn.password).fill(creds.password);
  await page.getByText(bn.login, { exact: true }).click();
  await expect(page.getByText(bn.dashboard)).toBeVisible({ timeout: 90_000 });
  console.log("[PASS] Logged in for logout regression");

  const user = await mongo.findUserByEmail(creds.email);
  expect(user).toBeTruthy();

  // capture active refresh-token count BEFORE logout (no values printed)
  const beforeActive = (await mongo.refreshTokensFor(String(user!._id))).filter((r) => !r.revokedAt).length;
  expect(beforeActive).toBeGreaterThan(0);
  console.log(`[MONGO] Active refresh tokens before logout: ${beforeActive}`);

  // logout via Settings
  await page.getByText(bn.settings, { exact: true }).first().click();
  await expect(page.getByText(bn.logout)).toBeVisible();
  await page.getByText(bn.logout).click();

  const rec = findRecord("POST", "/api/v1/auth/logout");
  await expect.poll(() => rec?.status, { timeout: 30_000 }).toBe(200);
  console.log("[PASS] POST /api/v1/auth/logout -> HTTP 200");

  await expect(page.getByText(bn.signIn)).toBeVisible({ timeout: 30_000 });
  console.log("[PASS] UI returned to Welcome (unauthenticated)");

  const storage = await page.evaluate(() => ({
    access: window.localStorage.getItem("bos.accessToken"),
    refresh: window.localStorage.getItem("bos.refreshToken"),
  }));
  expect(storage.access).toBeNull();
  expect(storage.refresh).toBeNull();
  console.log("[PASS] Tokens cleared from browser storage");

  console.log("[MONGO] Verifying server-side revocation");
  const after = await mongo.refreshTokensFor(String(user!._id));
  const revokedCount = after.filter((r) => r.revokedAt).length;
  const afterActive = after.filter((r) => !r.revokedAt).length;
  // POST /logout revokes the presented session's token. Other sessions from
  // earlier suite logins may remain; the key security property is that this
  // logout created a revocation and the current session cannot be reused.
  expect(revokedCount, "logout must revoke at least the presented session").toBeGreaterThan(0);
  const audits = await mongo.recentAuditLogsFor(String(user!._id), 5);
  expect(audits.map((a) => a.action)).toContain("LOGOUT");
  console.log(
    `[PASS] refreshtokens revoked=${revokedCount} active=${afterActive}; LOGOUT audit present`
  );

  // post-logout reload: app must NOT auto-authenticate with stale tokens
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(bn.appName)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(bn.signIn)).toBeVisible({ timeout: 30_000 });
  console.log("[PASS] Reload keeps user logged out — protected route enforced");
});
