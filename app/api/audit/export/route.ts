import { getRuntime } from "@/lib/server/runtime";
import { jsonError } from "@/lib/server/http";
import { authError, authorize } from "@/lib/server/auth";
import { scopeTenantFilter } from "@/lib/auth/rbac";
import { scopeFor } from "@/lib/auth/scope";
import { recordSecurityEvent, securityEvents } from "@/lib/auth/security-log";
import { getWorkflowRegistry } from "@/lib/workflow/registry";
import { getPolicyRegistry } from "@/lib/policy/registry";
import { auditCsvChunks, auditRecordJson, collectAuditRecords, filterAuditRecords, parseExportQuery } from "@/lib/audit/export";

/**
 * Enterprise audit export (docs/06 §7):
 *   GET /api/audit/export?format=csv|json&from=&to=&tenantId=&category=
 *
 * Requires `audit.view`. Platform roles may export any client (or all);
 * everyone else only their own client — asking for another client is refused.
 * Covers session, configuration (workflow / policy) and security events. Each
 * export is itself recorded as an `audit.exported` event.
 */
export async function GET(request: Request) {
  const auth = await authorize("audit.view", undefined, { action: "audit.export" });
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const parsed = parseExportQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const tenantId = scopeTenantFilter(user, parsed.query.tenantId);
  if (tenantId === null) {
    recordSecurityEvent({ eventType: "security.permission_denied", user, payload: { permission: "audit.view", action: "audit.export", resourceTenantId: parsed.query.tenantId } });
    return authError(403, "This belongs to another client organisation.");
  }

  // Boot the runtime first: it restores persisted sessions and configuration history.
  const rt = getRuntime();
  const scope = scopeFor(user);
  const records = filterAuditRecords(
    collectAuditRecords({
      states: rt.states({ tenantId: scope.tenantId }),
      configEvents: [...getWorkflowRegistry().audit, ...getPolicyRegistry().audit],
      securityEvents: securityEvents(),
    }),
    scope,
    { ...parsed.query, tenantId },
  );

  const exportedAt = new Date();
  const filters = {
    from: parsed.query.from?.toISOString(),
    to: parsed.query.to?.toISOString(),
    tenantId,
    category: parsed.query.category,
  };
  recordSecurityEvent({
    eventType: "audit.exported",
    user,
    tenantId: tenantId ?? user.tenantId,
    payload: { format: parsed.format, rows: records.length, ...filters },
    now: exportedAt,
  });

  const stamp = exportedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const name = `audit-export-${(tenantId ?? "all-clients").replace(/[^A-Za-z0-9_-]/g, "_")}-${stamp}`;
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Audit-Record-Count": String(records.length),
  };

  if (parsed.format === "json") {
    return Response.json(
      { exportedAt: exportedAt.toISOString(), exportedBy: user.id, filters, count: records.length, events: records.map(auditRecordJson) },
      { headers: { ...headers, "Content-Disposition": `attachment; filename="${name}.json"` } },
    );
  }

  const chunks = auditCsvChunks(records);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
    cancel() {
      chunks.return(undefined);
    },
  });
  return new Response(body, {
    headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
  });
}
