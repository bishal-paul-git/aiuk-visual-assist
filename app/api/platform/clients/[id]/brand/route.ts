import { authorize } from "@/lib/server/auth";
import { jsonError, readJson } from "@/lib/server/http";
import { getTenant } from "@/lib/config/catalog";
import { setBrand, validateBrand } from "@/lib/config/brand";
import { recordSecurityEvent } from "@/lib/auth/security-log";

/** Change how a client appears to its customers: name, colour, support line, assistant name. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getTenant(id)) return jsonError("Client not found", 404);
  const auth = await authorize("settings.edit", { tenantId: id }, { action: "brand_changed" });
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 4_000);
  const brand = validateBrand((body ?? {}) as Record<string, unknown>);
  if (typeof brand === "string") return jsonError(brand, 400);
  setBrand(id, brand);
  recordSecurityEvent({ eventType: "security.connector_changed", user: auth.user, payload: { tenantId: id, change: "brand", displayName: brand.displayName } });
  return Response.json({ brand });
}
