import { afterEach, describe, expect, it } from "vitest";
import { agents, getTenant } from "@/lib/config/catalog";
import { applyBrand, validateBrand, withBrand } from "@/lib/config/brand";
import { routerHarness } from "./helpers";

const original = { brand: { ...getTenant("tnt_northline")!.brand }, agent: agents.find((a) => a.tenantId === "tnt_northline")!.name };
afterEach(() => {
  getTenant("tnt_northline")!.brand = { ...original.brand };
  agents.find((a) => a.tenantId === "tnt_northline")!.name = original.agent;
});

describe("client branding", () => {
  it("checks what an admin types", () => {
    expect(validateBrand({ displayName: "A", primaryColor: "#123456" })).toMatch(/2 to 40/);
    expect(validateBrand({ displayName: "Acme Fibre", primaryColor: "blue" })).toMatch(/colour/);
    expect(validateBrand({ displayName: "Acme Fibre", primaryColor: "#12AB34", supportLine: "call us!" })).toMatch(/support line/);
    expect(validateBrand({ displayName: " Acme Fibre ", primaryColor: "#12AB34", supportLine: "0800 123 4567" })).toEqual({ displayName: "Acme Fibre", primaryColor: "#12AB34", supportLine: "0800 123 4567" });
  });

  it("changes the name customers see, the assistant's name and the AI's greeting", () => {
    applyBrand("tnt_northline", { displayName: "Acme Fibre", primaryColor: "#12AB34" });
    expect(getTenant("tnt_northline")!.brand.displayName).toBe("Acme Fibre");
    expect(agents.find((a) => a.tenantId === "tnt_northline")!.name).toBe("Acme Fibre Assistant");
    expect(withBrand("Hi, I'm the {brand} visual assistant.", "tnt_northline")).toBe("Hi, I'm the Acme Fibre visual assistant.");
    const h = routerHarness("power_cycle_fix");
    h.runCustomer({ maxTurns: 1 });
    expect(h.state.transcript[0]).toMatchObject({ speaker: "ai", speakerName: "Acme Fibre Assistant" });
    expect(h.state.transcript[0].text).toMatch(/^Hi, I'm the Acme Fibre visual assistant/);
  });
});
