import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { clipKey, voiceRoleFor, VOICES } from "@/lib/voice/voices";
import { synthesise, voiceIdFor } from "@/lib/server/voice/elevenlabs";

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
    expect(called).toContain(VOICES.agentMale.id);
  });
});
