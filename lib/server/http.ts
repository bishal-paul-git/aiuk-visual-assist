import { users } from "@/lib/config/catalog";
import type { Actor } from "@/lib/session/orchestrator";

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

/**
 * POC agent identity. Real deployments resolve the actor from the SSO session
 * (docs/06 §2); until then the console selects a known catalog user.
 */
export function resolveAgent(value: unknown): Actor | null {
  const id = typeof value === "string" ? value : "usr_sarah";
  const user = users.find((u) => u.id === id && (u.role === "agent" || u.role === "supervisor"));
  return user ? { type: "human_agent", id: user.id, name: user.name } : null;
}

export function str(value: unknown, max = 2000): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}
