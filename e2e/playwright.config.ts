import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: "./test-results",
  use: {
    baseURL: "http://localhost:8083",
    headless: false,
    viewport: { width: 1280, height: 860 },
    launchOptions: { slowMo: 220 },
    navigationTimeout: 180_000,
    actionTimeout: 30_000,
    video: "retain-on-failure",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
