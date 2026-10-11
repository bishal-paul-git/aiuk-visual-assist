import { getRuntime } from "@/lib/server/runtime";

/** Latest low-rate live preview frame for the agent console (live-only, never retained). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = getRuntime().getPreview(id);
  if (!preview) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return new Response(Buffer.from(preview.data), { headers: { "Content-Type": preview.mime, "Cache-Control": "no-store" } });
}
