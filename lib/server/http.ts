export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function readJson(request: Request, maxBytes = 1_200_000): Promise<Record<string, unknown> | null> {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > maxBytes) return null;
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export function decodeImageDataUrl(value: unknown): { mime: string; data: Uint8Array } | null {
  if (typeof value !== "string") return null;
  const m = DATA_URL.exec(value);
  if (!m) return null;
  return { mime: m[1], data: new Uint8Array(Buffer.from(m[2], "base64")) };
}

export function str(value: unknown, max = 2000): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}
