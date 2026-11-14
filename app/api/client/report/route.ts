import { getRuntime } from "@/lib/server/runtime";
import { authError, authorize } from "@/lib/server/auth";
import { scopeTenantFilter } from "@/lib/auth/rbac";
import { getTenant } from "@/lib/config/catalog";
import { recordSecurityEvent } from "@/lib/auth/security-log";
import { reportCsv, reportStates } from "@/lib/analytics/pilot-report";
import { DEFAULT_CLIENT } from "@/lib/server/client-data";

/**
 * Pilot report download: GET /api/client/report?org=<tenant>. One row per real
 * customer session of one client. Client staff get their own client only;
 * platform staff choose with ?org=.
 */
export async function GET(request: Request) {
  const auth = await authorize("session.view", undefined, { action: "report.export" });
  if (!auth.ok) return auth.response;
  const requested = new URL(request.url).searchParams.get("org") ?? undefined;
  const scoped = scopeTenantFilter(auth.user, requested);
  if (scoped === null) return authError(403, "This belongs to another client organisation.");
  const tenant = getTenant(scoped ?? DEFAULT_CLIENT);
  if (!tenant) return Response.json({ error: "Unknown client" }, { status: 404 });
  const states = reportStates(getRuntime().states({ tenantId: tenant.id }));
  recordSecurityEvent({ eventType: "audit.exported", user: auth.user, tenantId: tenant.id, payload: { format: "csv", rows: states.length, report: "pilot" } });
  const day = new Date().toISOString().slice(0, 10);
  const name = `${tenant.name.replace(/[^A-Za-z0-9]+/g, "-")}-visual-assist-report-${day}.csv`;
  return new Response(reportCsv(states), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
