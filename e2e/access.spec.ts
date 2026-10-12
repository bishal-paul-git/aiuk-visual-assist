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
    // View-only roles are told so up front and never offered the controls.
    await expect(page.getByText("Viewing only.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Take over" })).toHaveCount(0);

    await identity.selectOption("usr_marcus");
    await expect(page.getByText("Viewing only.", { exact: false })).toBeHidden();
    await page.getByRole("button", { name: "Take over" }).click();
    await expect(page.getByRole("button", { name: "Take over" })).toBeHidden();
    await expect(page.getByText("Hi, it's Marcus", { exact: false }).first()).toBeVisible();
  });

  test("roles without platform access are sent to the console; another client's session is refused", async ({ page }) => {
    await page.goto("/sign-in/");
    await page.getByRole("button", { name: /Sarah Jennings/ }).click();
    await page.goto("/platform/");
    await expect(page.getByRole("heading", { name: "The platform is for administrators" })).toBeVisible();
    await page.getByRole("button", { name: "Switch to Platform administrator" }).click();
    await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();

    await page.goto("/sign-in/");
    await page.getByRole("button", { name: /Owen Price/ }).click();
    await page.goto("/console/sessions/ses_a12467/");
    await expect(page.getByRole("heading", { name: "This session belongs to another client" })).toBeVisible();
  });

  test("the static demo shows the all-clients platform view without the server-only audit export", async ({ page }) => {
    await page.goto("/platform/audit/");
    await expect(page.getByTestId("platform-scope")).toHaveText(/All clients/);
    await expect(page.getByRole("heading", { name: "Audit logs" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Export CSV/ })).toHaveCount(0);
  });
});
