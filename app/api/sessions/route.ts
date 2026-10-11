import { getRuntime } from "@/lib/server/runtime";
import { jsonError, readJson, str } from "@/lib/server/http";
import { getScenario } from "@/lib/providers/mock/scenarios";
import type { SessionChannel } from "@/lib/domain/types";
import { demoCustomerLabel } from "@/lib/domain/labels";

const CHANNELS: SessionChannel[] = ["secure_link", "sms", "qr", "website", "contact_centre"];

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenant") ?? undefined;
  return Response.json({ sessions: getRuntime().summaries({ tenantId }) });
}

/** Create a session and return the secure customer link (docs/01 §8.1). */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return jsonError("Invalid JSON body");
  const workflowKey = str(body.workflowKey, 100) ?? undefined;
  const tenantId = str(body.tenantId, 100) ?? undefined;
  const workflowId = workflowKey ? undefined : (str(body.workflowId, 100) ?? "wf_router_v3");
  const channel = (str(body.channel, 40) ?? "secure_link") as SessionChannel;
  if (!CHANNELS.includes(channel)) return jsonError("Unknown channel");
  // "live" runs on the configured model provider; anything else is a simulation scenario.
  const requested = str(body.scenario, 60) ?? undefined;
  const scenario = requested === "live" ? undefined : getScenario(requested).key;
  const customerLabel = str(body.customerLabel, 60) ?? demoCustomerLabel();
  try {
    const { id, token } = getRuntime().create({ workflowId, workflowKey, tenantId, channel, customerLabel, scenario });
    return Response.json({ id, token, customerPath: `/assist/${token}`, consolePath: `/console/sessions/${id}` }, { status: 201 });
  } catch (e) {
    return jsonError((e as Error).message, 422);
  }
}
