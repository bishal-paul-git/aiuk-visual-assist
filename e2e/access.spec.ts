import { expect, test } from "@playwright/test";

/**
 * Static demo: demo sign-in and role switching. The in-browser runtime applies
 * the same permission rules as the server edition.
 */
test.describe("demo identity and permissions", () => {
  test("a read-only QA reviewer cannot take over a session; an agent can", async ({ page }) => {
    await page.goto("/sign-in/");
    await expect(page.getByRole("heading", { name: "Sign in to Visual Assist" })).toBeVisible();
    await page.getByRole("button", { name: /Nadia Rahman/ }).click();
    await expect(page).toHaveURL(/\/platform\/?$/);

    await page.goto("/console/sessions/ses_a12467/");
    const identity = page.getByLabel("Demo identity");
    await expect(identity).toHaveValue("usr_nadia");
    await page.getByRole("button", { name: "Take over" }).click();
    await expect(page.getByText("Your role (QA reviewer (read-only)) does not allow this", { exact: false })).toBeVisible();

    await identity.selectOption("usr_marcus");
    await page.getByRole("button", { name: "Dismiss" }).click();
    await page.getByRole("button", { name: "Take over" }).click();
    await expect(page.getByRole("button", { name: "Take over" })).toBeHidden();
    await expect(page.getByText("Hi, it's Marcus", { exact: false }).first()).toBeVisible();
  });
});
