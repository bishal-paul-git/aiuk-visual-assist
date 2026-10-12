import { devices, expect, test, type Page } from "@playwright/test";

/**
 * The public demo on a phone: no horizontal scrolling, and the walkthrough
 * plays with the customer view full screen and a Customer | Agent switch.
 */
// iPhone 13 metrics and touch input, in the configured (Chromium) browser.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iPhone } = devices["iPhone 13"];
test.use({ ...iPhone, viewport: { width: 390, height: 844 } });

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function expectFrameFits(page: Page, title: string) {
  const frame = await page.locator(`iframe[title="${title}"]`).elementHandle();
  const doc = await frame!.contentFrame();
  const { scrollWidth, innerWidth } = await doc!.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

test.describe("phone layout", () => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
  ]) {
    test(`home and demo intro fit ${size.width}px without horizontal scroll`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto("/demo/");
      await expect(page.getByRole("button", { name: "Play the walkthrough" })).toBeInViewport();
      await expectNoHorizontalOverflow(page);
    });
  }

  test("power cycle walkthrough plays on a phone and switches to the agent view", async ({ page }) => {
    await page.goto("/demo/");
    await page.getByRole("button", { name: /AI resolves it/ }).click();
    await page.getByRole("button", { name: "Play the walkthrough" }).click();

    const views = page.getByRole("tablist", { name: "Choose view" });
    const customerTab = views.getByRole("tab", { name: "Customer" });
    const agentTab = views.getByRole("tab", { name: "Agent" });
    await expect(customerTab).toHaveAttribute("aria-selected", "true");
    for (const tab of [customerTab, agentTab]) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // The customer view fills the width of the screen (no phone bezel).
    const customerFrame = page.locator('iframe[title="Customer view"]');
    expect((await customerFrame.boundingBox())!.width).toBe(390);
    const customer = page.frameLocator('iframe[title="Customer view"]');
    await expect(customer.getByText("My broadband isn't working", { exact: false }).first()).toBeVisible({ timeout: 60_000 });
    await expectNoHorizontalOverflow(page);
    await expectFrameFits(page, "Customer view");

    // Mark both documents so we can tell if switching reloads them.
    for (const title of ["Customer view", "Agent console"]) {
      const handle = await page.locator(`iframe[title="${title}"]`).elementHandle();
      await (await handle!.contentFrame())!.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
    }

    await agentTab.click();
    await expect(agentTab).toHaveAttribute("aria-selected", "true");
    const console = page.frameLocator('iframe[title="Agent console"]');
    await expect(console.getByRole("heading", { name: /Session VA-/ })).toBeVisible();
    await expect(console.getByRole("navigation", { name: "Session actions" }).getByRole("button", { name: "Take over" })).toBeVisible();
    await expect(customerFrame).toBeHidden();
    await expectNoHorizontalOverflow(page);
    await expectFrameFits(page, "Agent console");

    await customerTab.click();
    await expect(page.getByText("Resolved by the AI, with no human needed", { exact: false })).toBeVisible({ timeout: 150_000 });
    await expect(page.getByRole("link", { name: "Open the session record" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Replay" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Try another scenario" })).toBeInViewport();
    await expectNoHorizontalOverflow(page);

    await agentTab.click();
    await expect(console.getByText("Resolved by AI", { exact: false }).first()).toBeVisible();

    for (const title of ["Customer view", "Agent console"]) {
      const handle = await page.locator(`iframe[title="${title}"]`).elementHandle();
      expect(await (await handle!.contentFrame())!.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
    }
  });
});
