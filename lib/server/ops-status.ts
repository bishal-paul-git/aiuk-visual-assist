import { SERVICES, type ServiceStatus } from "@/lib/config/operations";
import { getPersistence, getRuntime } from "@/lib/server/runtime";
import { getNotifications } from "@/lib/server/notifications";

/**
 * The catalogue in lib/config/operations.ts describes the POC baseline. In the
 * server edition some rows depend on configuration (DATABASE_URL, DATA_DIR, provider keys),
 * so System Health shows what this deployment actually runs.
 */
export function effectiveServices(): ServiceStatus[] {
  if (process.env.STATIC_EXPORT === "1") return SERVICES;
  const store = getPersistence().store.status();
  const live = getRuntime().liveReasoning;
  const notify = getNotifications().status();

  return SERVICES.map((s): ServiceStatus => {
    switch (s.key) {
      case "store":
        return store.durable
          ? {
              ...s,
              provider: store.kind === "postgres" ? "Postgres (DATABASE_URL)" : "File store (DATA_DIR)",
              status: store.lastError ? "degraded" : "operational",
              note: store.lastError
                ? `Last write error: ${store.lastError}`
                : store.kind === "postgres"
                  ? `Durable in ${store.location}: sessions, frames, configuration and QA records. Single instance until the SSE fan-out is shared.`
                  : "Durable on one instance: JSON snapshots + frame files, atomic writes. Use DATABASE_URL (Postgres) for a managed database.",
            }
          : s;
      case "reasoning":
        return live.available
          ? { ...s, provider: live.model ?? "Claude", mode: "live", status: "operational", note: "Live sessions use the model; simulation scenarios keep using the simulator." }
          : s;
      case "notify": {
        const real = !notify.sms.simulated || !notify.email.simulated;
        return real
          ? {
              ...s,
              provider: [notify.sms.simulated ? null : "Twilio SMS", notify.email.simulated ? null : "Email API"].filter(Boolean).join(" + "),
              mode: "live",
              status: "operational",
              note: notify.sms.simulated || notify.email.simulated ? "One channel still records to the outbox only" : "Both channels deliver",
            }
          : s;
      }
      case "telemetry":
        return {
          ...s,
          provider: "Prometheus /api/metrics + JSON logs",
          mode: "live",
          status: "operational",
          note: "Metrics endpoint, readiness at /api/health, structured logs with request and session ids. OTel trace export planned.",
        };
      default:
        return s;
    }
  });
}
