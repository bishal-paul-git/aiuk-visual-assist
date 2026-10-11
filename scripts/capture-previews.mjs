// Captures the product screenshots used on the home page and as the link
// preview image (public/images). Run against a static build being served by
// scripts/serve-static.mjs:  node scripts/capture-previews.mjs
import { chromium } from "@playwright/test";

const base = process.env.PREVIEW_URL ?? "http://localhost:4173";
const out = new URL("../public/images/", import.meta.url).pathname;
const jpeg = { type: "jpeg", quality: 82 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${base}/platform/`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}preview-platform.jpg`, ...jpeg });

await page.goto(`${base}/demo/?play=wan_down`);
const customer = page.locator('iframe[title="Customer view"]');
const agent = page.locator('iframe[title="Agent console"]');
const t0 = Date.now();
const at = (s) => page.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));

await at(17);
await customer.screenshot({ path: `${out}preview-customer.jpg`, ...jpeg });
await at(24);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: `${out}preview-stage.jpg`, ...jpeg });
await page.screenshot({ path: `${out}og.jpg`, clip: { x: 0, y: 0, width: 1440, height: 756 }, ...jpeg });
await page.getByText("The agent joins", { exact: false }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(2500);
await agent.screenshot({ path: `${out}preview-console.jpg`, ...jpeg });

await browser.close();
console.log("Saved previews to", out);
