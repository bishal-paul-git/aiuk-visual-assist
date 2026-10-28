/**
 * Client-side media gateway helpers (docs/02 §3.4): frame selection,
 * stability detection, resizing and compression. Only selected stills leave
 * the device; the continuous stream is never uploaded for inference.
 */

export type FrameSource = HTMLVideoElement | HTMLCanvasElement;

function sourceSize(src: FrameSource): { w: number; h: number } {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth, h: src.videoHeight };
  return { w: src.width, h: src.height };
}

export function isSourceReady(src: FrameSource | null): src is FrameSource {
  if (!src) return false;
  const { w, h } = sourceSize(src);
  return w > 0 && h > 0;
}

/**
 * True when the source is showing an all-black (or near-black, flat) picture:
 * a covered lens, a camera another app holds, or a phone browser that is not
 * painting the video. Such a frame is useless to the AI and is never sent.
 */
export function isBlackFrame(src: FrameSource): boolean {
  if (!isSourceReady(src)) return false;
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 24;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(src, 0, 0, 32, 24);
  const { data } = ctx.getImageData(0, 0, 32, 24);
  let sum = 0;
  let sq = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += l;
    sq += l * l;
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  return mean < 12 && sd < 6;
}

export interface CapturedFrame {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

export function captureFrame(src: FrameSource, maxDim = 960, quality = 0.72): CapturedFrame | null {
  const { w, h } = sourceSize(src);
  if (!w || !h) return null;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, width, height);
  let q = quality;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  while (dataUrl.length * 0.75 > 650_000 && q > 0.35) {
    q -= 0.12;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }
  return { dataUrl, width, height, bytes: Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75) };
}

/**
 * Measures inter-frame motion on a tiny luma thumbnail. Used to wait for the
 * customer to "hold steady" before selecting a frame, and as a scene-change
 * signal.
 */
export class MotionMeter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private prev: Float32Array | null = null;
  constructor(private readonly w = 32, private readonly h = 24) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  /** Mean absolute luma difference from the previous sample, 0..255. */
  sample(src: FrameSource): number | null {
    if (!this.ctx || !isSourceReady(src)) return null;
    this.ctx.drawImage(src, 0, 0, this.w, this.h);
    const { data } = this.ctx.getImageData(0, 0, this.w, this.h);
    const luma = new Float32Array(this.w * this.h);
    for (let i = 0; i < luma.length; i++) luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    const prev = this.prev;
    this.prev = luma;
    if (!prev) return null;
    let sum = 0;
    for (let i = 0; i < luma.length; i++) sum += Math.abs(luma[i] - prev[i]);
    return sum / luma.length;
  }

  reset() {
    this.prev = null;
  }
}
