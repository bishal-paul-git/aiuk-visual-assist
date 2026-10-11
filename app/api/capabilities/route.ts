import { getRuntime } from "@/lib/server/runtime";

/** What this deployment can do — lets the UI offer live AI only when it is configured. */
export async function GET() {
  const live = getRuntime().liveReasoning;
  return Response.json({ liveReasoning: live.available, model: live.model ?? null });
}
