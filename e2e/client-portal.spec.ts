import { expect, test } from "@playwright/test";

/**
 * Static demo: the client trial. The login is pre-filled, the same browser
 * plays both sides, and the tester's screen follows the conversation.
 */
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["camera", "microphone"],
});

async function logIn(page: import("@playwright/test").Page) {
  await page.goto("/client/sign-in/");
  await expect(page.getByLabel("Email")).toHaveValue("demo@xtelecom.example");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/client\/?$/);
  await expect(page.getByRole("heading", { name: "Try Visual Assist" })).toBeVisible();
}

test.describe("client trial (static demo)", () => {
  test("log in with the filled-in details, start a conversation and follow it from both sides", async ({ page, context }) => {
    await logIn(page);
    await page.getByRole("button", { name: "Start both sides" }).click();
    const coach = page.getByTestId("trial-coach");
    await expect(coach).toHaveAttribute("data-step", "waiting_customer");

    const customerHref = await page.getByRole("link", { name: "Open customer view" }).getAttribute("href");
    expect(customerHref).toMatch(/\/assist\/s\/?\?|\/assist\//);
    const customer = await context.newPage();
    await customer.goto(customerHref!);
    await customer.getByRole("button", { name: "Agree and continue" }).click();
    await customer.getByRole("button", { name: /Use demo camera/ }).click();
    await expect(customer.getByRole("button", { name: "Human help" })).toBeEnabled({ timeout: 30_000 });
    await expect(coach).not.toHaveAttribute("data-step", "waiting_customer", { timeout: 30_000 });

    await customer.getByRole("button", { name: "Human help" }).click();
    await expect(coach).toHaveAttribute("data-step", "needs_agent", { timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Open agent screen" })).toBeVisible();
  });

  test("a wrong password is refused", async ({ page }) => {
    await page.goto("/client/sign-in/");
    await page.getByLabel("Password").fill("nope");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByText("That email or password isn't right.")).toBeVisible();
  });

  test("the sign-in offers team logins only inside the 'someone else' fold, and never platform staff", async ({ page }) => {
    await page.goto("/client/sign-in/");
    await page.getByText("Log in as someone else from your team").click();
    await expect(page.getByRole("button", { name: /Tom Hughes/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /James Carter/ })).toHaveCount(0);
  });

  test("every portal page fits a phone", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    for (const path of ["/client/sign-in/", "/client/", "/client/sessions/", "/client/results/"]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows the phone width`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });
});
