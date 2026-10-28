import { devices, expect, test, type Page } from "@playwright/test";

/**
 * Server edition: what a real tester did. The customer, on a phone, chooses
 * voice only (no camera); the AI helps by description; the customer asks for a
 * person; the agent, waiting on the live queue, is alerted, joins from the
 * alert and is in charge at once, and the customer is greeted by name.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iPhone } = devices["iPhone 13"];
const PHONE = { ...iPhone, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function type(customer: Page, text: string) {
  const box = customer.getByLabel("Type a message");
  if (!(await box.isVisible())) await customer.getByRole("button", { name: /Type instead/ }).click();
  await box.fill(text);
  await customer.getByRole("button", { name: "Send", exact: true }).click();
}

test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

test.describe("server edition: no camera, then a person", () => {
  test("voice-only customer is helped by description, asks for a person, and the alerted agent joins in charge", async ({ browser, baseURL }) => {
    const agentContext = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, baseURL, permissions: ["notifications"] });
    const customerContext = await browser.newContext({ ...PHONE, baseURL, permissions: ["microphone"] });
    const a = await agentContext.newPage();
    const customer = await customerContext.newPage();
    try {
      await a.goto("/sign-in?next=/console");
      await a.getByRole("button", { name: /Sarah Jennings/ }).click();
      await a.waitForURL(/\/console\/?$/);
      await a.getByRole("button", { name: "Start test session" }).click();
      const dialog = a.getByRole("dialog", { name: /Router Visual Support/ });
      await dialog.locator('input[name="scenario"][value="wan_down"]').check();
      await dialog.getByRole("button", { name: "Create session" }).click();
      const customerHref = await dialog.getByRole("link", { name: "Open customer view" }).getAttribute("href");
      const consoleHref = await dialog.getByRole("link", { name: "Open in agent console" }).getAttribute("href");
      await dialog.getByRole("button", { name: "Close" }).click();

      // The agent switches alerts on and waits on the live queue.
      await a.getByRole("button", { name: "Turn on waiting-customer sound" }).click();
      await expect(a.getByRole("button", { name: "Turn off waiting-customer sound" })).toBeVisible();

      // --- Customer: voice only, no camera ----------------------------------------
      await customer.goto(customerHref!);
      await customer.getByRole("button", { name: "Agree and continue" }).click();
      await customer.getByRole("button", { name: "Continue with voice only" }).click();
      await expect(customer.getByRole("img", { name: /virtual assistant/ }).first()).toBeVisible({ timeout: 30_000 });
      await expect(customer.getByText(/Your camera is off. That's fine/)).toBeVisible();

      await type(customer, "My broadband isn't working");
      // No picture is asked for: the AI asks for a description instead.
      await expect(customer.getByText(/we can do this without the camera/).first()).toBeVisible({ timeout: 30_000 });
      await type(customer, "The internet light is yellow");
      await expect(customer.getByText(/find the grey or green cable/).first()).toBeVisible({ timeout: 30_000 });

      // --- The customer asks for a person -------------------------------------------
      await customer.getByRole("button", { name: "Human help" }).click();
      await expect(customer.getByText("Connecting you to a person", { exact: true })).toBeVisible({ timeout: 30_000 });

      // --- The agent is alerted, joins from the alert, and is in charge -----------------
      const alert = a.getByTestId("waiting-alert");
      await expect(alert).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => a.title(), { timeout: 10_000 }).toMatch(/Customer waiting/);
      // The newest customer is the one offered (the test server also has older sample sessions waiting).
      await alert.getByRole("link", { name: "Join now" }).click();
      await a.waitForURL((u) => u.pathname === consoleHref);
      await expect(a.getByRole("heading", { name: /Session VA-/ })).toBeVisible();
      const ref = (await a.getByRole("heading", { name: /Session VA-/ }).textContent())!.match(/VA-[\w-]+/)![0];
      // Not alerted about the customer already open.
      await expect(a.getByTestId("waiting-alert").filter({ hasText: ref })).toHaveCount(0);
      await a.getByRole("button", { name: "Join session" }).first().click();
      await expect(a.getByRole("button", { name: "Take over" })).toHaveCount(0, { timeout: 15_000 });

      // The customer is greeted by the person, sees them, and the AI is out of the way.
      await expect(customer.getByText(/Hi, it's Sarah from the support team/).first()).toBeVisible({ timeout: 30_000 });
      await expect(customer.getByRole("img", { name: /Sarah Jennings, support team/ }).first()).toBeVisible();
      await expect(customer.getByRole("button", { name: "Human joined" })).toBeVisible();

      // With the camera off, customer and agent are put on a two-way voice call.
      await expect(a.getByTestId("voice-call")).toBeVisible({ timeout: 45_000 });
      await expect(a.getByTestId("live-video-state")).toHaveText("Live");
      await expect(customer.getByText(/On a call with Sarah Jennings/)).toBeVisible({ timeout: 30_000 });

      // Chat reaches the customer.
      const composer = a.getByLabel("Message the customer");
      await expect(composer).toBeEnabled({ timeout: 15_000 });
      await composer.fill("Thanks, I can see the light is amber. Let me check your line.");
      await a.getByRole("button", { name: "Send", exact: true }).click();
      await expect(customer.getByText("Let me check your line").first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await agentContext.close();
      await customerContext.close();
    }
  });
});
