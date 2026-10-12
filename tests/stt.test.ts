import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDeepgramStt, DEEPGRAM_STT_URL, parseDeepgram } from "@/lib/server/voice/deepgram";
import { createElevenLabsStt, ELEVENLABS_STT_URL, parseScribe } from "@/lib/server/voice/elevenlabs-stt";
import { selectSttProvider, sttProviderName } from "@/lib/server/voice/select-stt";
import {
  billableSeconds,
  cleanTranscript,
  createRateLimiter,
  crossOrigin,
  MAX_AUDIO_BYTES,
  normaliseAudioType,
  readBodyCapped,
  sniffAudio,
  validateClipBody,
  validateClipHeaders,
} from "@/lib/server/voice/stt-request";
import { DEFAULT_USD_TO_GBP, speechToTextCost, STT_PRICES_USD_PER_MINUTE } from "@/lib/domain/pricing";
import { getRuntime } from "@/lib/server/runtime";
import { setLogSink } from "@/lib/server/log";
import { POST } from "@/app/api/assist/[token]/stt/route";

type Call = { url: string; init: RequestInit };

function mockFetch(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** A clip with the given container signature, padded to `size` bytes. */
function clip(kind: "webm" | "mp4" | "ogg" | "junk", size = 2000): Uint8Array {
  const b = new Uint8Array(size);
  if (kind === "webm") b.set([0x1a, 0x45, 0xdf, 0xa3]);
  if (kind === "ogg") b.set([0x4f, 0x67, 0x67, 0x53]);
  if (kind === "mp4") b.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
  return b;
}

const DEEPGRAM_OK = {
  metadata: { duration: 2.4 },
  results: { channels: [{ alternatives: [{ transcript: "The internet light is off.", confidence: 0.97 }] }] },
};

describe("Deepgram adapter", () => {
  it("posts the raw clip with a Token header to Nova-3 en-GB and reads text, confidence and duration", async () => {
    const { fetchImpl, calls } = mockFetch(DEEPGRAM_OK);
    const r = await createDeepgramStt("dg-key", fetchImpl).transcribe(clip("mp4"), "audio/mp4");
    expect(r).toEqual({ ok: true, transcription: { text: "The internet light is off.", confidence: 0.97, durationSeconds: 2.4 } });
    expect(calls[0].url).toBe(DEEPGRAM_STT_URL);
    expect(calls[0].url).toContain("model=nova-3");
    expect(calls[0].url).toContain("language=en-GB");
    expect(calls[0].url).toContain("smart_format=true");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Token dg-key");
    expect(headers["Content-Type"]).toBe("audio/mp4");
    expect((calls[0].init.body as Uint8Array).length).toBe(2000);
  });

  it("maps provider failures to 502 without echoing the provider body", async () => {
    const { fetchImpl } = mockFetch({ err_msg: "secret detail" }, 401);
    const r = await createDeepgramStt("bad", fetchImpl).transcribe(clip("webm"), "audio/webm");
    expect(r).toEqual({ ok: false, status: 502, error: "Speech provider error (401)" });
  });

  it("reports a timeout or network failure as 504", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("aborted");
    }) as unknown as typeof fetch;
    expect(await createDeepgramStt("k", fetchImpl).transcribe(clip("webm"), "audio/webm")).toMatchObject({ ok: false, status: 504 });
  });

  it("tolerates empty results", () => {
    expect(parseDeepgram({})).toEqual({ text: "", confidence: undefined, durationSeconds: undefined });
  });
});

describe("ElevenLabs Scribe adapter", () => {
  const scribe = {
    text: " Yes, it's working now ",
    language_code: "eng",
    words: [
      { text: "Yes,", type: "word", start: 0.1, end: 0.4, logprob: Math.log(0.9) },
      { text: " ", type: "spacing", start: 0.4, end: 0.5 },
      { text: "it's", type: "word", start: 0.5, end: 0.8, logprob: Math.log(0.7) },
      { text: "working", type: "word", start: 0.8, end: 1.2, logprob: Math.log(0.8) },
      { text: "now", type: "word", start: 1.2, end: 1.6, logprob: Math.log(0.8) },
    ],
  };

  it("posts multipart with scribe_v1, language en and the xi-api-key header", async () => {
    const { fetchImpl, calls } = mockFetch(scribe);
    const r = await createElevenLabsStt("el-key", fetchImpl).transcribe(clip("webm"), "audio/webm");
    expect(calls[0].url).toBe(ELEVENLABS_STT_URL);
    expect((calls[0].init.headers as Record<string, string>)["xi-api-key"]).toBe("el-key");
    const form = calls[0].init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v1");
    expect(form.get("language_code")).toBe("en");
    const file = form.get("file") as File;
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(2000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transcription.text).toBe("Yes, it's working now");
    expect(r.transcription.confidence).toBeCloseTo(0.8, 6);
    expect(r.transcription.durationSeconds).toBe(1.6);
  });

  it("names iOS recordings as m4a", async () => {
    const { fetchImpl, calls } = mockFetch(scribe);
    await createElevenLabsStt("k", fetchImpl).transcribe(clip("mp4"), "audio/mp4");
    expect(((calls[0].init.body as FormData).get("file") as File).name).toBe("utterance.m4a");
  });

  it("leaves confidence unset when no word probabilities are given", () => {
    expect(parseScribe({ text: "Hello" })).toEqual({ text: "Hello", confidence: undefined, durationSeconds: undefined });
  });

  it("maps provider failures to 502", async () => {
    const { fetchImpl } = mockFetch({ detail: "quota" }, 429);
    expect(await createElevenLabsStt("k", fetchImpl).transcribe(clip("webm"), "audio/webm")).toEqual({ ok: false, status: 502, error: "Speech provider error (429)" });
  });
});

describe("provider selection", () => {
  it("is off unless STT_PROVIDER names a provider that has its key", () => {
    expect(sttProviderName({})).toBeNull();
    expect(sttProviderName({ ELEVENLABS_API_KEY: "k" })).toBeNull(); // TTS key alone does not turn STT on
    expect(sttProviderName({ STT_PROVIDER: "deepgram" })).toBeNull();
    expect(sttProviderName({ STT_PROVIDER: "elevenlabs", DEEPGRAM_API_KEY: "k" })).toBeNull();
    expect(sttProviderName({ STT_PROVIDER: "whisper", ELEVENLABS_API_KEY: "k" })).toBeNull();
    expect(sttProviderName({ STT_PROVIDER: " Deepgram ", DEEPGRAM_API_KEY: "k" })).toBe("deepgram");
    expect(sttProviderName({ STT_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "k" })).toBe("elevenlabs");
  });

  it("builds the matching adapter, with a priced cost id", () => {
    expect(selectSttProvider({ env: {} })).toBeNull();
    const el = selectSttProvider({ env: { STT_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "k" } })!;
    const dg = selectSttProvider({ env: { STT_PROVIDER: "deepgram", DEEPGRAM_API_KEY: "k" } })!;
    expect([el.name, dg.name]).toEqual(["elevenlabs", "deepgram"]);
    expect(STT_PRICES_USD_PER_MINUTE[el.id]).toBeGreaterThan(0);
    expect(STT_PRICES_USD_PER_MINUTE[dg.id]).toBeGreaterThan(0);
  });

  it("uses the injected fetch", async () => {
    const { fetchImpl, calls } = mockFetch(DEEPGRAM_OK);
    await selectSttProvider({ env: { STT_PROVIDER: "deepgram", DEEPGRAM_API_KEY: "k" }, fetchImpl })!.transcribe(clip("webm"), "audio/webm");
    expect(calls).toHaveLength(1);
  });
});

describe("clip validation", () => {
  const headers = (o: Partial<{ contentType: string | null; contentLength: string | null; durationMs: string | null }> = {}) => ({
    contentType: "audio/webm;codecs=opus",
    contentLength: "2000",
    durationMs: "2400",
    ...o,
  });

  it("accepts MediaRecorder types, including Safari's mp4 and parameters", () => {
    expect(normaliseAudioType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normaliseAudioType("audio/mp4")).toBe("audio/mp4");
    expect(normaliseAudioType("audio/x-m4a")).toBe("audio/mp4");
    expect(normaliseAudioType("Audio/Ogg; codecs=opus")).toBe("audio/ogg");
    expect(normaliseAudioType("application/json")).toBeNull();
    expect(normaliseAudioType(null)).toBeNull();
  });

  it("checks type, size and duration before reading the body", () => {
    expect(validateClipHeaders(headers())).toEqual({ ok: true, mime: "audio/webm", durationMs: 2400 });
    expect(validateClipHeaders(headers({ durationMs: null }))).toEqual({ ok: true, mime: "audio/webm" });
    expect(validateClipHeaders(headers({ contentType: "text/plain" }))).toMatchObject({ ok: false, status: 415 });
    expect(validateClipHeaders(headers({ contentLength: String(MAX_AUDIO_BYTES + 1) }))).toMatchObject({ ok: false, status: 413 });
    expect(validateClipHeaders(headers({ contentLength: "abc" }))).toMatchObject({ ok: false, status: 400 });
    expect(validateClipHeaders(headers({ durationMs: "31000" }))).toMatchObject({ ok: false, status: 413 });
    expect(validateClipHeaders(headers({ durationMs: "50" }))).toMatchObject({ ok: false, status: 400 });
    expect(validateClipHeaders(headers({ durationMs: "NaN" }))).toMatchObject({ ok: false, status: 400 });
  });

  it("checks the bytes are a real audio container of a sensible size", () => {
    expect(sniffAudio(clip("webm"))).toBe("audio/webm");
    expect(sniffAudio(clip("mp4"))).toBe("audio/mp4");
    expect(sniffAudio(clip("ogg"))).toBe("audio/ogg");
    expect(validateClipBody(clip("mp4"))).toEqual({ ok: true, mime: "audio/mp4" });
    expect(validateClipBody(clip("junk"))).toMatchObject({ ok: false, status: 415 });
    expect(validateClipBody(clip("webm", 100))).toMatchObject({ ok: false, status: 400 });
    expect(validateClipBody(clip("webm", MAX_AUDIO_BYTES + 1))).toMatchObject({ ok: false, status: 413 });
  });

  it("stops reading a body once it passes the cap", async () => {
    const small = new Request("http://x/", { method: "POST", body: clip("webm", 1000) as BodyInit });
    expect((await readBodyCapped(small, 5000))!.length).toBe(1000);
    const big = new Request("http://x/", { method: "POST", body: clip("webm", 6000) as BodyInit });
    expect(await readBodyCapped(big, 5000)).toBeNull();
  });

  it("refuses other origins", () => {
    expect(crossOrigin(new Request("http://app.test/api", { headers: { origin: "http://evil.test" } }))).toBe(true);
    expect(crossOrigin(new Request("http://app.test/api", { headers: { origin: "http://app.test" } }))).toBe(false);
    expect(crossOrigin(new Request("http://app.test/api"))).toBe(false);
  });

  it("bills the provider's duration, else the client's, capped at one turn", () => {
    expect(billableSeconds(2.4, 3000)).toBe(2.4);
    expect(billableSeconds(undefined, 3000)).toBe(3);
    expect(billableSeconds(undefined, undefined)).toBe(0);
    expect(billableSeconds(120, undefined)).toBe(30);
  });

  it("tidies and caps transcripts", () => {
    expect(cleanTranscript("  the   light\nis off ")).toBe("the light is off");
    expect(cleanTranscript("a".repeat(2000))).toHaveLength(1000);
  });

  it("rate-limits per key in fixed windows", () => {
    let t = 0;
    const rl = createRateLimiter(2, 1000, () => t);
    expect([rl.hit("a"), rl.hit("a"), rl.hit("a"), rl.hit("b")]).toEqual([false, false, true, false]);
    t = 1000;
    expect(rl.hit("a")).toBe(false);
  });
});

describe("speech-to-text pricing", () => {
  it("prices a turn from its audio duration", () => {
    expect(speechToTextCost("deepgram-nova-3", 60)).toBeCloseTo(0.0043 * DEFAULT_USD_TO_GBP, 8);
    expect(speechToTextCost("elevenlabs-scribe", 3600)).toBeCloseTo(0.4 * DEFAULT_USD_TO_GBP, 8);
    expect(speechToTextCost("unknown", 10)).toBeUndefined();
  });
});

describe("POST /api/assist/[token]/stt", () => {
  let restoreLog = () => {};
  beforeAll(() => {
    restoreLog = setLogSink(() => {});
  });
  afterAll(() => restoreLog());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function session(consent = true) {
    const rt = getRuntime();
    const { id, token } = rt.create({ workflowId: "wf_router_v3", channel: "secure_link", customerLabel: "Test", scenario: "power_cycle_fix" });
    if (consent) rt.dispatch(id, { type: "customer.consent", accepted: true, noticeVersion: "privacy-notice@2" }, { type: "customer", id: "c", name: "Test" });
    return { rt, id, token };
  }

  function call(token: string, body: Uint8Array, init: { type?: string; origin?: string; durationMs?: number } = {}) {
    const headers: Record<string, string> = { "content-type": init.type ?? "audio/webm;codecs=opus", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` };
    if (init.origin) headers.origin = init.origin;
    const req = new NextRequest(`http://app.test/api/assist/${token}/stt?durationMs=${init.durationMs ?? 2400}`, { method: "POST", headers, body: body as BodyInit });
    return POST(req, { params: Promise.resolve({ token }) });
  }

  function configure(body: unknown = DEEPGRAM_OK, status = 200) {
    vi.stubEnv("STT_PROVIDER", "deepgram");
    vi.stubEnv("DEEPGRAM_API_KEY", "dg-key");
    const m = mockFetch(body, status);
    vi.stubGlobal("fetch", m.fetchImpl);
    return m;
  }

  it("is a 404 when speech-to-text is not configured", async () => {
    vi.stubEnv("STT_PROVIDER", "");
    const { token } = session();
    expect((await call(token, clip("webm"))).status).toBe(404);
  });

  it("refuses cross-origin requests, unknown links and sessions not yet started", async () => {
    const { calls } = configure();
    const { token } = session();
    expect((await call(token, clip("webm"), { origin: "http://evil.test" })).status).toBe(403);
    expect((await call("not-a-token", clip("webm"))).status).toBe(404);
    expect((await call(session(false).token, clip("webm"))).status).toBe(409);
    expect(calls).toHaveLength(0);
  });

  it("refuses bad clips without calling the provider", async () => {
    const { calls } = configure();
    const { token } = session();
    expect((await call(token, clip("webm"), { type: "text/plain" })).status).toBe(415);
    expect((await call(token, clip("junk"))).status).toBe(415);
    expect((await call(token, clip("webm"), { durationMs: 45_000 })).status).toBe(413);
    expect((await call(token, clip("webm", MAX_AUDIO_BYTES + 10))).status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it("adds the transcript through customer.utterance, redacted, with a duration-priced cost", async () => {
    configure({ ...DEEPGRAM_OK, results: { channels: [{ alternatives: [{ transcript: "My email is jo@example.com and the light is off", confidence: 0.91 }] }] } });
    const { rt, id, token } = session();
    const res = await call(token, clip("mp4"), { type: "audio/mp4" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, confidence: 0.91 });
    const s = rt.get(id)!.state;
    const last = s.transcript.filter((t) => t.speaker === "customer").at(-1)!;
    expect(last.text).toContain("[email removed]");
    expect(last.text).not.toContain("jo@example.com");
    expect(last.confidence).toBe(0.91);
    const cost = s.costs.filter((c) => c.category === "speech_to_text").at(-1)!;
    expect(cost).toMatchObject({ provider: "deepgram-nova-3", quantity: 1, unit: "turn", basis: "estimated", audioSeconds: 2.4 });
    expect(cost.estimatedCost).toBeCloseTo(speechToTextCost("deepgram-nova-3", 2.4)!, 6);
    expect(s.audit.some((a) => a.eventType === "privacy.redacted")).toBe(true);
  });

  it("adds nothing when nothing was heard, and maps provider errors to 502", async () => {
    configure({ metadata: { duration: 1 }, results: { channels: [{ alternatives: [{ transcript: "", confidence: 0 }] }] } });
    const { rt, id, token } = session();
    const before = rt.get(id)!.state.transcript.length;
    const res = await call(token, clip("webm"));
    expect(await res.json()).toEqual({ ok: true, text: "" });
    expect(rt.get(id)!.state.transcript.length).toBe(before);

    configure({ err: "x" }, 500);
    expect((await call(token, clip("webm"))).status).toBe(502);
  });

  it("client commands cannot claim a server transcription cost", async () => {
    const { POST: command } = await import("@/app/api/assist/[token]/commands/route");
    const { rt, id, token } = session();
    const req = new Request(`http://app.test/api/assist/${token}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: { type: "customer.utterance", text: "hello", speech: { provider: "deepgram-nova-3", audioSeconds: 9999 } } }),
    });
    expect((await command(req, { params: Promise.resolve({ token }) })).status).toBe(200);
    const cost = rt.get(id)!.state.costs.filter((c) => c.category === "speech_to_text").at(-1)!;
    expect(cost.provider).toBe("browser-asr");
    expect(cost.audioSeconds).toBeUndefined();
  });
});
