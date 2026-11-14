import { expect, test } from "@playwright/test";

/** Server edition: a live pilot client (Home Telecom): private staff sign-in, customer rating, pilot report. */
test.describe("server edition: pilot client", () => {
  test("client staff sign in with email + client password; picker never lists them", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("client-staff-open").click();
    await expect(page.getByTestId("client-staff-sign-in")).toBeVisible();
    await expect(page.getByText("Home Telecom Agent 1")).toHaveCount(0);

    // The picker API refuses private staff even when called directly.
    const direct = await page.request.post("/api/auth/sign-in", { data: { userId: "usr_ht_agent1" } });
    expect(direct.status()).toBe(401);

    // Wrong password.
    await page.getByTestId("client-staff-email").fill("agent1@hometelecom.pilot");
    await page.getByTestId("client-staff-password").fill("wrong-password-here");
    await page.getByTestId("client-staff-submit").click();
    await expect(page.getByText(/don't match/)).toBeVisible();

    // Right password: lands in the agent console, scoped to Home Telecom.
    await page.getByTestId("client-staff-password").fill("e2e-home-telecom-pass");
    await page.getByTestId("client-staff-submit").click();
    await page.waitForURL(/\/client\/?$/);
    await expect(page.getByTestId("live-service")).toBeVisible();
    const me = await (await page.request.get("/api/auth/me")).json();
    expect(me.user).toMatchObject({ id: "usr_ht_agent1", tenantId: "tnt_hometelecom" });
    const other = await page.request.get("/api/sessions?tenant=tnt_northline");
    expect(other.status()).toBe(403);
  });

  test("customer rates the session; it shows in the pilot report and CSV", async ({ page }) => {
    await page.goto("/sign-in?next=/platform");
    await page.getByRole("button", { name: /James Carter/ }).click();
    await page.waitForURL(/\/platform\/?$/);
    await page.waitForLoadState("networkidle");

    const created = await page.request.post("/api/sessions", { data: { workflowKey: "router-troubleshooting", tenantId: "tnt_hometelecom", channel: "secure_link", customerLabel: "Pilot test customer" } });
    expect(created.ok()).toBe(true);
    const { token } = (await created.json()) as { token: string };
    const cmd = (command: Record<string, unknown>) => page.request.post(`/api/assist/${token}/commands`, { data: { command } });
    expect((await cmd({ type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" })).ok()).toBe(true);
    const view = await (await page.request.get(`/api/assist/${token}`)).json();
    expect(view.brandName).toBe("Home Telecom");
    expect((await cmd({ type: "session.end" })).ok()).toBe(true);

    // The customer's ended screen offers the rating.
    await page.goto(`/assist/${token}`);
    await page.getByTestId("rate-down").click();
    await page.getByTestId("rating-comment").fill("The lights were hard to see");
    await page.getByTestId("rating-send").click();
    await expect(page.getByTestId("rating-thanks")).toBeVisible();
    expect((await cmd({ type: "customer.rating", score: "up" })).status()).toBe(409);

    // Without live AI in tests the session is a guided example, so the report (real sessions only) is empty;
    // counting and the CSV rows are covered by tests/pilot-report.test.ts.
    await page.goto("/client/results?org=tnt_hometelecom");
    await expect(page.getByTestId("download-report")).toBeVisible();
    const csv = await page.request.get("/api/client/report?org=tnt_hometelecom");
    expect(csv.ok()).toBe(true);
    expect(await csv.text()).toContain("Customer rating");
  });
});
