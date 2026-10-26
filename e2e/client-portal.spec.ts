import { expect, test } from "@playwright/test";

/** Static demo: the client portal home, its sign-in and its phone layout. */
test.describe("client portal (static demo)", () => {
  test("the home page guides a trial and starts a session", async ({ page }) => {
    await page.goto("/client/");
    await expect(page.getByRole("heading", { name: /Try Visual Assist with Northline/ })).toBeVisible();
    await expect(page.getByText("Try it in four steps")).toBeVisible();
    await page.getByRole("button", { name: "Start test session" }).click();
    await page.getByRole("button", { name: "Create session" }).click();
    await expect(page.getByText("Session created.")).toBeVisible();
  });

  test("the sign-in lists client staff, not Absolute Intelligence staff", async ({ page }) => {
    await page.goto("/client/sign-in/");
    await expect(page.getByRole("heading", { name: "Client portal" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Tom Hughes/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /James Carter/ })).toHaveCount(0);
    await page.getByRole("button", { name: /Tom Hughes/ }).click();
    await expect(page).toHaveURL(/\/client\/?$/);
  });

  test("every portal page fits a phone", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    for (const path of ["/client/", "/client/sessions/", "/client/results/", "/client/systems/", "/client/sign-in/"]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows the phone width`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });
});
