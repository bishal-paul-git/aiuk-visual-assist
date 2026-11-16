import { expect, test } from "@playwright/test";

/** Server edition: platform staff add a client company without code; its agent can sign in and send a customer link. */
test("add a client, then its agent starts a session for it", async ({ page }) => {
  await page.goto("/sign-in?next=/platform/clients");
  await page.getByRole("button", { name: /James Carter/ }).click();
  await page.waitForURL(/\/platform\/clients\/?$/);

  await page.getByTestId("add-client-open").click();
  await page.getByTestId("client-name").fill("Demo Fibre");
  await page.getByTestId("staff-name-0").fill("Dana Manager");
  await page.getByTestId("staff-email-0").fill("dana@demofibre.example");
  await page.getByTestId("staff-name-1").fill("Eli Agent");
  await page.getByTestId("staff-email-1").fill("eli@demofibre.example");
  await page.getByTestId("add-client-save").click();
  await page.waitForURL(/\/platform\/clients\/tnt_demofibre$/);
  await expect(page.getByRole("heading", { name: "Demo Fibre" }).first()).toBeVisible();

  // Same name twice is refused.
  const dup = await page.request.post("/api/platform/clients", { data: { name: "Demo Fibre", template: "broadband", staff: [{ name: "Zed", email: "zed@x.example" }] } });
  expect(dup.status()).toBe(400);

  // The new agent appears on the demo sign-in and can start a session for their client only.
  await page.request.post("/api/auth/sign-out").catch(() => undefined);
  await page.goto("/sign-in");
  await page.getByRole("button", { name: /Eli Agent/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me.user).toMatchObject({ tenantId: "tnt_demofibre", role: "agent" });
  const created = await page.request.post("/api/sessions", { data: { workflowKey: "router-troubleshooting", tenantId: "tnt_demofibre", channel: "secure_link", customerLabel: "Demo customer" } });
  expect(created.ok(), await created.text()).toBe(true);
  const { customerPath } = (await created.json()) as { customerPath: string };

  // The send-link dialog offers both broadband flows for the new client.
  await page.goto("/console");
  await page.getByRole("button", { name: /Start test session|Send a customer link/ }).first().click();
  await expect(page.getByTestId("launcher-flow").locator("option")).toHaveText(["Router Troubleshooting", "New Router Setup"]);

  // The customer sees the full privacy notice, with this client's name and retention.
  await page.goto(customerPath);
  await page.getByTestId("privacy-open").click();
  await expect(page.getByTestId("privacy-notice")).toContainText("Demo Fibre is responsible");
  await expect(page.getByTestId("privacy-notice")).toContainText("30 days");

  // Client staff cannot add clients.
  const denied = await page.request.post("/api/platform/clients", { data: { name: "Sneaky Co", template: "broadband", staff: [{ name: "Sam", email: "sam@sneaky.example" }] } });
  expect(denied.status()).toBe(403);
});
