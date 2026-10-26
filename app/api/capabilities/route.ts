import { describeCapabilities } from "@/lib/server/capabilities";

/** What this deployment can do (booleans and provider names only, never secrets). */
export async function GET() {
  return Response.json(describeCapabilities());
}
