import type { ToolAction } from "@/lib/domain/types";
import type { ToolExecutor } from "@/lib/providers/types";
import { getScenario } from "./scenarios";

/**
 * Sandbox tool executor. Mirrors the shape of the client integrations listed
 * in the catalog so the workflow engine can be exercised without production
 * systems. Results are deterministic per session + scenario.
 */
export function simulateTool(action: ToolAction, scenario?: string): Record<string, unknown> {
  const sc = getScenario(scenario);
  const ref = shortRef(action.sessionId);
  switch (action.toolName) {
    case "line_test":
      if (sc.lineTest === "error") throw new Error("Line diagnostics API returned 503");
      return sc.lineTest === "fault_detected"
        ? { status: "fault_detected", detail: "loss of sync at street cabinet", testId: `LT-${ref}` }
        : { status: "no_fault", detail: "line in sync, 67/18 Mbps", testId: `LT-${ref}` };
    case "update_case":
      return { caseId: `CS-${ref}`, status: String(action.request.status ?? "updated") };
    case "create_ticket":
      return { ticketId: `TK-${ref}`, queue: "network_l2" };
    case "book_engineer":
      return { jobId: `JOB-${ref}`, slot: "Tue 14 Oct, 08:00–13:00" };
    case "send_sms_summary":
      return { messageId: `SMS-${ref}`, delivered: true };
    case "order_replacement_router":
      return { orderId: `ORD-${ref}`, dispatch: "next working day" };
    case "issue_account_credit":
      return { creditId: `CR-${ref}`, amount: String(action.request.amount ?? "0") };
    default:
      return { ok: true };
  }
}

export class MockToolExecutor implements ToolExecutor {
  readonly id = "sandbox-tools";
  constructor(private readonly latencyMs: Record<string, number> = { line_test: 2600, default: 700 }) {}

  async execute(action: ToolAction, ctx: { tenantId: string; scenario?: string }): Promise<Record<string, unknown>> {
    const ms = this.latencyMs[action.toolName] ?? this.latencyMs.default ?? 0;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    return simulateTool(action, ctx.scenario);
  }
}

function shortRef(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String(h % 1_000_000).padStart(6, "0");
}
