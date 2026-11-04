import { expect, test } from "@playwright/test";

/** Server edition: an admin changes a client's brand and resets its test data. */
test.describe("server edition: admin tools", () => {
  test("edit a client's brand, then delete its test conversations", async ({ page }) => {
    await page.goto("/sign-in?next=/platform");
    await page.getByRole("button", { name: /James Carter/ }).click();
    await page.waitForURL(/\/platform\/?$/);
    await page.waitForLoadState("networkidle");

    // Brand: the name customers see and the assistant's name.
    await page.goto("/platform/clients/tnt_northline");
    await page.getByRole("button", { name: "Edit brand" }).click();
    const editor = page.getByTestId("brand-editor");
    await editor.getByLabel("Name customers see").fill("Acme Fibre");
    await editor.getByLabel("Assistant name").fill("Acme Helper");
    await editor.getByRole("button", { name: "Save brand" }).click();
    await expect(page.getByText("Saved. New conversations use it straight away.")).toBeVisible();
    await expect(page.getByText("Acme Fibre").first()).toBeVisible();

    // A new conversation greets the customer with the new brand.
    const created = await page.request.post("/api/sessions", { data: { workflowKey: "router-troubleshooting", tenantId: "tnt_northline", scenario: "power_cycle_fix", channel: "secure_link" } });
    expect(created.ok()).toBe(true);
    const { token } = (await created.json()) as { token: string };
    await page.request.post(`/api/assist/${token}/commands`, { data: { command: { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" } } });
    const view = await (await page.request.get(`/api/assist/${token}`)).json();
    expect(view.brandName).toBe("Acme Fibre");
    expect(view.transcript[0]).toMatchObject({ speakerName: "Acme Helper" });
    expect(view.transcript[0].text).toMatch(/^Hi, I'm the Acme Fibre visual assistant/);

    // Put the demo brand back for the other tests.
    const restored = await page.request.put("/api/platform/clients/tnt_northline/brand", { data: { displayName: "X Telecom", primaryColor: "#1D5BD8", supportLine: "0800 046 1100", assistantName: "X Telecom Assistant" } });
    expect(restored.ok()).toBe(true);

    // Reset: every conversation of the client is deleted.
    await page.goto("/platform/settings");
    const reset = page.getByTestId("reset-test-data");
    await reset.getByLabel("Client").selectOption("tnt_northline");
    const button = reset.getByRole("button", { name: "Delete all conversations" });
    await expect(button).toBeDisabled();
    await reset.getByLabel("Type RESET to confirm").fill("RESET");
    await button.click();
    await expect(reset.getByText(/^Deleted \d+ conversations? for X Telecom\.$/)).toBeVisible();
    const after = await (await page.request.get("/api/sessions?tenantId=tnt_northline")).json();
    expect((after.sessions ?? after).filter?.((s: { tenantId: string }) => s.tenantId === "tnt_northline").length ?? 0).toBe(0);
  });
});
