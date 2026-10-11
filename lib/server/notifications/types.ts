/**
 * Notification provider abstraction (docs/02 §7 — notifications). Used to
 * deliver the secure customer link by SMS or email. Implementations call
 * vendor HTTP APIs with `fetch`; no SDKs.
 */

export interface SmsMessage {
  to: string; // E.164
  body: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  ok: boolean;
  /** Vendor message id (Twilio SID, Resend id) when accepted. */
  providerMessageId?: string;
  /** Vendor-reported status, e.g. "queued". */
  status?: string;
  error?: string;
}

export interface NotificationProvider {
  readonly id: string;
  /** True when messages are only recorded, not delivered to a real recipient. */
  readonly simulated: boolean;
  readonly channels: readonly ("sms" | "email")[];
  /** Providers that do not support a channel resolve `{ ok: false }` rather than throwing. */
  sendSms(message: SmsMessage): Promise<SendResult>;
  sendEmail(message: EmailMessage): Promise<SendResult>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
