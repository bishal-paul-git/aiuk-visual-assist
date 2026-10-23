import { STATIC_EXPORT } from "@/lib/server/platform-data";

/**
 * What kind of environment this is, for the header chip: the public demo
 * (sample data, simulated AI), a server with sample sessions, or a
 * real-testing server (SEED_SAMPLE_SESSIONS=0) whose reports hold only real
 * test sessions. Read per request, so hosting settings apply without a rebuild.
 */
export function environmentInfo(env: Record<string, string | undefined> = process.env): { kind: "demo" | "sample" | "testing"; label: string; title: string } {
  if (STATIC_EXPORT) return { kind: "demo", label: "Demo environment · sample data", title: "Reports show sample data. New demo sessions run in your browser and appear in the console." };
  const liveAi = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  if (env.SEED_SAMPLE_SESSIONS === "0")
    return {
      kind: "testing",
      label: liveAi ? "Testing environment · real AI" : "Testing environment",
      title: "Real test sessions only, no sample data. Use test customers, not real customer data, until the pilot is approved.",
    };
  return { kind: "sample", label: "Sample data", title: liveAi ? "Reports include generated sample sessions. Live AI is available for new sessions." : "Reports include generated sample sessions. AI responses are simulated." };
}
