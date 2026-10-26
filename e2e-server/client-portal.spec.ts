import { expect, test, type Browser, type Page } from "@playwright/test";
import { devices } from "@playwright/test";

async function newPage(browser: Browser, baseURL: string, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ ...devices["Desktop Chrome"], viewport, baseURL });
  return { context, page: await context.newPage() };
}

async function clientSignIn(page: Page, name: RegExp) {
  await page.goto("/client");
  await expect(page).toHaveURL(/\/client\/sign-in\?next=%2Fclient/);
  await page.getByRole("button", { name }).click();
  await page.waitForURL((u) => u.pathname === "/client");
}

test.describe("server edition: client portal", () => {
  test("a supervisor starts a session and finds it, with its conversation, under Sessions", async ({ browser, baseURL }) => {
    const { context, page } = await newPage(browser, baseURL!);
    await clientSignIn(page, /Tom Hughes/);
    await expect(page.getByRole("heading", { name: /Try Visual Assist with Northline/ })).toBeVisible();
    await expect(page.getByTestId("client-name")).toHaveText(/Northline/);
    await expect(page.getByText("What's switched on")).toBeVisible();

    await page.getByRole("button", { name: "Start test session" }).click();
    await page.getByRole("button", { name: "Create session" }).click();
    await expect(page.getByText("Session created.")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("link", { name: "Sessions", exact: true }).click();
    await page.waitForURL(/\/client\/sessions$/);
    const first = page.getByRole("link", { name: /^VA-/ }).first();
    const reference = (await first.textContent())!.trim();
    await first.click();
    await expect(page.getByRole("heading", { name: reference })).toBeVisible();
    await expect(page.getByText("Conversation", { exact: true })).toBeVisible();
    await expect(page.getByText("What the AI saw", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Results", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
    await context.close();
  });

  test("another client cannot see the session, and has nothing to start yet", async ({ browser, baseURL }) => {
    const tom = await newPage(browser, baseURL!);
    await clientSignIn(tom.page, /Tom Hughes/);
    const created = await tom.page.request.post("/api/sessions", { data: { workflowKey: "router-troubleshooting", tenantId: "tnt_northline", scenario: "power_cycle_fix" } });
    expect(created.status()).toBe(201);
    const { id } = await created.json();

    const owen = await newPage(browser, baseURL!);
    await clientSignIn(owen.page, /Owen Price/);
    await expect(owen.page.getByTestId("client-name")).toHaveText(/Brightwater/);
    await expect(owen.page.getByText("No published workflow is available to try yet.")).toBeVisible();
    const res = await owen.page.goto(`/client/sessions/${id}`);
    expect(res?.status()).toBe(404);
    await owen.page.goto("/client/sessions");
    await expect(owen.page.getByText(id)).toHaveCount(0);
    await tom.context.close();
    await owen.context.close();
  });

  test("Absolute Intelligence staff can preview a client's portal", async ({ browser, baseURL }) => {
    const { context, page } = await newPage(browser, baseURL!);
    await page.goto("/sign-in?next=/client");
    await page.getByRole("button", { name: /James Carter/ }).click();
    await page.waitForURL((u) => u.pathname === "/client");
    await expect(page.getByTestId("portal-preview")).toBeVisible();
    await expect(page.getByTestId("client-name")).toHaveText(/Northline/);
    await page.goto("/client?org=tnt_harbour");
    await expect(page.getByTestId("client-name")).toHaveText(/Harbour/);
    await expect(page.getByRole("link", { name: "Admin portal" })).toBeVisible();
    await context.close();
  });

  test("the client sign-in lists client staff only, and the phone layout fits", async ({ browser, baseURL }) => {
    const { context, page } = await newPage(browser, baseURL!, { width: 390, height: 844 });
    await page.goto("/client/sign-in");
    await expect(page.getByRole("button", { name: /Tom Hughes/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /James Carter/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Nadia Rahman/ })).toHaveCount(0);
    await page.getByRole("button", { name: /Tom Hughes/ }).click();
    await page.waitForURL((u) => u.pathname === "/client");
    for (const path of ["/client", "/client/sessions", "/client/results", "/client/systems"]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows the phone width`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });
});
