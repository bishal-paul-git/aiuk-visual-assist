import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests against the SERVER edition (REST + SSE API routes,
 * sessions shared across devices). Build first with `npm run build`, then run
 * `npm run test:e2e:server`.
 *
 * - E2E_SERVER_PORT picks the port (default 4400).
 * - Sessions are written to a fresh temporary DATA_DIR on every run.
 * - AUTH_SECRET is a fixed test value so the signed session cookies are valid.
 * - ANTHROPIC_API_KEY is removed, so sessions run on the scenario simulator.
 * - STANDALONE=1 runs `.next/standalone/server.js` (the Docker build) instead
 *   of `next start`; that build needs `.next/static` and `public` copied in.
 */
const port = Number(process.env.E2E_SERVER_PORT) || 4400;

// Playwright loads this config in the runner and in each worker; keep one
// directory per run by passing it on through the environment.
const dataDir = (process.env.E2E_SERVER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "va-e2e-server-")));

const serverEnv: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== "ANTHROPIC_API_KEY") serverEnv[k] = v;
Object.assign(serverEnv, {
  PORT: String(port),
  HOSTNAME: "127.0.0.1",
  DATA_DIR: dataDir,
  AUTH_SECRET: "e2e-server-test-secret-0123456789abcdefghijklmnop",
  NODE_ENV: "production",
});

export default defineConfig({
  testDir: "e2e-server",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: process.env.STANDALONE === "1" ? "node .next/standalone/server.js" : `npm start -- -p ${port} -H 127.0.0.1`,
    url: `http://127.0.0.1:${port}/api/health`,
    env: serverEnv,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
