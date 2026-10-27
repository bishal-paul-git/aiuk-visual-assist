import { devices, expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Server edition, two devices: the agent on a desktop and the customer on a
 * phone, in separate browser contexts. Contexts share no storage and no
 * BroadcastChannel, so everything the other side sees went through the
 * server (REST commands + SSE streams).
 */

// iPhone 13 metrics and touch input, in the configured (Chromium) browser.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iPhone } = devices["iPhone 13"];
const PHONE = { ...iPhone, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function signInAsSarah(page: Page) {
  await page.goto("/sign-in?next=/console");
  await page.getByRole("button", { name: /Sarah Jennings/ }).click();
  await page.waitForURL(/\/console\/?$/);
  await expect(page.getByRole("button", { name: "Start test session" })).toBeVisible();
}

async function expectNoErrorBanner(page: Page) {
  // Command errors in the console are shown with a "Dismiss" button.
  await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
  await expect(page.locator("[role=alert]:not(#__next-route-announcer__)").filter({ hasText: /\S/ })).toHaveCount(0);
}

async function newAgentPage(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, baseURL });
  return { context, page: await context.newPage() };
}

test.describe("server edition: cross-device session", () => {
  test("customer on a phone and agent on a desktop share one live session", async ({ browser, baseURL }) => {
    const agent = await newAgentPage(browser, baseURL!);
    const customerContext = await browser.newContext({ ...PHONE, baseURL });
    const customer = await customerContext.newPage();

    try {
      // --- Agent (device A) creates a test session -------------------------
      const a = agent.page;
      await signInAsSarah(a);
      await a.getByRole("button", { name: "Start test session" }).click();
      const dialog = a.getByRole("dialog", { name: /Router Visual Support/ });
      await dialog.locator('input[name="scenario"][value="wan_down"]').check();
      await dialog.getByRole("button", { name: "Create session" }).click();

      const customerLink = dialog.getByRole("link", { name: "Open customer view" });
      const consoleLink = dialog.getByRole("link", { name: "Open in agent console" });
      await expect(customerLink).toBeVisible();
      const customerHref = await customerLink.getAttribute("href");
      const consoleHref = await consoleLink.getAttribute("href");
      expect(customerHref).toMatch(/^\/assist\//);
      expect(consoleHref).toMatch(/^\/console\//);

      // --- Customer (device B, phone) joins with the link -------------------
      await customer.goto(customerHref!);
      await customer.getByRole("button", { name: "Agree and continue" }).click();
      await customer.getByRole("button", { name: /Use demo camera/ }).click();
      // Live view: the instruction card and the Human help control.
      const humanHelp = customer.getByRole("button", { name: "Human help" });
      await expect(humanHelp).toBeEnabled({ timeout: 30_000 });
      await humanHelp.click();
      await expect(customer.getByText("Connecting you to a person", { exact: true })).toBeVisible({ timeout: 30_000 });

      // --- Agent opens the session, joins and takes over ---------------------
      await a.goto(consoleHref!);
      await expect(a.getByRole("heading", { name: /Session VA-/ })).toBeVisible();
      // The escalation the customer asked for on the other device is visible here.
      await expect(a.getByText("Customer: Escalating")).toBeVisible({ timeout: 15_000 });
      await expect(a.getByText("Customer requested a person").filter({ visible: true }).first()).toBeVisible();
      await a.getByRole("button", { name: "Join session" }).first().click();
      await expect(a.getByRole("button", { name: "Join session" })).toHaveCount(0, { timeout: 15_000 });
      // Answering a customer who asked for a person: joining puts the agent in charge.
      await expect(a.getByRole("button", { name: "Take over" })).toHaveCount(0, { timeout: 15_000 });

      // The phone sees the human agent (pushed over SSE).
      await expect(customer.getByText(/is with you/)).toBeVisible({ timeout: 30_000 });

      // --- Agent speaks to the customer --------------------------------------
      // Letters only: long digit runs can be redacted as card numbers (Luhn check).
      const tag = Date.now().toString(36).replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
      const message = `Hello from the support desk ${tag}`;
      const composer = a.getByLabel("Message the customer");
      await expect(composer).toBeEnabled({ timeout: 15_000 });
      await composer.fill(message);
      await a.getByRole("button", { name: "Send", exact: true }).click();
      await expect(a.getByText(message).first()).toBeVisible({ timeout: 15_000 });

      // Shown (and spoken) on the customer's screen as the current instruction.
      await expect(customer.getByText(message)).toBeVisible({ timeout: 30_000 });

      await expectNoErrorBanner(a);

      // --- Agent ends the session --------------------------------------------
      await a.getByRole("button", { name: "End", exact: true }).first().click();
      await a.getByRole("menuitem", { name: "Resolved", exact: true }).click();
      await expect(a.getByRole("button", { name: "End", exact: true })).toHaveCount(0, { timeout: 15_000 });

      // The phone shows the ended state.
      await expect(customer.getByRole("heading", { name: "Session ended" })).toBeVisible({ timeout: 30_000 });
      await expect(customer.getByText(/Reference/)).toBeVisible();

      await expectNoErrorBanner(a);
      await expectNoErrorBanner(customer);
    } finally {
      await agent.context.close();
      await customerContext.close();
    }
  });
});

test.describe("server edition: API", () => {
  test("listing sessions without signing in is refused", async ({ request }) => {
    const r = await request.get("/api/sessions");
    expect(r.status()).toBe(401);
  });

  test("readiness endpoint reports ok", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe("ok");
    expect(body.ready).toBe(true);
    expect(body.edition).toBe("server");
  });
});
