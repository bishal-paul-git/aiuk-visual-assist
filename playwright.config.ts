import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests against the static demo build (`npm run build:static`
 * with no base path). Run with `npm run test:e2e`. E2E_PORT picks another
 * port when 4173 is taken.
 */
const port = Number(process.env.E2E_PORT) || 4173;

export default defineConfig({
  testDir: "e2e",
  timeout: 300_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `PORT=${port} node scripts/serve-static.mjs`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
