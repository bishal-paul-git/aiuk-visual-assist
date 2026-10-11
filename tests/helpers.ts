import { agents, getPolicy, getWorkflow } from "@/lib/config/catalog";
import { SimulationHarness } from "@/lib/simulation/harness";

export function routerHarness(scenario: string) {
  const workflow = getWorkflow("wf_router_v3")!;
  const policy = getPolicy(workflow.policyId)!;
  const agent = agents.find((a) => a.id === "agt_northline_router")!;
  return new SimulationHarness(
    { workflow, policy, agent },
    { id: `ses_test_${scenario}`, reference: "VA-TEST", tenantId: "tnt_northline", scenario, startAt: Date.parse("2026-10-11T10:00:00Z") },
  );
}

export function stepPath(h: SimulationHarness): string[] {
  return h.state.workflow.history.map((x) => x.stepKey);
}

export const AGENT = { type: "human_agent" as const, id: "usr_sarah", name: "Sarah Jennings" };
