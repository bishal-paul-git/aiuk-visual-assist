import type { ToolAction, ToolCallOutcome } from "@/lib/domain/types";
import type { ToolExecutor } from "@/lib/providers/types";
import { ToolCallError } from "./contract";

/**
 * Built-in business actions: the platform itself is the system of record, so
 * a tenant can run real tickets, case updates and bookings before any client
 * system is connected. Each call creates a reference that is stored with the
 * session (tool action result + audit) and listed on Platform → Integrations.
 *
 * line_test and send_sms_summary are not offered: a line test needs the
 * client's network diagnostics, and the platform does not keep the customer's
 * phone number after sending the link.
 */

export const BUILTIN_TOOLS = ["create_ticket", "update_case", "book_engineer", "order_replacement_router", "issue_account_credit", "attach_claim_evidence"] as const;

export function isBuiltinTool(tool: string): boolean {
  return (BUILTIN_TOOLS as readonly string[]).includes(tool);
}

/** Short, stable reference from the action id (the same action always gets the same reference). */
function ref(prefix: string, actionId: string): string {
  return `${prefix}-${actionId.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase()}`;
}

/** Next weekday morning, in UK time, e.g. "Mon 26 Oct, 08:00–13:00". */
export function nextEngineerSlot(now: number): string {
  const d = new Date(now + 24 * 3600 * 1000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  return `${day}, 08:00–13:00`;
}

/** The result and reference a built-in tool returns. Throws for tools that cannot run built-in. */
export function builtinResult(action: Pick<ToolAction, "id" | "toolName" | "request">, now: number): { result: Record<string, unknown>; externalRef: string } {
  const p = action.request ?? {};
  switch (action.toolName) {
    case "create_ticket": {
      const r = ref("TK", action.id);
      return { result: { ticketId: r, queue: String(p.queue ?? "network_l2") }, externalRef: r };
    }
    case "update_case": {
      const r = ref("CS", action.id);
      return { result: { caseId: r, status: String(p.status ?? "updated") }, externalRef: r };
    }
    case "book_engineer": {
      const r = ref("JOB", action.id);
      return { result: { jobId: r, slot: nextEngineerSlot(now) }, externalRef: r };
    }
    case "order_replacement_router": {
      const r = ref("ORD", action.id);
      return { result: { orderId: r, dispatch: "next working day" }, externalRef: r };
    }
    case "issue_account_credit": {
      const r = ref("CR", action.id);
      return { result: { creditId: r, amount: String(p.amount ?? "0") }, externalRef: r };
    }
    case "attach_claim_evidence": {
      const r = ref("CLM", action.id);
      return { result: { claimId: r, attachmentId: ref("ATT", action.id) }, externalRef: r };
    }
    default:
      throw new Error(`${action.toolName} cannot run as a built-in action`);
  }
}

export class BuiltinToolExecutor implements ToolExecutor {
  readonly id = "visual-assist";
  constructor(private readonly now: () => number = Date.now) {}

  async execute(action: ToolAction): Promise<Record<string, unknown>> {
    return (await this.executeWithOutcome(action)).result;
  }

  async executeWithOutcome(action: ToolAction): Promise<{ result: Record<string, unknown>; outcome: ToolCallOutcome }> {
    const started = this.now();
    const base = { provider: this.id, mode: "builtin" as const, attempts: 1 };
    try {
      const { result, externalRef } = builtinResult(action, started);
      return { result, outcome: { ...base, status: "succeeded", latencyMs: this.now() - started, externalRef } };
    } catch (e) {
      throw new ToolCallError((e as Error).message, { ...base, status: "failed", latencyMs: this.now() - started, errorCode: "unsupported_tool" });
    }
  }
}
