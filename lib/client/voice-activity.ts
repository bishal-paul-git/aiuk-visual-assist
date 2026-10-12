/**
 * Pure pieces of customer speech capture (no DOM, unit tested): which
 * recogniser to use, which recording format to ask for, and a small
 * energy-based endpointer that decides when a spoken turn starts and ends.
 */

export type RecogniserKind = "server" | "browser" | "none";

export interface RecogniserEnv {
  /** The deployment reports server speech-to-text (capabilities.speechToText). */
  serverStt: boolean;
  /** MediaRecorder, getUserMedia and an AudioContext exist. */
  canRecord: boolean;
  /** SpeechRecognition / webkitSpeechRecognition exists. */
  webSpeech: boolean;
  userAgent: string;
  maxTouchPoints: number;
  /** Web Speech has already failed in this session (network/service error). */
  webSpeechFailed?: boolean;
}

/** iPhone, iPod and iPad (iPadOS reports a desktop Mac user agent with touch). */
export function isIOS(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/**
 * Web Speech where it is known to be unreliable: every iOS browser (all are
 * WebKit, recognition drops out and stops after silence) and desktop Safari
 * (relies on Siri dictation being enabled).
 */
export function webSpeechUnreliable(userAgent: string, maxTouchPoints = 0): boolean {
  if (isIOS(userAgent, maxTouchPoints)) return true;
  return /Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|Edg\/|OPR\/|Android/.test(userAgent);
}

/**
 * Server STT when the deployment offers it and Web Speech is missing,
 * unreliable or has failed; otherwise the browser's own recognition, which
 * costs nothing and streams interim text.
 */
export function chooseRecogniser(env: RecogniserEnv): RecogniserKind {
  const server = env.serverStt && env.canRecord;
  if (server && (!env.webSpeech || env.webSpeechFailed || webSpeechUnreliable(env.userAgent, env.maxTouchPoints))) return "server";
  if (env.webSpeech && !env.webSpeechFailed) return "browser";
  return server ? "server" : "none";
}

/** Recording formats in order of preference. iOS Safari only records mp4/aac. */
export const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"] as const;

export function pickRecorderType(isTypeSupported: (t: string) => boolean): string | undefined {
  return RECORDER_TYPES.find((t) => {
    try {
      return isTypeSupported(t);
    } catch {
      return false;
    }
  });
}

/** Root-mean-square level of a time-domain block (-1..1 floats). */
export function rms(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export interface EndpointerOptions {
  /** Loud audio needed before a turn counts as started. */
  startMs: number;
  /** Quiet audio that ends a turn. */
  endSilenceMs: number;
  /** A turn is cut here regardless (the server refuses clips over 30 s). */
  maxTurnMs: number;
  /** Turns with less voiced audio than this are dropped (coughs, clicks). */
  minVoicedMs: number;
  /** While waiting, restart the recording this often so clips carry little leading silence. */
  idleRestartMs: number;
  /** Absolute floor for the speech threshold. */
  minThreshold: number;
  /** Speech threshold as a multiple of the tracked noise floor. */
  floorRatio: number;
}

export const DEFAULT_ENDPOINTER: EndpointerOptions = {
  startMs: 150,
  endSilenceMs: 900,
  maxTurnMs: 25_000,
  minVoicedMs: 250,
  idleRestartMs: 6_000,
  minThreshold: 0.012,
  floorRatio: 3,
};

/**
 * - "start": speech began; keep recording.
 * - "end": the turn is over; upload what was recorded.
 * - "discard": what was recorded is not speech; throw it away and record afresh.
 */
export type EndpointerEvent = "none" | "start" | "end" | "discard";

/** Energy-based voice-activity endpointing with an adaptive noise floor. Feed it one level per tick. */
export class Endpointer {
  state: "waiting" | "speaking" = "waiting";
  private floor = 0.004;
  private loudMs = 0;
  private idleMs = 0;
  private turnMs = 0;
  private voicedMs = 0;
  private quietMs = 0;
  private readonly o: EndpointerOptions;

  constructor(opts: Partial<EndpointerOptions> = {}) {
    this.o = { ...DEFAULT_ENDPOINTER, ...opts };
  }

  get threshold(): number {
    return Math.max(this.o.minThreshold, this.floor * this.o.floorRatio);
  }

  reset() {
    this.state = "waiting";
    this.loudMs = this.idleMs = this.turnMs = this.voicedMs = this.quietMs = 0;
  }

  push(level: number, dtMs: number): EndpointerEvent {
    const loud = level >= this.threshold;
    if (this.state === "waiting") {
      this.idleMs += dtMs;
      if (loud) this.loudMs += dtMs;
      else {
        this.loudMs = 0;
        // Track background noise only while nobody is speaking.
        this.floor = this.floor * 0.95 + level * 0.05;
      }
      if (this.loudMs >= this.o.startMs) {
        this.state = "speaking";
        this.turnMs = this.voicedMs = this.loudMs;
        this.quietMs = 0;
        return "start";
      }
      if (this.idleMs >= this.o.idleRestartMs) {
        this.reset();
        return "discard";
      }
      return "none";
    }
    this.turnMs += dtMs;
    // A little hysteresis: trailing syllables are quieter than onsets.
    if (level >= this.threshold * 0.7) {
      this.voicedMs += dtMs;
      this.quietMs = 0;
    } else this.quietMs += dtMs;
    if (this.turnMs >= this.o.maxTurnMs) {
      this.reset();
      return "end";
    }
    if (this.quietMs >= this.o.endSilenceMs) {
      const enough = this.voicedMs >= this.o.minVoicedMs;
      this.reset();
      return enough ? "end" : "discard";
    }
    return "none";
  }
}
