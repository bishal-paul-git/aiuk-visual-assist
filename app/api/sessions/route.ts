import { getRuntime } from "@/lib/server/runtime";
import { jsonError, readJson, str } from "@/lib/server/http";
import { getScenario } from "@/lib/providers/mock/scenarios";
import type { SessionChannel } from "@/lib/domain/types";
import { demoCustomerLabel } from "@/lib/domain/labels";
import { BASE_PATH } from "@/lib/paths";
import { parseDeliverTo } from "@/lib/notifications/validate";
import { getNotifications, type DeliveryResult } from "@/lib/server/notifications";
import { requestLogger } from "@/lib/server/log";

const CHANNELS: SessionChannel[] = ["secure_link", "sms", "qr", "website", "contact_centre"];

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenant") ?? undefined;
  return Response.json({ sessions: getRuntime().summaries({ tenantId }) });
}

/**
 * Create a session and return the secure customer link (docs/01 §8.1).
 * Optional `deliverTo: { sms?: "+44…", email?: "…" }` also sends the link
 * through the configured notification providers; each attempt is audited.
 */
export async function POST(request: Request) {
  const logger = requestLogger(request);
  const body = await readJson(request);
  if (!body) return jsonError("Invalid JSON body");
  const workflowKey = str(body.workflowKey, 100) ?? undefined;
  const tenantId = str(body.tenantId, 100) ?? undefined;
  const workflowId = workflowKey ? undefined : (str(body.workflowId, 100) ?? "wf_router_v3");
  const channel = (str(body.channel, 40) ?? "secure_link") as SessionChannel;
  if (!CHANNELS.includes(channel)) return jsonError("Unknown channel");
  const deliverTo = parseDeliverTo(body.deliverTo);
  if (!deliverTo.ok) return jsonError(deliverTo.error);
  // "live" runs on the configured model provider; anything else is a simulation scenario.
  const requested = str(body.scenario, 60) ?? undefined;
  const scenario = requested === "live" ? undefined : getScenario(requested).key;
  const customerLabel = str(body.customerLabel, 60) ?? demoCustomerLabel();

  let created: { id: string; token: string };
  try {
    created = getRuntime().create({ workflowId, workflowKey, tenantId, channel, customerLabel, scenario });
  } catch (e) {
    logger.warn("session.create_rejected", { error: (e as Error).message, workflowKey, workflowId, tenantId });
    return jsonError((e as Error).message, 422);
  }
  const { id, token } = created;
  const customerPath = `/assist/${token}`;
  logger.info("session.created", { sessionId: id, channel, scenario: scenario ?? "live", delivery: deliverTo.value ? Object.keys(deliverTo.value) : [] });

  let delivery: DeliveryResult[] | undefined;
  if (deliverTo.value) {
    const link = `${publicOrigin(request)}${BASE_PATH}${customerPath}`;
    try {
      delivery = await getNotifications().deliverSessionLink(getRuntime(), id, link, deliverTo.value, { type: "system", id: "notifications", name: "Link delivery" });
    } catch (e) {
      // The session exists either way; the agent can still copy the link.
      logger.child({ sessionId: id }).error("notification.delivery_error", { err: e });
      delivery = [];
    }
  }

  return Response.json({ id, token, customerPath, consolePath: `/console/sessions/${id}`, ...(delivery ? { delivery } : {}) }, { status: 201 });
}

/** PUBLIC_BASE_URL wins (correct behind proxies); otherwise the request's own origin. */
function publicOrigin(request: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}
