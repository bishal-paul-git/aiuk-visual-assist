import type { EmailMessage, FetchLike, NotificationProvider, SendResult, SmsMessage } from "./types";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Sender: an E.164 number or a Messaging Service SID ("MG…"). */
  from: string;
  /** Override for tests / regional endpoints. */
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Twilio Programmable Messaging over its REST API
 * (POST /2010-04-01/Accounts/{AccountSid}/Messages.json, form-encoded, HTTP
 * basic auth). Enabled when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
 * TWILIO_FROM are set.
 */
export class TwilioSmsProvider implements NotificationProvider {
  readonly id = "twilio";
  readonly simulated = false;
  readonly channels = ["sms"] as const;

  constructor(
    private readonly config: TwilioConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  static fromEnv(env: Record<string, string | undefined> = process.env, fetchImpl?: FetchLike): TwilioSmsProvider | undefined {
    const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, TWILIO_FROM: from } = env;
    if (!accountSid || !authToken || !from) return undefined;
    return new TwilioSmsProvider({ accountSid, authToken, from }, fetchImpl);
  }

  async sendSms(message: SmsMessage): Promise<SendResult> {
    const { accountSid, authToken, from } = this.config;
    const base = this.config.baseUrl ?? "https://api.twilio.com";
    const form = new URLSearchParams({ To: message.to, Body: message.body });
    form.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);
    try {
      const res = await this.fetchImpl(`${base}/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: form.toString(),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });
      const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
      if (!res.ok) return { ok: false, error: `Twilio ${res.status}${data.code ? ` (${data.code})` : ""}: ${data.message ?? res.statusText}`.slice(0, 300) };
      return { ok: true, providerMessageId: data.sid, status: data.status ?? "queued" };
    } catch (e) {
      return { ok: false, error: `Twilio request failed: ${(e as Error).message}`.slice(0, 300) };
    }
  }

  async sendEmail(_message: EmailMessage): Promise<SendResult> {
    void _message;
    return { ok: false, error: "Twilio provider does not send email" };
  }
}
