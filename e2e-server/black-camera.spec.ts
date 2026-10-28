import { devices, expect, test, type Page } from "@playwright/test";

/**
 * Server edition: the phone's camera gives only black pictures (covered lens,
 * camera held by another app, a browser not painting the video). Black frames
 * must never be sent to the AI; the session carries on by description, and
 * the record says why. Chrome's fake camera plays an all-black clip.
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

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${process.cwd()}/e2e-server/fixtures/black-camera.y4m`],
  },
});

test.describe("server edition: a camera that only gives a black picture", () => {
  test("black frames are never sent; the AI carries on by description and the record says why", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const agentContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL });
    const customerContext = await browser.newContext({ ...PHONE, baseURL, permissions: ["camera", "microphone"] });
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

      await customer.goto(customerHref!);
      await customer.getByRole("button", { name: "Agree and continue" }).click();
      await customer.getByRole("button", { name: /Turn on camera/ }).click();
      await type(customer, "My broadband isn't working");
      // The camera picture is black: the customer is told, nothing is sent ...
      await expect(customer.getByText(/Your camera is showing a black picture/).first()).toBeVisible({ timeout: 30_000 });
      // ... and after a few seconds the AI carries on by description instead of failing.
      await expect(customer.getByText(/we can do this without the camera/).first()).toBeVisible({ timeout: 30_000 });

      // The session record shows what the device did.
      await a.goto(consoleHref!);
      await a.getByRole("tab", { name: /Audit/ }).click();
      await expect(a.getByText(/camera_black/).first()).toBeVisible({ timeout: 15_000 });
      await expect(a.getByText("Selected evidence")).toBeVisible();
    } finally {
      await agentContext.close();
      await customerContext.close();
    }
  });
});
