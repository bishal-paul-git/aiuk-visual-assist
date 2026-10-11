import { getRuntime } from "@/lib/server/runtime";
import { jsonError, readJson, str } from "@/lib/server/http";
import { getScenario } from "@/lib/providers/mock/scenarios";
import type { SessionChannel } from "@/lib/domain/types";

const CHANNELS: SessionChannel[] = ["secure_link", "sms", "qr", "website", "contact_centre"];

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenant") ?? undefined;
  return Response.json({ sessions: getRuntime().summaries({ tenantId }) });
}

/** Create a session and return the secure customer link (docs/01 §8.1). */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return jsonError("Invalid JSON body");
  const workflowId = str(body.workflowId, 100) ?? "wf_router_v3";
  const channel = (str(body.channel, 40) ?? "secure_link") as SessionChannel;
  if (!CHANNELS.includes(channel)) return jsonError("Unknown channel");
  const scenario = getScenario(str(body.scenario, 60) ?? undefined).key;
  const customerLabel = str(body.customerLabel, 60) ?? `Test customer ${new Date().toISOString().slice(11, 16)}`;
  try {
    const { id, token } = getRuntime().create({ workflowId, channel, customerLabel, scenario });
    return Response.json({ id, token, customerPath: `/assist/${token}`, consolePath: `/console/sessions/${id}` }, { status: 201 });
  } catch (e) {
    return jsonError((e as Error).message, 422);
  }
}
