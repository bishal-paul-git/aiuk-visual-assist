import { describe, expect, it } from "vitest";
import { routerSetupV1 } from "@/lib/config/workflows/router-setup";
import { validateWorkflow } from "@/lib/workflow/engine";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { routerHarness, stepPath } from "./helpers";

const setup = (scenario: string) => routerHarness(scenario, "wf_router_setup_v1");

describe("new router setup workflow", () => {
  it("is valid and published for the demo client", () => {
    expect(validateWorkflow(routerSetupV1).filter((i) => i.severity === "error")).toEqual([]);
    expect(getWorkflowRegistry().latestPublished("tnt_northline", "router-setup")?.id).toBe("wf_router_setup_v1");
  });

  it("happy path: cables, wait, lights, Wi-Fi, resolved by AI", () => {
    const h = setup("power_cycle_fix");
    h.runCustomer();
    expect(stepPath(h)).toEqual(["welcome", "show_router", "guide_connect_cables", "show_cables", "guide_wait", "show_lights", "guide_join_wifi", "confirm_working", "close_case", "resolved"]);
    expect(h.state.session.outcome).toBe("resolved_by_ai");
    expect(h.state.toolActions.find((a) => a.toolName === "update_case")?.status).toBe("completed");
  });

  it("loose cable: guides the fix before waiting", () => {
    const h = setup("loose_cable");
    h.runCustomer();
    expect(stepPath(h)).toContain("guide_reseat_cable");
    expect(stepPath(h).indexOf("guide_reseat_cable")).toBeLessThan(stepPath(h).indexOf("guide_wait"));
  });

  it("line fault: runs the line test and hands over to the network team", () => {
    const h = setup("wan_down");
    h.runCustomer();
    expect(stepPath(h).slice(-2)).toEqual(["run_line_test", "escalate_network"]);
    expect(h.errors).toEqual([]);
  });
});
