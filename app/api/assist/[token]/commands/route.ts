import { resolveCustomer } from "@/lib/server/customer";
import { jsonError, readJson, str } from "@/lib/server/http";
import type { Command } from "@/lib/session/orchestrator";

const QUALITIES = ["good", "fair", "poor", "lost"] as const;

/** Customer commands. Customers can only speak, show, ask for a person, manage media and end. */
function parse(c: Record<string, unknown>): Command | string {
  switch (c.type) {
    case "customer.consent":
      return { type: c.type, accepted: c.accepted === true, noticeVersion: str(c.noticeVersion, 40) ?? "privacy-notice@2" };
    case "customer.utterance": {
      const text = str(c.text, 1000)?.trim();
      if (!text) return "Invalid utterance";
      const confidence = typeof c.confidence === "number" ? Math.max(0, Math.min(1, c.confidence)) : 1;
      return { type: c.type, text, confidence };
    }
    case "customer.request_human":
      return { type: c.type };
    case "media.update": {
      const m = (c.media ?? {}) as Record<string, unknown>;
      const media: Extract<Command, { type: "media.update" }>["media"] = {};
      if (typeof m.camera === "boolean") media.camera = m.camera;
      if (typeof m.microphone === "boolean") media.microphone = m.microphone;
      if (typeof m.quality === "string" && (QUALITIES as readonly string[]).includes(m.quality)) media.quality = m.quality as (typeof QUALITIES)[number];
      if (m.facing === "user" || m.facing === "environment") media.facing = m.facing;
      return { type: c.type, media };
    }
    case "session.end":
      return { type: c.type, reason: "Customer ended the session" };
    default:
      return "Command not permitted";
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await resolveCustomer(params);
  if (!c) return jsonError("This link is invalid or has expired", 404);
  const body = await readJson(request, 20_000);
  if (!body || typeof body.command !== "object" || !body.command) return jsonError("Invalid body");
  const command = parse(body.command as Record<string, unknown>);
  if (typeof command === "string") return jsonError(command);
  const { error } = c.rt.dispatch(c.id, command, c.actor);
  if (error) return jsonError(error, 409);
  return Response.json({ ok: true });
}
