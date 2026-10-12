import { describe, expect, it } from "vitest";
import { chooseRecogniser, Endpointer, isIOS, pickRecorderType, rms, webSpeechUnreliable, type RecogniserEnv } from "@/lib/client/voice-activity";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
};

const env = (o: Partial<RecogniserEnv>): RecogniserEnv => ({ serverStt: true, canRecord: true, webSpeech: true, userAgent: UA.chrome, maxTouchPoints: 0, ...o });

describe("recogniser choice", () => {
  it("detects iOS, including iPadOS's desktop user agent", () => {
    expect(isIOS(UA.iphone)).toBe(true);
    expect(isIOS(UA.ipad, 5)).toBe(true);
    expect(isIOS(UA.macSafari, 0)).toBe(false);
    expect(webSpeechUnreliable(UA.iphoneChrome)).toBe(true);
    expect(webSpeechUnreliable(UA.macSafari)).toBe(true);
    expect(webSpeechUnreliable(UA.android)).toBe(false);
    expect(webSpeechUnreliable(UA.chrome)).toBe(false);
  });

  it("prefers server STT on iOS and Safari even when Web Speech exists", () => {
    expect(chooseRecogniser(env({ userAgent: UA.iphone, maxTouchPoints: 5 }))).toBe("server");
    expect(chooseRecogniser(env({ userAgent: UA.macSafari }))).toBe("server");
  });

  it("keeps Web Speech on Chrome and Android", () => {
    expect(chooseRecogniser(env({ userAgent: UA.chrome }))).toBe("browser");
    expect(chooseRecogniser(env({ userAgent: UA.android }))).toBe("browser");
  });

  it("uses server STT where Web Speech is missing or has failed", () => {
    expect(chooseRecogniser(env({ userAgent: UA.firefox, webSpeech: false }))).toBe("server");
    expect(chooseRecogniser(env({ webSpeechFailed: true }))).toBe("server");
  });

  it("falls back to the browser, or typing, when the server has no STT (static demo)", () => {
    expect(chooseRecogniser(env({ serverStt: false, userAgent: UA.iphone }))).toBe("browser");
    expect(chooseRecogniser(env({ serverStt: false, webSpeech: false }))).toBe("none");
    expect(chooseRecogniser(env({ canRecord: false, webSpeech: false }))).toBe("none");
  });

  it("picks the first recording format the browser supports", () => {
    expect(pickRecorderType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickRecorderType((t) => t === "audio/mp4")).toBe("audio/mp4"); // iOS Safari
    expect(
      pickRecorderType(() => {
        throw new Error("unsupported");
      }),
    ).toBeUndefined();
  });
});

describe("endpointer", () => {
  const run = (e: Endpointer, level: number, ms: number) => {
    const events: string[] = [];
    for (let t = 0; t < ms; t += 50) {
      const ev = e.push(level, 50);
      if (ev !== "none") events.push(ev);
    }
    return events;
  };

  it("measures RMS", () => {
    expect(rms([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
    expect(rms([])).toBe(0);
  });

  it("starts on sustained speech and ends after a pause", () => {
    const e = new Endpointer();
    expect(run(e, 0.002, 1000)).toEqual([]);
    expect(run(e, 0.1, 1200)).toEqual(["start"]);
    expect(run(e, 0.002, 1000)).toEqual(["end"]);
    expect(e.state).toBe("waiting");
  });

  it("ignores a short click and keeps a turn through brief pauses", () => {
    const e = new Endpointer();
    run(e, 0.002, 500);
    expect(run(e, 0.1, 100)).toEqual([]);
    run(e, 0.002, 500);
    expect(run(e, 0.1, 400)).toEqual(["start"]);
    expect(run(e, 0.002, 400)).toEqual([]);
    expect(run(e, 0.1, 400)).toEqual([]);
    expect(run(e, 0.002, 1000)).toEqual(["end"]);
  });

  it("discards a turn with too little voiced audio", () => {
    const e = new Endpointer({ minVoicedMs: 500 });
    run(e, 0.002, 500);
    expect([...run(e, 0.1, 200), ...run(e, 0.002, 1000)]).toEqual(["start", "discard"]);
  });

  it("cuts a turn at the maximum length", () => {
    const e = new Endpointer({ maxTurnMs: 2000 });
    expect(run(e, 0.1, 2500)).toEqual(["start", "end", "start"]);
  });

  it("restarts the recording while it waits so clips carry little silence", () => {
    const e = new Endpointer({ idleRestartMs: 1000 });
    expect(run(e, 0.002, 2000)).toEqual(["discard", "discard"]);
  });

  it("raises its threshold with steady background noise", () => {
    const e = new Endpointer({ idleRestartMs: 60_000 });
    expect(run(e, 0.008, 3000)).toEqual([]);
    expect(e.threshold).toBeGreaterThan(0.02);
    expect(run(e, 0.018, 500)).toEqual([]); // a slightly louder hum is not speech
    expect(run(e, 0.1, 300)).toEqual(["start"]);
  });
});
