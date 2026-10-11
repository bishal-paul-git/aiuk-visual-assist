import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests against the static demo build (`npm run build:static`
 * with no base path). Run with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "node scripts/serve-static.mjs",
    url: "http://localhost:4173/",
    reuseExistingServer: !process.env.CI,
  },
});
