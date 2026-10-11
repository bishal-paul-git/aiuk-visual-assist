import { expect, test } from "@playwright/test";

/**
 * The demo stage's scripted walkthrough drives the real customer page and
 * agent console (in iframes) through the in-browser runtime.
 */
test.describe("demo walkthrough", () => {
  test("power cycle scenario is resolved by the AI", async ({ page }) => {
    await page.goto("/demo/");
    await page.getByLabel("Scenario").selectOption("power_cycle_fix");
    await page.getByRole("button", { name: "Play walkthrough" }).click();

    const customer = page.frameLocator('iframe[title="Customer view"]');
    await expect(customer.getByText("My broadband isn't working", { exact: false })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Resolved by the AI, with no human needed", { exact: false })).toBeVisible({ timeout: 150_000 });

    const console = page.frameLocator('iframe[title="Agent console"]');
    await expect(console.getByText("Resolved by AI", { exact: false }).first()).toBeVisible();
  });

  test("line fault is escalated and a human books an engineer", async ({ page }) => {
    await page.goto("/demo/");
    await page.getByLabel("Scenario").selectOption("wan_down");
    await page.getByRole("button", { name: "Play walkthrough" }).click();

    await expect(page.getByText("Escalated", { exact: false }).first()).toBeVisible({ timeout: 150_000 });
    const console = page.frameLocator('iframe[title="Agent console"]');
    await expect(console.getByText("from the support team joined", { exact: false }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Resolved by the human agent", { exact: false })).toBeVisible({ timeout: 60_000 });
  });
});
