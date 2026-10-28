import { getRuntime } from "@/lib/server/runtime";
import { CLIENT_REPORT_KINDS, type ClientReportKind } from "@/lib/session/orchestrator";
import { jsonError, readJson, str } from "@/lib/server/http";
import { commandPermission } from "@/lib/auth/rbac";
import { actorFor } from "@/lib/server/auth";
import { authorizeSession } from "@/lib/server/session-access";
import type { Command } from "@/lib/session/orchestrator";
import type { SessionOutcome } from "@/lib/domain/types";
import { requestLogger } from "@/lib/server/log";

const OUTCOMES: SessionOutcome[] = ["resolved_by_human", "escalated_unresolved", "customer_abandoned", "out_of_scope", "failed"];

/** Human agent commands. Only human.* and session.end are accepted here. */
function parse(body: Record<string, unknown>): Command | string {
  const c = body.command as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") return "Missing command";
  switch (c.type) {
    case "human.join":
    case "human.take_over":
    case "human.leave":
      return { type: c.type };
    case "human.message": {
      const text = str(c.text, 1000);
      return text ? { type: c.type, text } : "Invalid text";
    }
    case "human.note": {
      const text = str(c.text, 4000);
      return text ? { type: c.type, text } : "Invalid note";
    }
    case "human.request_capture": {
      const prompt = str(c.prompt, 300);
      return prompt ? { type: c.type, prompt } : "Invalid prompt";
    }
    case "human.review_observation": {
      const observationId = str(c.observationId, 80);
      if (!observationId || (c.verdict !== "confirmed" && c.verdict !== "rejected")) return "Invalid review";
      return { type: c.type, observationId, verdict: c.verdict };
    }
    case "human.run_action": {
      const tool = str(c.tool, 80);
      const params = (c.params ?? {}) as Record<string, unknown>;
      if (!tool || typeof params !== "object") return "Invalid action";
      const clean: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(params)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") clean[k.slice(0, 40)] = typeof v === "string" ? v.slice(0, 200) : v;
      }
      return { type: c.type, tool, params: clean };
    }
    case "human.return_to_ai": {
      const resumeStep = c.resumeStep === undefined ? undefined : str(c.resumeStep, 80);
      if (resumeStep === null) return "Invalid step";
      return { type: c.type, resumeStep };
    }
    case "client.report": {
      const kind = str(c.kind, 40);
      if (!kind || !(CLIENT_REPORT_KINDS as readonly string[]).includes(kind)) return "Unknown report";
      return { type: c.type, kind: kind as ClientReportKind, detail: str(c.detail, 300) ?? undefined };
    }
    case "session.end": {
      const outcome = c.outcome as SessionOutcome | undefined;
      if (outcome && !OUTCOMES.includes(outcome)) return "Invalid outcome";
      return { type: c.type, outcome, reason: str(c.reason, 300) ?? "Ended by agent" };
    }
    default:
      return "Command not permitted for agents";
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return jsonError("Invalid JSON body");
  const command = parse(body);
  if (typeof command === "string") return jsonError(command);
  const rt = getRuntime();
  if (!rt.get(id)) return jsonError("Session not found", 404);
  // The actor is always the signed-in user; any agentId in the body is ignored.
  const access = await authorizeSession(id, commandPermission(command.type)!, { command: command.type });
  if (!access.ok) return access.response;
  const actor = actorFor(access.user);
  const { error } = rt.dispatch(id, command, actor);
  if (error) {
    requestLogger(request, { sessionId: id }).warn("command.rejected", { command: command.type, actorId: actor.id, error });
    return jsonError(error, 409);
  }
  return Response.json({ ok: true });
}
