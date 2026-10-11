import { getTenant } from "@/lib/config/catalog";
import type { SessionRuntime } from "@/lib/runtime/session-runtime";
import type { Actor } from "@/lib/session/orchestrator";
import { maskEmail, maskPhone, type DeliverTo } from "@/lib/notifications/validate";
import { log } from "@/lib/server/log";
import { ConsoleNotificationProvider } from "./console";
import { ResendEmailProvider } from "./resend";
import { TwilioSmsProvider } from "./twilio";
import type { FetchLike, NotificationProvider, SendResult } from "./types";

export type { NotificationProvider } from "./types";
export { ConsoleNotificationProvider } from "./console";
export { TwilioSmsProvider } from "./twilio";
export { ResendEmailProvider } from "./resend";

export interface DeliveryResult {
  channel: "sms" | "email";
  /** Masked recipient — safe to show and to audit. */
  to: string;
  provider: string;
  simulated: boolean;
  ok: boolean;
  status?: string;
  providerMessageId?: string;
  error?: string;
}

/**
 * Chooses a provider per channel from the environment (Twilio for SMS,
 * Resend-style HTTP API for email) and falls back to the console outbox, so
 * delivery always "works" in development and is visibly marked simulated.
 */
export class NotificationService {
  readonly counts = new Map<string, number>();

  constructor(
    readonly sms: NotificationProvider,
    readonly email: NotificationProvider,
    readonly outbox: ConsoleNotificationProvider,
  ) {}

  static fromEnv(env: Record<string, string | undefined> = process.env, fetchImpl?: FetchLike): NotificationService {
    const outbox = new ConsoleNotificationProvider();
    return new NotificationService(TwilioSmsProvider.fromEnv(env, fetchImpl) ?? outbox, ResendEmailProvider.fromEnv(env, fetchImpl) ?? outbox, outbox);
  }

  status() {
    return {
      sms: { provider: this.sms.id, simulated: this.sms.simulated },
      email: { provider: this.email.id, simulated: this.email.simulated },
    };
  }

  /**
   * Send the secure customer link for a session to each requested recipient.
   * Every attempt is written to the session audit (masked recipient, provider,
   * outcome) — never the link or the full phone number / address.
   */
  async deliverSessionLink(rt: SessionRuntime, sessionId: string, link: string, to: DeliverTo, actor: Actor): Promise<DeliveryResult[]> {
    const entry = rt.get(sessionId);
    if (!entry) throw new Error("Session not found");
    const tenant = getTenant(entry.state.session.tenantId);
    const brand = tenant?.brand.displayName ?? "Support";
    const reference = entry.state.session.reference;
    const jobs: Promise<DeliveryResult>[] = [];

    if (to.sms) {
      const body = `${brand}: here is your secure link to start visual support (ref ${reference}). Open it on your phone: ${link} — it only works for this session.`;
      jobs.push(this.attempt("sms", this.sms, maskPhone(to.sms), () => this.sms.sendSms({ to: to.sms!, body })));
    }
    if (to.email) {
      const subject = `${brand} — your secure visual support link (ref ${reference})`;
      const text = [
        "Hello,",
        "",
        `Use this secure link to start a visual support session with ${brand}. Open it on the phone you will use to show us the problem:`,
        "",
        link,
        "",
        "The link only works for this session. We will ask for your permission before turning on the camera.",
        "",
        `Reference: ${reference}`,
      ].join("\n");
      jobs.push(this.attempt("email", this.email, maskEmail(to.email), () => this.email.sendEmail({ to: to.email!, subject, text })));
    }

    const results = await Promise.all(jobs);
    for (const r of results) {
      rt.recordAudit(sessionId, r.ok ? "notification.sent" : "notification.failed", {
        purpose: "customer_link",
        channel: r.channel,
        to: r.to,
        provider: r.provider,
        simulated: r.simulated,
        status: r.status,
        providerMessageId: r.providerMessageId,
        error: r.error,
      }, actor);
    }
    return results;
  }

  private async attempt(channel: "sms" | "email", provider: NotificationProvider, masked: string, send: () => Promise<SendResult>): Promise<DeliveryResult> {
    let res: SendResult;
    try {
      res = await send();
    } catch (e) {
      res = { ok: false, error: (e as Error).message };
    }
    const key = `${channel}|${res.ok ? "sent" : "failed"}`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    if (!res.ok) log.warn("notification.failed", { channel, provider: provider.id, to: masked, error: res.error });
    return { channel, to: masked, provider: provider.id, simulated: provider.simulated, ok: res.ok, status: res.status, providerMessageId: res.providerMessageId, error: res.error };
  }
}

const GLOBAL_KEY = "__aiukVisualAssistNotifications";

export function getNotifications(): NotificationService {
  const g = globalThis as unknown as Record<string, NotificationService | undefined>;
  return (g[GLOBAL_KEY] ??= NotificationService.fromEnv());
}
