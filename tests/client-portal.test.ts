import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";

/**
 * The client portal in the server edition: every page authorises its own data,
 * confines the user to their client, and refuses to reveal another client's
 * sessions.
 */
const jar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "va_session" && jar.token ? { name, value: jar.token } : undefined) }),
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => undefined }));

type Search = { searchParams: Promise<{ org?: string }> };
type Page = (props: Search) => Promise<unknown>;
type DetailPage = (props: Search & { params: Promise<{ id: string }> }) => Promise<unknown>;

let signIn: (userId?: string) => void;
let clientScope: typeof import("@/lib/server/client-data").clientScope;
let testableWorkflow: typeof import("@/lib/server/client-data").testableWorkflow;
let clientReadiness: typeof import("@/lib/server/client-readiness").clientReadiness;
let getRuntime: typeof import("@/lib/server/runtime").getRuntime;
const pages: Record<string, Page> = {};
let Detail: DetailPage;

const search = (org?: string): Search => ({ searchParams: Promise.resolve(org ? { org } : {}) });

async function expectNotFound(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ digest: expect.stringContaining("404") });
}

beforeAll(async () => {
  process.env.AUTH_SECRET = "client-portal-test-secret-0123456789abcdef";
  const token = await import("@/lib/auth/session-token");
  const auth = await import("@/lib/server/auth");
  signIn = (userId) => {
    jar.token = userId ? token.signSession(token.newSessionClaims(userId, "demo"), auth.authSecret()) : undefined;
  };
  ({ clientScope, testableWorkflow } = await import("@/lib/server/client-data"));
  ({ clientReadiness } = await import("@/lib/server/client-readiness"));
  ({ getRuntime } = await import("@/lib/server/runtime"));
  pages.home = (await import("@/app/client/page")).default as Page;
  pages.sessions = (await import("@/app/client/sessions/page")).default as Page;
  pages.results = (await import("@/app/client/results/page")).default as Page;
  pages.systems = (await import("@/app/client/systems/page")).default as Page;
  Detail = (await import("@/app/client/sessions/[id]/page")).default as DetailPage;
});

beforeEach(() => signIn(undefined));

describe("clientScope", () => {
  it("confines each user to their own client, whatever the URL asks for", async () => {
    signIn("usr_priya");
    expect((await clientScope("/client")).tenant.id).toBe("tnt_northline");
    signIn("usr_owen");
    const owen = await clientScope("/client", "tnt_northline");
    expect(owen.tenant.id).toBe("tnt_brightwater");
    expect(owen.previewing).toBe(false);
    expect(owen.states().every((s) => s.session.tenantId === "tnt_brightwater")).toBe(true);
  });

  it("lets platform staff preview any client, defaulting to Northline", async () => {
    signIn("usr_james");
    const def = await clientScope("/client");
    expect(def.tenant.id).toBe("tnt_northline");
    expect(def.previewing).toBe(true);
    expect((await clientScope("/client", "tnt_harbour")).tenant.id).toBe("tnt_harbour");
    expect((await clientScope("/client", "not_a_client")).tenant.id).toBe("tnt_northline");
  });

  it("sends a signed-out visitor to the client sign-in", async () => {
    await expect(clientScope("/client/results")).rejects.toMatchObject({ digest: expect.stringContaining("/client/sign-in?next=%2Fclient%2Fresults") });
  });

  it("offers each role only what it may do", async () => {
    signIn("usr_tom");
    const tom = await clientScope("/client");
    expect(tom.allows("session.create") && tom.allows("session.take_over")).toBe(true);
    expect(tom.allows("settings.edit")).toBe(false);
    signIn("usr_priya");
    const priya = await clientScope("/client");
    expect(priya.allows("session.create")).toBe(false);
    expect(priya.allows("settings.edit")).toBe(true);
  });
});

describe("client pages", () => {
  it("render for client staff and for an admin preview", async () => {
    for (const user of ["usr_tom", "usr_sarah", "usr_priya", "usr_james"]) {
      signIn(user);
      for (const [name, page] of Object.entries(pages)) expect(isValidElement(await page(search())), `${name} as ${user}`).toBe(true);
    }
  });

  it("send a signed-out visitor to the client sign-in instead of rendering", async () => {
    for (const page of Object.values(pages)) await expect(page(search())).rejects.toMatchObject({ digest: expect.stringContaining("/client/sign-in") });
  });

  it("show only the client's own sessions and report another client's session as not found", async () => {
    // Northline is the only client with a published workflow, so its sessions are the ones to hide from others.
    const { id } = getRuntime().create({ workflowKey: "router-troubleshooting", tenantId: "tnt_northline", channel: "secure_link", customerLabel: "Portal test", scenario: "power_cycle_fix" });
    const detail = (org?: string) => Detail({ ...search(org), params: Promise.resolve({ id }) });
    signIn("usr_priya");
    expect(isValidElement(await detail())).toBe(true);
    signIn("usr_owen");
    await expectNotFound(detail());
    await expectNotFound(detail("tnt_northline"));
    // Platform staff see the client they chose.
    signIn("usr_james");
    expect(isValidElement(await detail())).toBe(true);
    await expectNotFound(detail("tnt_brightwater"));
    // Another client's list never contains it.
    signIn("usr_owen");
    expect((await clientScope("/client/sessions")).summaries().some((s) => s.id === id)).toBe(false);
  });
});

describe("what a client can try", () => {
  it("offers a client only a published workflow, with scenarios only for the router workflow", () => {
    expect(testableWorkflow("tnt_northline")).toMatchObject({ key: "router-troubleshooting", scenarios: true });
    // Brightwater's and Harbour's workflows are still in review or draft: nothing to try yet.
    expect(testableWorkflow("tnt_brightwater")).toBeUndefined();
    expect(testableWorkflow("tnt_harbour")).toBeUndefined();
    expect(testableWorkflow("nobody")).toBeUndefined();
  });

  it("reports what is switched on in plain words, without provider names or secrets", () => {
    const items = clientReadiness("tnt_northline");
    expect(items.map((i) => i.label)).toEqual(expect.arrayContaining(["AI that reads photos", "Voice", "Text-message links", "Business actions"]));
    const text = JSON.stringify(items);
    expect(text).not.toMatch(/anthropic|claude|elevenlabs|twilio|deepgram|secret/i);
  });
});
