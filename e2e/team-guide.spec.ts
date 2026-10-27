import { expect, test } from "@playwright/test";

/**
 * Follows docs/TEAM-TESTING.md step 2 on a phone, as a first-time visitor:
 * start a test session from the console, be the customer in a new tab, ask
 * for a person, then join and take over as the agent.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("team guide: start a test session on a phone, ask for a person, join and take over", async ({ page, context }) => {
  await page.goto("/console/");
  await expect(page.getByRole("heading", { name: "Live queue" })).toBeVisible();
  await page.getByRole("button", { name: "Start test session" }).click();
  await page.getByRole("button", { name: "Create session" }).click();
  const customerLink = page.getByRole("link", { name: "Open customer view" });
  await expect(customerLink).toBeVisible();

  const [customer] = await Promise.all([context.waitForEvent("page"), customerLink.click()]);
  await customer.getByRole("button", { name: "Agree and continue" }).click();
  await customer.getByRole("button", { name: /Use demo camera/ }).click();
  await expect(customer.getByRole("button", { name: "Human help" })).toBeVisible({ timeout: 20_000 });
  await customer.getByRole("button", { name: "Human help" }).click();

  const consoleHref = await page.getByRole("link", { name: "Open in agent console" }).getAttribute("href");
  await page.goto(consoleHref!.replace(/^\/[^/]+(?=\/console)/, ""));
  await expect(page.getByText("Viewing only.", { exact: false })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Session actions" }).getByRole("button", { name: "Join" }).click();
  // The customer asked for a person, so joining puts the agent in charge.
  await expect(page.getByRole("navigation", { name: "Session actions" }).getByRole("button", { name: "Take over" })).toBeHidden();
  // No refusal or error banner along the way.
  await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
});
