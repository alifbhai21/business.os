// Final visible-browser hold: opens Business OS, logs in through the real UI,
// and keeps the window open so the final state can be inspected.
// No secrets are printed.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const creds = JSON.parse(readFileSync(new URL("./.runtime/credentials.json", import.meta.url), "utf8"));

const browser = await chromium.launch({ headless: false, slowMo: 160 });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

await page.goto("http://localhost:8083", { waitUntil: "domcontentloaded" });
await page.getByText("ইউনিভার্সাল বিজনেস ওএস").waitFor({ timeout: 120000 });
console.log("[FINAL-VISUAL] Welcome screen visible");

await page.getByText("সাইন ইন করুন").click();
await page.getByPlaceholder("ফোন নম্বর").fill(creds.phone);
await page.getByPlaceholder("পাসওয়ার্ড").fill(creds.password);
await page.getByText("লগইন", { exact: true }).click();

await page.getByText("ড্যাশবোর্ড", { exact: true }).first().waitFor({ timeout: 90000 });
console.log("[FINAL-VISUAL] Authenticated Dashboard reached. Holding browser open for inspection…");

// Keep the browser visible for inspection, then a screenshot and close.
await page.waitForTimeout(15000);
await page.screenshot({ path: "./artifacts/final-dashboard.png" });
console.log("[FINAL-VISUAL] Screenshot saved to e2e/artifacts/final-dashboard.png");
await page.waitForTimeout(3000);
await browser.close();
console.log("[FINAL-VISUAL] Closed.");