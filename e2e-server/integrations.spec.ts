import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, name: RegExp, next: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name }).click();
  await page.waitForURL((u) => u.pathname.startsWith(next));
}

test.describe("server edition: connect business actions from the platform", () => {
  test("a client admin switches tools to built-in, tests one, and sees an n8n form", async ({ page }) => {
    await signIn(page, /Priya Shah/, "/platform/integrations");
    const panel = page.locator("section", { has: page.getByRole("heading", { name: "Business action connectors" }) });
    await expect(panel.getByText("How should these actions run?")).toBeVisible();

    await panel.getByLabel(/Built-in/).check();
    await panel.getByRole("button", { name: /^Save for \d+ tools?/ }).click();
    await expect(panel.getByText(/^Saved \d+ tools?/)).toBeVisible();

    const ticketRow = panel.getByRole("row", { name: /^Select create_ticket/ });
    await expect(ticketRow.getByText("Built-in", { exact: true })).toBeVisible();
    await ticketRow.getByRole("button", { name: "Test" }).click();
    await expect(ticketRow.getByText("Succeeded via the built-in records")).toBeVisible();
    await expect(ticketRow.getByText(/ref TK-/)).toBeVisible();

    await panel.getByLabel(/Client API or n8n/).check();
    await expect(panel.getByPlaceholder(/webhook\/visual-assist\/actions/)).toBeVisible();
    await expect(panel.getByRole("button", { name: /^Save for/ })).toBeDisabled();

    // Another client's connectors are not on this client admin's page.
    await expect(page.getByText("Brightwater Energy")).toHaveCount(0);
  });

  test("an agent cannot open the platform integrations page", async ({ page }) => {
    await page.goto("/sign-in?next=/console");
    await page.getByRole("button", { name: /Sarah Jennings/ }).click();
    await page.waitForURL(/\/console\/?$/);
    const res = await page.request.put("/api/integrations/connectors", { data: { tenantId: "tnt_northline", tools: ["create_ticket"], mode: "builtin" } });
    expect(res.status()).toBe(403);
  });
});
