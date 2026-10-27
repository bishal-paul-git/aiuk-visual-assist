import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { clipKey, FALLBACK_VOICES, voiceRoleFor, VOICES } from "@/lib/voice/voices";
import { resetVoiceFallback, synthesise, voiceCandidates, voiceHealth, voiceIdFor } from "@/lib/server/voice/elevenlabs";
import { systemPrompt } from "@/lib/providers/claude/reasoning";
import { routerTroubleshootingV3 } from "@/lib/config/workflows/router-troubleshooting";

const manifest = JSON.parse(fs.readFileSync("public/voice/manifest.json", "utf8")) as {
  clips: Record<string, { file: string; role: keyof typeof VOICES; text: string }>;
};

describe("voice", () => {
  it("every bundled clip is found by the key the player computes", () => {
    const entries = Object.entries(manifest.clips);
    expect(entries.length).toBeGreaterThan(20);
    for (const [key, clip] of entries) {
      expect(clipKey(clip.role, clip.text)).toBe(key);
      expect(fs.existsSync(`public/voice/${clip.file}`)).toBe(true);
    }
  });

  it("normalises whitespace in keys", () => {
    expect(clipKey("assistant", "  Hello   there ")).toBe(clipKey("assistant", "Hello there"));
    expect(clipKey("assistant", "Hello")).not.toBe(clipKey("agentMale", "Hello"));
  });

  it("gives the assistant and each agent their own British voice", () => {
    expect(voiceRoleFor("ai")).toBe("assistant");
    expect(voiceRoleFor("human_agent", "Sarah Jennings")).toBe("agentFemale");
    expect(voiceRoleFor("human_agent", "Marcus Webb")).toBe("agentMale");
    expect(voiceIdFor("assistant", {})).toBe(VOICES.assistant.id);
    expect(voiceIdFor("assistant", { ELEVENLABS_VOICE_ID: "custom" })).toBe("custom");
  });

  it("uses one voice for the assistant and every agent", () => {
    for (const role of ["assistant", "agentFemale", "agentMale"] as const) expect(voiceIdFor(role, {})).toBe(VOICES.assistant.id);
  });

  it("calls ElevenLabs only when configured", async () => {
    expect(await synthesise("Hi", "assistant", { env: {} })).toMatchObject({ ok: false, status: 404 });
    let called = "";
    const fetchImpl = (async (url: string, init: RequestInit) => {
      called = url;
      expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("k");
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await synthesise("Hi", "agentMale", { env: { ELEVENLABS_API_KEY: "k" }, fetchImpl });
    expect(r.ok).toBe(true);
    expect(called).toContain(VOICES.assistant.id);
  });

  it("tries a stock British voice when the main one is refused, then sticks to it", async () => {
    resetVoiceFallback();
    const tried: string[] = [];
    const fetchImpl = (async (url: string) => {
      tried.push(decodeURIComponent(url.split("/text-to-speech/")[1].split("?")[0]));
      return tried.length === 1 ? new Response(JSON.stringify({ detail: { status: "paid_plan_required" } }), { status: 402 }) : new Response(new Uint8Array([1]), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await synthesise("Hi", "assistant", { env: { ELEVENLABS_API_KEY: "k" }, fetchImpl });
    expect(r).toMatchObject({ ok: true, voiceId: FALLBACK_VOICES.assistant });
    expect(tried).toEqual([VOICES.assistant.id, FALLBACK_VOICES.assistant]);
    expect(voiceHealth()).toMatchObject({ ok: true, usedFallback: true });
    expect(voiceCandidates("agentMale", {})).toEqual([FALLBACK_VOICES.assistant]);
    resetVoiceFallback();
  });

  it("stops on a bad key and reports why", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ detail: { status: "invalid_api_key" } }), { status: 401 });
    }) as unknown as typeof fetch;
    const r = await synthesise("Hi", "agentFemale", { env: { ELEVENLABS_API_KEY: "bad" }, fetchImpl });
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(r.ok === false && r.error).toContain("invalid_api_key");
    expect(calls).toBe(1);
    expect(voiceHealth()).toMatchObject({ ok: false, status: 401 });
  });

  it("lists the chosen voice first, then one stock voice, without repeats", () => {
    expect(voiceCandidates("agentMale", { ELEVENLABS_VOICE_ID: "mine" })).toEqual(["mine", FALLBACK_VOICES.assistant]);
    expect(new Set(voiceCandidates("assistant", {})).size).toBe(voiceCandidates("assistant", {}).length);
  });

  it("puts the workflow's training notes in the AI's instructions", () => {
    const prompt = systemPrompt({ ...routerTroubleshootingV3, aiNotes: ["The grey cable is the broadband cable."] });
    expect(prompt).toContain("British English");
    expect(prompt).toContain("- The grey cable is the broadband cable.");
    expect(systemPrompt({ ...routerTroubleshootingV3, aiNotes: [] })).not.toContain("Notes from this client");
  });
});
