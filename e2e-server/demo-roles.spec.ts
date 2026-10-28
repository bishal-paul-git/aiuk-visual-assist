import { expect, test } from "@playwright/test";

/**
 * Server edition: the trial's "Be the support agent" choice. A pretend
 * customer plays itself; the tester answers on the agent side and the
 * walkthrough waits for them.
 */
test.describe("server edition: try a single role", () => {
  test("a tester plays the agent while a pretend customer plays itself", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/client/sign-in");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/client");
    await expect(page.getByRole("heading", { name: "What would you like to try?" })).toBeVisible();
    for (const id of ["goal-watch", "goal-agent", "goal-customer", "goal-both"]) await expect(page.getByTestId(id)).toBeVisible();
    // No phone-number box to puzzle testers.
    await expect(page.getByText("Text the customer link")).toHaveCount(0);

    const href = await page.getByTestId("goal-agent").getByRole("link", { name: "Take a call" }).getAttribute("href");
    expect(href).toContain("as=agent");
    await page.goto(href!);

    // The pretend customer runs by itself until it needs a person; then it's the tester's turn.
    await expect(page.getByText(/Your turn\. The customer wants a person/).first()).toBeVisible({ timeout: 120_000 });
    const agent = page.frameLocator('iframe[title="Agent console"]');
    await agent.getByRole("button", { name: "Join session" }).first().click();
    const customer = page.frameLocator('iframe[title="Customer view"]');
    await expect(customer.getByText(/from the support team/).first()).toBeVisible({ timeout: 30_000 });
    // The walkthrough now waits for the tester's next move instead of making it.
    await expect(page.getByText(/Your turn/).first()).toBeVisible({ timeout: 30_000 });
  });
});
