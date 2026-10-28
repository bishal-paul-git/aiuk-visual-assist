import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maskEmail, maskPhone, normaliseEmail, normalisePhone, parseDeliverTo } from "@/lib/notifications/validate";
import { ConsoleNotificationProvider, NotificationService, ResendEmailProvider, TwilioSmsProvider } from "@/lib/server/notifications";
import { SessionRuntime } from "@/lib/runtime/session-runtime";
import { MockReasoningProvider } from "@/lib/providers/mock/reasoning";
import { MockToolExecutor } from "@/lib/providers/mock/tools";
import { setLogSink } from "@/lib/server/log";

let restoreLog: () => void;
beforeEach(() => {
  restoreLog = setLogSink(() => {});
});
afterEach(() => restoreLog());

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SYSTEM = { type: "system" as const, id: "notifications", name: "Link delivery" };

describe("recipient validation", () => {
  it("accepts E.164 numbers (with common formatting) and rejects everything else", () => {
    expect(normalisePhone("+447700900123")).toBe("+447700900123");
    expect(normalisePhone(" +44 7700 900-123 ")).toBe("+447700900123");
    expect(normalisePhone("+1 (415) 555-0100")).toBe("+14155550100");
    for (const bad of ["07700900123", "+0447700900123", "+44", "+44770090012345678", "+44abc7700900", ""]) expect(normalisePhone(bad)).toBeNull();
  });

  it("validates email addresses conservatively", () => {
    expect(normaliseEmail(" jane.doe+va@example.co.uk ")).toBe("jane.doe+va@example.co.uk");
    for (const bad of ["jane", "jane@", "@example.com", "jane@example", "ja ne@example.com", "jane@@example.com", "a..b@example.com", "<x>@example.com"]) expect(normaliseEmail(bad)).toBeNull();
  });

  it("parses deliverTo bodies", () => {
    expect(parseDeliverTo(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseDeliverTo({ sms: "", email: "" })).toEqual({ ok: true, value: undefined });
    expect(parseDeliverTo({ sms: "+44 7700 900123", email: "a@b.co" })).toEqual({ ok: true, value: { sms: "+447700900123", email: "a@b.co" } });
    expect(parseDeliverTo({ sms: "07700900123" })).toMatchObject({ ok: false, error: expect.stringMatching(/international format/) });
    expect(parseDeliverTo({ email: "nope" })).toMatchObject({ ok: false });
    expect(parseDeliverTo(["x"])).toMatchObject({ ok: false });
  });

  it("masks recipients for audit records", () => {
    expect(maskPhone("+447700900123")).toBe("+44•••••••123");
    expect(maskEmail("jane.doe@example.com")).toBe("j•••@example.com");
  });
});

describe("Twilio SMS adapter", () => {
  it("posts a form-encoded message with basic auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { sid: "SM123", status: "queued" }));
    const p = new TwilioSmsProvider({ accountSid: "AC1", authToken: "secret", from: "+15005550006" }, fetchMock);
    const r = await p.sendSms({ to: "+447700900123", body: "Hello https://x/assist/t" });
    expect(r).toEqual({ ok: true, providerMessageId: "SM123", status: "queued" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("AC1:secret").toString("base64")}`);
    const form = new URLSearchParams(init.body);
    expect(form.get("To")).toBe("+447700900123");
    expect(form.get("From")).toBe("+15005550006");
    expect(form.get("Body")).toContain("https://x/assist/t");
  });

  it("uses a Messaging Service SID when TWILIO_FROM starts with MG", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { sid: "SM1" }));
    await new TwilioSmsProvider({ accountSid: "AC1", authToken: "t", from: "MG999" }, fetchMock).sendSms({ to: "+447700900123", body: "x" });
    const form = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(form.get("MessagingServiceSid")).toBe("MG999");
    expect(form.get("From")).toBeNull();
  });

  it("reports API errors and network failures without throwing", async () => {
    const rejected = await new TwilioSmsProvider({ accountSid: "AC1", authToken: "t", from: "+1" }, vi.fn().mockResolvedValue(jsonResponse(400, { code: 21211, message: "Invalid 'To' Phone Number" }))).sendSms({ to: "+447700900123", body: "x" });
    expect(rejected).toMatchObject({ ok: false, error: expect.stringContaining("21211") });
    const down = await new TwilioSmsProvider({ accountSid: "AC1", authToken: "t", from: "+1" }, vi.fn().mockRejectedValue(new Error("ECONNRESET"))).sendSms({ to: "+447700900123", body: "x" });
    expect(down).toMatchObject({ ok: false, error: expect.stringContaining("ECONNRESET") });
  });

  it("is only enabled when all three env vars are set", () => {
    expect(TwilioSmsProvider.fromEnv({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" })).toBeUndefined();
    expect(TwilioSmsProvider.fromEnv({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+1" })).toBeInstanceOf(TwilioSmsProvider);
  });
});

describe("email adapter (Resend-style HTTP API)", () => {
  it("posts JSON with a bearer key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "em_1" }));
    const p = new ResendEmailProvider({ apiKey: "re_key", from: "Support <s@example.com>" }, fetchMock);
    const r = await p.sendEmail({ to: "a@b.co", subject: "Link", text: "Body" });
    expect(r).toMatchObject({ ok: true, providerMessageId: "em_1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body)).toEqual({ from: "Support <s@example.com>", to: ["a@b.co"], subject: "Link", text: "Body" });
  });

  it("reports API errors", async () => {
    const r = await new ResendEmailProvider({ apiKey: "k", from: "f@x.co" }, vi.fn().mockResolvedValue(jsonResponse(422, { message: "Invalid from" }))).sendEmail({ to: "a@b.co", subject: "s", text: "t" });
    expect(r).toMatchObject({ ok: false, error: "Email API 422: Invalid from" });
  });
});

describe("notification service", () => {
  function runtime() {
    return new SessionRuntime(new MockReasoningProvider({ utteranceMs: 0, visionMs: 0 }), new MockToolExecutor({ default: 0 }));
  }

  it("falls back to the console outbox when no providers are configured", () => {
    const s = NotificationService.fromEnv({});
    expect(s.status()).toEqual({ sms: { provider: "console", simulated: true }, email: { provider: "console", simulated: true } });
    const live = NotificationService.fromEnv({ TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+1", RESEND_API_KEY: "k", EMAIL_FROM: "f@x.co" }, vi.fn());
    expect(live.status()).toEqual({ sms: { provider: "twilio", simulated: false }, email: { provider: "resend", simulated: false } });
  });

  it("sends the link, audits each attempt with masked recipients and never audits the link", async () => {
    const rt = runtime();
    const { id, token } = rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string) => (url.includes("twilio") ? jsonResponse(201, { sid: "SM9", status: "queued" }) : jsonResponse(500, { message: "down" })));
    const s = NotificationService.fromEnv({ TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+1", RESEND_API_KEY: "k", EMAIL_FROM: "f@x.co" }, fetchMock);
    const seq = rt.snapshot(id)!.state.seq;
    const link = `https://va.example.com/assist/${token}`;
    const results = await s.deliverSessionLink(rt, id, link, { sms: "+447700900123", email: "jane@example.com" }, SYSTEM);

    expect(results).toEqual([
      expect.objectContaining({ channel: "sms", ok: true, provider: "twilio", to: "+44•••••••123", providerMessageId: "SM9" }),
      expect.objectContaining({ channel: "email", ok: false, provider: "resend", to: "j•••@example.com" }),
    ]);
    const smsBody = new URLSearchParams(fetchMock.mock.calls.find((c) => String(c[0]).includes("twilio"))![1].body).get("Body")!;
    expect(smsBody).toContain(link);
    expect(smsBody).toContain("X Telecom");

    const state = rt.snapshot(id)!.state;
    expect(state.seq).toBe(seq + 2);
    const audit = state.audit.filter((a) => a.eventType.startsWith("notification."));
    expect(audit.map((a) => a.eventType)).toEqual(["notification.sent", "notification.failed"]);
    expect(audit[0]).toMatchObject({ actorType: "system", payload: { channel: "sms", to: "+44•••••••123", provider: "twilio", simulated: false } });
    const serialised = JSON.stringify(audit);
    expect(serialised).not.toContain(token);
    expect(serialised).not.toContain("7700900123");
    expect(serialised).not.toContain("jane@");
    expect(s.counts.get("sms|sent")).toBe(1);
    expect(s.counts.get("email|failed")).toBe(1);
  });

  it("records simulated deliveries in the outbox", async () => {
    const rt = runtime();
    const { id } = rt.create({ workflowId: "wf_router_v3", channel: "sms", customerLabel: "Acct", scenario: "power_cycle_fix" });
    const outbox = new ConsoleNotificationProvider();
    const s = new NotificationService(outbox, outbox, outbox);
    const [r] = await s.deliverSessionLink(rt, id, "https://x/assist/abc", { email: "a@b.co" }, SYSTEM);
    expect(r).toMatchObject({ ok: true, simulated: true, provider: "console" });
    expect(outbox.outbox[0]).toMatchObject({ channel: "email", to: "a@b.co" });
    expect(outbox.outbox[0].body).toContain("https://x/assist/abc");
  });
});
