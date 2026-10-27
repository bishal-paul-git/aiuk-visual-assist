import { devices, expect, test, type Browser, type Page } from "@playwright/test";

// iPhone 13 metrics and touch input, in the configured (Chromium) browser.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iPhone } = devices["iPhone 13"];
const PHONE = { ...iPhone, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function desktop(browser: Browser, baseURL: string, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ ...devices["Desktop Chrome"], viewport, baseURL });
  return { context, page: await context.newPage() };
}

/** The tester's route in: landing page, Try it now, the pre-filled login, Log in. */
async function logInAsTrialTester(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Solve what you can see/ })).toBeVisible();
  await page.getByRole("link", { name: "Try it now" }).first().click();
  await page.waitForURL(/\/client\/sign-in/);
  // Already filled in: the tester only clicks Log in.
  await expect(page.getByLabel("Email")).toHaveValue("demo@northline.example");
  await expect(page.getByLabel("Password")).not.toHaveValue("");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/client");
  await expect(page.getByRole("heading", { name: "Try Visual Assist" })).toBeVisible();
}

async function expectNoErrorBanner(page: Page) {
  await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
  await expect(page.locator("[role=alert]:not(#__next-route-announcer__)").filter({ hasText: /\S/ })).toHaveCount(0);
}

test.describe("server edition: the client trial, start to finish", () => {
  test("a tester logs in with the ready-made login and plays both sides: customer on a phone, agent on a laptop", async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const laptop = await desktop(browser, baseURL!, { width: 1440, height: 1000 });
    const phoneContext = await browser.newContext({ ...PHONE, baseURL });
    const a = laptop.page;
    const customer = await phoneContext.newPage();

    try {
      await logInAsTrialTester(a);

      // --- Start a conversation -------------------------------------------------
      await expect(a.getByRole("heading", { name: "Start a conversation" })).toBeVisible();
      await a.getByRole("button", { name: "Start the conversation" }).click();
      const coach = a.getByTestId("trial-coach");
      await expect(coach).toHaveAttribute("data-step", "waiting_customer");
      const customerHref = await a.getByRole("link", { name: "Open customer view" }).getAttribute("href");
      const agentHref = await a.getByRole("link", { name: "Open agent screen" }).getAttribute("href");
      expect(customerHref).toMatch(/^\/assist\//);
      expect(agentHref).toMatch(/^\/console\/sessions\//);

      // --- Side 1: the customer, on a phone ---------------------------------------
      await customer.goto(customerHref!);
      await customer.getByRole("button", { name: "Agree and continue" }).click();
      await customer.getByRole("button", { name: /Use demo camera/ }).click();
      const humanHelp = customer.getByRole("button", { name: "Human help" });
      await expect(humanHelp).toBeEnabled({ timeout: 30_000 });
      // The tester's screen noticed the customer arrive.
      await expect(coach).not.toHaveAttribute("data-step", "waiting_customer", { timeout: 30_000 });

      // Typing works, and shows up on the tester's screen as the customer's words.
      const tag = Date.now().toString(36).replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
      const typed = `My internet is down ${tag}`;
      const box = customer.getByLabel("Type a message");
      if (!(await box.isVisible())) await customer.getByRole("button", { name: /Type instead/ }).click();
      await box.fill(typed);
      await customer.getByRole("button", { name: "Send", exact: true }).click();
      await expect(a.getByLabel("Latest messages").getByText(typed)).toBeVisible({ timeout: 30_000 });

      // --- Hand-over: the customer asks for a person --------------------------------
      await humanHelp.click();
      await expect(customer.getByText("Connecting you to a person", { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(coach).toHaveAttribute("data-step", "needs_agent", { timeout: 30_000 });
      await expect(coach.getByText("The customer asked for a person")).toBeVisible();
      // The agent is alerted wherever they are, with a Join button.
      await expect(a.getByTestId("waiting-alert").getByRole("link", { name: "Join now" })).toBeVisible({ timeout: 30_000 });

      // --- Side 2: the human agent, on the laptop -----------------------------------
      const agent = await laptop.context.newPage();
      await agent.goto(agentHref!);
      await expect(agent.getByRole("heading", { name: /Session VA-/ })).toBeVisible();
      await agent.getByRole("button", { name: "Join session" }).first().click();
      await expect(agent.getByRole("button", { name: "Join session" })).toHaveCount(0, { timeout: 15_000 });
      // Joining a customer who asked for a person puts the agent straight in charge.
      await expect(coach).toHaveAttribute("data-step", "agent_in_control", { timeout: 30_000 });
      await expect(agent.getByRole("button", { name: "Take over" })).toHaveCount(0, { timeout: 15_000 });

      // Live video: the customer's camera reaches the agent, and the customer is told.
      await expect(agent.getByTestId("live-video-state")).toHaveText("Live", { timeout: 60_000 });
      await expect.poll(() => agent.getByLabel("Live video of the customer's camera").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(customer.getByText("Agent can see your camera")).toBeVisible();

      await expect(customer.getByText(/is with you/)).toBeVisible({ timeout: 30_000 });

      // Chat both ways. Letters only: long digit runs can be redacted as card numbers.
      const toCustomer = `Hello from the support desk ${tag}`;
      const composer = agent.getByLabel("Message the customer");
      await expect(composer).toBeEnabled({ timeout: 15_000 });
      await composer.fill(toCustomer);
      await agent.getByRole("button", { name: "Send", exact: true }).click();
      await expect(customer.getByText(toCustomer)).toBeVisible({ timeout: 30_000 });
      await expect(a.getByLabel("Latest messages").getByText(toCustomer)).toBeVisible({ timeout: 30_000 });

      const reply = `Thanks that helps ${tag}`;
      const box2 = customer.getByLabel("Type a message");
      if (!(await box2.isVisible())) await customer.getByRole("button", { name: /Type instead/ }).click();
      await box2.fill(reply);
      await customer.getByRole("button", { name: "Send", exact: true }).click();
      await expect(agent.getByText(reply).first()).toBeVisible({ timeout: 30_000 });

      // --- The customer asked for a person, so a person finishes it ------------------------
      // Policy: when the customer asks for a human, control is not handed back to the AI.
      await expect(agent.getByText(/Return to AI unavailable/)).toBeVisible();
      await expect(agent.getByRole("button", { name: "Return to AI" }).first()).toBeDisabled();

      await agent.getByRole("button", { name: "End", exact: true }).first().click();
      await agent.getByRole("menuitem", { name: "Resolved", exact: true }).click();
      await expect(customer.getByRole("heading", { name: "Session ended" })).toBeVisible({ timeout: 30_000 });
      await expect(coach).toHaveAttribute("data-step", "finished", { timeout: 30_000 });

      await expectNoErrorBanner(agent);
      await expectNoErrorBanner(customer);

      // --- The record shows what happened -------------------------------------------------
      await a.getByRole("link", { name: "Open the full record of this conversation" }).click();
      await expect(a.getByText("Conversation", { exact: true })).toBeVisible();
      await expect(a.locator("ol li").getByText(typed)).toBeVisible();
      await expect(a.locator("ol li").getByText(toCustomer)).toBeVisible();
      await expect(a.locator("ol li").getByText(reply)).toBeVisible();
    } finally {
      await laptop.context.close();
      await phoneContext.close();
    }
  });
});

test.describe("server edition: handing back to the AI", () => {
  test("an agent who steps in on their own can hand the customer back to the AI", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const laptop = await desktop(browser, baseURL!, { width: 1440, height: 1000 });
    const phoneContext = await browser.newContext({ ...PHONE, baseURL });
    const a = laptop.page;
    const customer = await phoneContext.newPage();
    try {
      await logInAsTrialTester(a);
      await a.getByRole("button", { name: "Start the conversation" }).click();
      const coach = a.getByTestId("trial-coach");
      await expect(coach).toHaveAttribute("data-step", "waiting_customer");
      const customerHref = await a.getByRole("link", { name: "Open customer view" }).getAttribute("href");
      const agentHref = await a.getByRole("link", { name: "Open agent screen" }).getAttribute("href");

      await customer.goto(customerHref!);
      await customer.getByRole("button", { name: "Agree and continue" }).click();
      await customer.getByRole("button", { name: /Use demo camera/ }).click();
      await expect(customer.getByRole("button", { name: "Human help" })).toBeEnabled({ timeout: 30_000 });

      // The agent steps in without being asked.
      const agent = await laptop.context.newPage();
      await agent.goto(agentHref!);
      await agent.getByRole("button", { name: "Take over" }).first().click();
      await expect(coach).toHaveAttribute("data-step", "agent_in_control", { timeout: 30_000 });
      await expect(customer.getByText(/is with you/)).toBeVisible({ timeout: 30_000 });

      // Nothing forces a person to finish this one, so it can go back to the AI.
      const back = agent.getByRole("button", { name: "Return to AI" }).first();
      await expect(back).toBeEnabled();
      await back.click();
      await expect(coach).not.toHaveAttribute("data-step", "agent_in_control", { timeout: 30_000 });
      await expect(agent.getByRole("button", { name: "Take over" }).first()).toBeVisible({ timeout: 30_000 });
      await expectNoErrorBanner(agent);
    } finally {
      await laptop.context.close();
      await phoneContext.close();
    }
  });
});

test.describe("server edition: client portal access", () => {
  test("a wrong password is refused with a plain message", async ({ browser, baseURL }) => {
    const { context, page } = await desktop(browser, baseURL!);
    await page.goto("/client");
    await expect(page).toHaveURL(/\/client\/sign-in\?next=%2Fclient/);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByText("That email or password isn't right.")).toBeVisible();
    await expect(page).toHaveURL(/\/client\/sign-in/);
    await context.close();
  });

  test("another client cannot see a session, and has nothing to start yet", async ({ browser, baseURL }) => {
    const tom = await desktop(browser, baseURL!);
    await logInAsTrialTester(tom.page);
    const created = await tom.page.request.post("/api/sessions", { data: { workflowKey: "router-troubleshooting", tenantId: "tnt_northline", scenario: "power_cycle_fix" } });
    expect(created.status()).toBe(201);
    const { id } = await created.json();

    const owen = await desktop(browser, baseURL!);
    await owen.page.goto("/client/sign-in");
    await owen.page.getByText("Log in as someone else from your team").click();
    await owen.page.getByRole("button", { name: /Owen Price/ }).click();
    await owen.page.waitForURL((u) => u.pathname === "/client");
    await expect(owen.page.getByTestId("client-name")).toHaveText(/Brightwater/);
    await expect(owen.page.getByText("No published workflow is available to try yet.")).toBeVisible();
    const res = await owen.page.goto(`/client/sessions/${id}`);
    expect(res?.status()).toBe(404);
    await tom.context.close();
    await owen.context.close();
  });

  test("Absolute Intelligence staff can preview a client's portal", async ({ browser, baseURL }) => {
    const { context, page } = await desktop(browser, baseURL!);
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

  test("the landing page and every portal page fit a phone", async ({ browser, baseURL }) => {
    const { context, page } = await desktop(browser, baseURL!, { width: 390, height: 844 });
    for (const path of ["/", "/client/sign-in"]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${path} overflows the phone width`).toBeLessThanOrEqual(0);
    }
    await page.goto("/client/sign-in");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/client");
    for (const path of ["/client", "/client/sessions", "/client/results"]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${path} overflows the phone width`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });
});
