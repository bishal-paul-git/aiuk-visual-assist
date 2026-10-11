import type { EmailMessage, FetchLike, NotificationProvider, SendResult, SmsMessage } from "./types";

export interface ResendConfig {
  apiKey: string;
  /** Verified sender, e.g. "Northline Support <support@example.com>". */
  from: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Transactional email over an HTTP API (Resend-style: POST /emails with a
 * bearer key and a JSON body). No SMTP. Enabled when RESEND_API_KEY and
 * EMAIL_FROM are set; swap `baseUrl` for a compatible gateway.
 */
export class ResendEmailProvider implements NotificationProvider {
  readonly id = "resend";
  readonly simulated = false;
  readonly channels = ["email"] as const;

  constructor(
    private readonly config: ResendConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  static fromEnv(env: Record<string, string | undefined> = process.env, fetchImpl?: FetchLike): ResendEmailProvider | undefined {
    const { RESEND_API_KEY: apiKey, EMAIL_FROM: from } = env;
    if (!apiKey || !from) return undefined;
    return new ResendEmailProvider({ apiKey, from }, fetchImpl);
  }

  async sendEmail(message: EmailMessage): Promise<SendResult> {
    const base = this.config.baseUrl ?? "https://api.resend.com";
    try {
      const res = await this.fetchImpl(`${base}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.config.from, to: [message.to], subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!res.ok) return { ok: false, error: `Email API ${res.status}: ${data.message ?? data.name ?? res.statusText}`.slice(0, 300) };
      return { ok: true, providerMessageId: data.id, status: "accepted" };
    } catch (e) {
      return { ok: false, error: `Email request failed: ${(e as Error).message}`.slice(0, 300) };
    }
  }

  async sendSms(_message: SmsMessage): Promise<SendResult> {
    void _message;
    return { ok: false, error: "Email provider does not send SMS" };
  }
}
