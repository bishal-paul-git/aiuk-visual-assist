import { expect, test } from "@playwright/test";

/**
 * Live video (WebRTC) between the customer and the human agent, in the static
 * demo: signalling over BroadcastChannel between the two iframes, media from
 * Chromium's fake camera and microphone.
 */
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["camera", "microphone"],
});

test.describe("live video", () => {
  test("the agent reaches Live once they join and the customer's camera is on", async ({ page }) => {
    await page.goto("/demo/");
    await page.getByRole("button", { name: "Try it yourself" }).click();

    const customer = page.frameLocator('iframe[title="Customer view"]');
    await customer.getByRole("button", { name: "Agree and continue" }).click();
    await customer.getByRole("button", { name: "Turn on camera" }).click();
    await expect(customer.getByRole("button", { name: "Camera off" })).toBeVisible({ timeout: 30_000 });

    const agent = page.frameLocator('iframe[title="Agent console"]');
    // No call before a human agent is present.
    await expect(agent.getByTestId("live-video-state")).toHaveCount(0);
    await agent.getByRole("button", { name: "Join session" }).first().click();

    await expect(agent.getByTestId("live-video-state")).toHaveText("Live", { timeout: 45_000 });
    await expect(agent.getByLabel("Live video of the customer's camera")).toBeVisible();
    await expect(customer.getByText("Agent can see your camera")).toBeVisible();

    // The picture is really flowing, not just negotiated.
    await expect
      .poll(() => agent.getByLabel("Live video of the customer's camera").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 })
      .toBeGreaterThan(0);

    // Ending the session ends the call.
    await agent.getByRole("button", { name: "End", exact: true }).first().click();
    await agent.getByRole("menuitem", { name: "Resolved", exact: true }).click();
    await expect(agent.getByTestId("live-video-state")).toHaveCount(0, { timeout: 15_000 });
    await expect(agent.getByLabel("Live video of the customer's camera")).toHaveCount(0);
  });
});
