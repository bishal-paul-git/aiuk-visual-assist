import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";

/**
 * Page-level tenant scoping in the server edition: platform pages are called
 * directly as server components with a signed session cookie.
 */
const jar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "va_session" && jar.token ? { name, value: jar.token } : undefined) }),
}));
// Outside a request there is nothing to wait for.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => undefined }));

type Page = (props: { params: Promise<{ id: string }> }) => Promise<unknown>;

let signIn: (userId?: string) => void;
let platformScope: typeof import("@/lib/server/platform-data").platformScope;
let SessionDetailPage: Page;
let ClientDetailPage: Page;
let WorkflowDetailPage: Page;

/** notFound() throws an error whose digest marks a 404. */
async function expectNotFound(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ digest: expect.stringContaining("404") });
}

beforeAll(async () => {
  process.env.AUTH_SECRET = "platform-scope-test-secret-0123456789abcd";
  const token = await import("@/lib/auth/session-token");
  const auth = await import("@/lib/server/auth");
  signIn = (userId) => {
    jar.token = userId ? token.signSession(token.newSessionClaims(userId, "demo"), auth.authSecret()) : undefined;
  };
  ({ platformScope } = await import("@/lib/server/platform-data"));
  SessionDetailPage = (await import("@/app/platform/sessions/[id]/page")).default as Page;
  ClientDetailPage = (await import("@/app/platform/clients/[id]/page")).default as Page;
  WorkflowDetailPage = (await import("@/app/platform/workflows/[id]/page")).default as Page;
});

beforeEach(() => signIn(undefined));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("platformScope", () => {
  it("confines a client admin to their tenant and leaves platform roles unscoped", async () => {
    signIn("usr_priya");
    const p = await platformScope();
    expect(p.tenantId).toBe("tnt_northline");
    expect(p.label).toBe("Northline Broadband");
    expect(p.allClients).toBe(false);
    expect(p.summaries().every((s) => s.tenantId === "tnt_northline")).toBe(true);

    signIn("usr_owen");
    const o = await platformScope();
    expect(o.tenantId).toBe("tnt_brightwater");
    // Every seeded session belongs to Northline, so Brightwater sees none of them.
    expect(o.summaries()).toEqual([]);
    expect(o.states()).toEqual([]);

    signIn("usr_james");
    const j = await platformScope();
    expect(j.tenantId).toBeUndefined();
    expect(j.label).toBe("All clients");
    expect(j.summaries().length).toBeGreaterThan(0);
  });

  it("redirects users without platform access to sign-in", async () => {
    signIn("usr_sarah"); // agent
    await expect(platformScope()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });
});

describe("detail pages for another client are not found (no 403 leak)", () => {
  it("session detail", async () => {
    signIn("usr_owen");
    await expectNotFound(SessionDetailPage(params("ses_a12467")));
    signIn("usr_priya");
    expect(isValidElement(await SessionDetailPage(params("ses_a12467")))).toBe(true);
  });

  it("client detail", async () => {
    signIn("usr_priya");
    await expectNotFound(ClientDetailPage(params("tnt_brightwater")));
    expect(isValidElement(await ClientDetailPage(params("tnt_northline")))).toBe(true);
    signIn("usr_james");
    expect(isValidElement(await ClientDetailPage(params("tnt_brightwater")))).toBe(true);
  });

  it("workflow detail", async () => {
    signIn("usr_owen");
    await expectNotFound(WorkflowDetailPage(params("wf_router_v3")));
    expect(isValidElement(await WorkflowDetailPage(params("wf_boiler_v1")))).toBe(true);
  });
});
