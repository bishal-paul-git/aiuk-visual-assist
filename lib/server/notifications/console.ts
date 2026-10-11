import { log } from "@/lib/server/log";
import { maskEmail, maskPhone } from "@/lib/notifications/validate";
import type { EmailMessage, NotificationProvider, SendResult, SmsMessage } from "./types";

export interface OutboxEntry {
  id: string;
  channel: "sms" | "email";
  to: string;
  subject?: string;
  body: string;
  at: string;
}

/**
 * Development/demo provider: nothing leaves the server. Messages are kept in
 * a bounded in-memory outbox and logged with masked recipients, so a tester
 * can copy the link from the platform without SMS or email credentials.
 */
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly id = "console";
  readonly simulated = true;
  readonly channels = ["sms", "email"] as const;
  readonly outbox: OutboxEntry[] = [];
  private counter = 0;

  constructor(private readonly limit = 100) {}

  private record(entry: Omit<OutboxEntry, "id" | "at">): SendResult {
    this.counter += 1;
    const id = `outbox_${this.counter.toString().padStart(5, "0")}`;
    this.outbox.unshift({ ...entry, id, at: new Date().toISOString() });
    this.outbox.length = Math.min(this.outbox.length, this.limit);
    log.info("notification.recorded", { provider: this.id, channel: entry.channel, to: entry.channel === "sms" ? maskPhone(entry.to) : maskEmail(entry.to), messageId: id });
    return { ok: true, providerMessageId: id, status: "recorded" };
  }

  async sendSms(message: SmsMessage): Promise<SendResult> {
    return this.record({ channel: "sms", to: message.to, body: message.body });
  }

  async sendEmail(message: EmailMessage): Promise<SendResult> {
    return this.record({ channel: "email", to: message.to, subject: message.subject, body: message.text });
  }
}
