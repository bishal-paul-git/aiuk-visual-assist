import type { ReactNode } from "react";
import { Mail, MessageSquare } from "lucide-react";
import type { SessionState } from "@/lib/domain/session";
import type { NotificationService } from "@/lib/server/notifications";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Badge, Panel, Table, Td, Th } from "@/components/ui/primitives";

interface DeliveryRow {
  id: string;
  at: string;
  reference: string;
  sessionId: string;
  channel: string;
  to: string;
  provider: string;
  simulated: boolean;
  ok: boolean;
  detail?: string;
}

/** Delivery log comes from session audit records, so it survives restarts with a durable store. */
export function deliveryLog(states: SessionState[], limit = 25): DeliveryRow[] {
  return states
    .flatMap((s) =>
      s.audit
        .filter((a) => a.eventType === "notification.sent" || a.eventType === "notification.failed")
        .map((a) => ({
          id: a.id,
          at: a.timestamp,
          reference: s.session.reference,
          sessionId: s.session.id,
          channel: String(a.payload.channel ?? "—"),
          to: String(a.payload.to ?? "—"),
          provider: String(a.payload.provider ?? "—"),
          simulated: a.payload.simulated === true,
          ok: a.eventType === "notification.sent",
          detail: typeof a.payload.error === "string" ? a.payload.error : typeof a.payload.status === "string" ? a.payload.status : undefined,
        })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

function ProviderCard({ icon, channel, provider, simulated, env }: { icon: ReactNode; channel: string; provider: string; simulated: boolean; env: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          {icon} {channel}
        </span>
        <Badge tone={simulated ? "warn" : "ok"}>{simulated ? "Outbox only" : "Connected"}</Badge>
      </div>
      <p className="mt-1.5 text-xs text-ink-2">{simulated ? "Messages are recorded here, not delivered." : `Delivered through ${provider}.`}</p>
      <p className="mt-1 text-[11px] text-muted">
        Enable with <code className="font-mono">{env}</code>
      </p>
    </div>
  );
}

export function LinkDeliveryPanel({ states, notifications, staticDemo }: { states: SessionState[]; notifications: NotificationService; staticDemo: boolean }) {
  const status = notifications.status();
  const rows = deliveryLog(states);
  const outbox = notifications.outbox.outbox.slice(0, 10);

  return (
    <Panel
      className="mt-4"
      title="Customer link delivery"
      description="Secure session links sent by SMS or email when a session is created. Recipients are masked in every record."
      bodyClassName="p-0"
    >
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <ProviderCard
          icon={<MessageSquare className="size-3.5 text-muted" aria-hidden />}
          channel="SMS"
          provider="Twilio"
          simulated={status.sms.simulated}
          env="TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM"
        />
        <ProviderCard
          icon={<Mail className="size-3.5 text-muted" aria-hidden />}
          channel="Email"
          provider="the email API"
          simulated={status.email.simulated}
          env="RESEND_API_KEY, EMAIL_FROM"
        />
      </div>
      {staticDemo ? (
        <p className="border-t border-line px-4 py-3 text-xs text-muted">Link delivery runs in the server edition only. This static demo cannot send messages.</p>
      ) : (
        <>
          <div className="border-t border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Delivery log</div>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Session</Th>
                <Th>Channel</Th>
                <Th>Recipient</Th>
                <Th>Provider</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border-b border-line px-3 py-3 text-center text-xs text-muted">
                    No links sent yet. Start a test session and enter a mobile number or email address.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap text-xs">
                      {formatRelative(r.at)}
                      <div className="text-muted">{formatDateTime(r.at)}</div>
                    </Td>
                    <Td className="font-medium text-ink">{r.reference}</Td>
                    <Td className="text-xs">{r.channel === "sms" ? "SMS" : r.channel === "email" ? "Email" : r.channel}</Td>
                    <Td className="font-mono text-xs">{r.to}</Td>
                    <Td className="text-xs">
                      {r.provider}
                      {r.simulated && <span className="text-muted"> · simulated</span>}
                    </Td>
                    <Td>
                      <Badge tone={r.ok ? (r.simulated ? "neutral" : "ok") : "danger"}>{r.ok ? (r.simulated ? "Recorded" : "Sent") : "Failed"}</Badge>
                      {r.detail && <div className="mt-0.5 max-w-64 truncate text-[11px] text-muted">{r.detail}</div>}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
          {outbox.length > 0 && (
            <>
              <div className="border-t border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Outbox (not delivered · since last restart)</div>
              <ul className="divide-y divide-line text-xs">
                {outbox.map((m) => (
                  <li key={m.id} className="px-4 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-muted">
                      <span>
                        {m.channel === "sms" ? "SMS" : "Email"} · {formatDateTime(m.at)}
                      </span>
                      <span className="font-mono">{m.id}</span>
                    </div>
                    {m.subject && <div className="mt-0.5 font-medium text-ink">{m.subject}</div>}
                    <p className="mt-0.5 whitespace-pre-line break-words text-ink-2">{m.body}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Panel>
  );
}
