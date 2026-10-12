// Reference client API for Visual Assist business actions.
//
// A minimal, dependency-free Node server that implements the integration
// contract (docs/INTEGRATION-CONTRACT.md) so a client's developers can see
// exactly what to build in front of their CRM, ticketing, field-service or
// line-test systems. It is deliberately small: replace the `handlers` with
// calls into your own systems.
//
// Run:
//   INTEGRATION_SECRET=$(openssl rand -hex 32) node scripts/reference-client-api.mjs
// Then point a connector at it (dev only; production endpoints must be HTTPS):
//   INTEGRATIONS_CONFIG='[{"tenantId":"tnt_northline","tool":"line_test","mode":"http",
//     "endpoint":"http://localhost:4010/tools/line_test","secretRef":"INTEGRATION_SECRET_NORTHLINE"}]'
//   INTEGRATION_SECRET_NORTHLINE=<same secret> npm run dev
//
// What it demonstrates:
//   1. Signature verification: HMAC-SHA256 over "<X-VA-Timestamp>.<raw body>",
//      constant-time compare, and a 5-minute timestamp tolerance.
//   2. Idempotency: the Idempotency-Key (the platform's action id) returns the
//      stored response on a repeat; reuse with a different body is a 409.
//   3. The response shape: { status: "succeeded" | "failed", result, externalRef }.

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const TOLERANCE_SEC = 300;
const MAX_BODY_BYTES = 64 * 1024;

/** Verify X-VA-Signature ("v1=<hex>") against the raw body. */
export function verify(secret, signatureHeader, timestamp, rawBody, nowSec = Math.floor(Date.now() / 1000)) {
  if (!signatureHeader || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSec - Number(timestamp)) > TOLERANCE_SEC) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return signatureHeader
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("v1="))
    .some((p) => {
      const got = Buffer.from(p.slice(3), "hex");
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
}

const shortRef = (id) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String(h % 1_000_000).padStart(6, "0");
};

/**
 * One handler per tool. Each returns the contract response. Replace these with
 * calls into your systems (Salesforce Service Cloud, ServiceNow, Zendesk,
 * a field-service scheduler, the network OSS line-test API).
 */
export const handlers = {
  line_test: (req, opts) => {
    const ref = `LT-${shortRef(req.actionId)}`;
    const status = opts.lineTestResult ?? "fault_detected";
    return {
      status: "succeeded",
      result: { status, detail: status === "fault_detected" ? "loss of sync at street cabinet" : "line in sync, 67/18 Mbps", testId: ref },
      externalRef: ref,
    };
  },
  create_ticket: (req) => {
    const ref = `INC${shortRef(req.actionId)}`;
    return { status: "succeeded", result: { ticketId: ref, queue: "network_l2" }, externalRef: ref };
  },
  update_case: (req) => {
    const ref = `CS-${shortRef(req.sessionId)}`;
    return { status: "succeeded", result: { caseId: ref, status: String(req.params.status ?? "updated") }, externalRef: ref };
  },
  book_engineer: (req) => {
    if (req.params.priority === "same_day") return { status: "failed", result: { code: "no_capacity" } };
    const ref = `JOB-${shortRef(req.actionId)}`;
    return { status: "succeeded", result: { jobId: ref, slot: "Tue 14 Oct, 08:00–13:00" }, externalRef: ref };
  },
  send_sms_summary: (req) => ({ status: "succeeded", result: { messageId: `SMS-${shortRef(req.actionId)}`, delivered: true } }),
};

function send(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

/**
 * Create the reference server. `secret` is the tenant's shared signing secret.
 * Optional `tenantId` rejects calls for any other tenant.
 */
export function createReferenceServer({ secret, tenantId, lineTestResult, log = () => {} } = {}) {
  if (!secret || secret.length < 32) throw new Error("A signing secret of at least 32 characters is required");
  /** Idempotency-Key -> { body, response }. Use a durable store with a TTL (e.g. 24 h) in production. */
  const seen = new Map();

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
    const match = /^\/tools\/([a-z][a-z0-9_]{0,63})$/.exec(url.pathname);
    if (req.method !== "POST" || !match) return send(res, 404, { error: "not_found" });

    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) req.destroy();
      else chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");

      // 1. Authenticate before parsing anything.
      if (!verify(secret, req.headers["x-va-signature"], req.headers["x-va-timestamp"], raw)) {
        log("rejected: bad signature");
        return send(res, 401, { error: "invalid_signature" });
      }

      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: "invalid_json" });
      }
      const tool = match[1];
      if (body.tool !== tool || typeof body.actionId !== "string" || typeof body.sessionId !== "string" || typeof body.params !== "object" || body.params === null) {
        return send(res, 400, { error: "invalid_request" });
      }
      if (tenantId && body.tenantId !== tenantId) return send(res, 403, { error: "wrong_tenant" });
      const key = req.headers["idempotency-key"];
      if (!key || key !== body.actionId) return send(res, 400, { error: "idempotency_key_required" });

      // 2. Idempotency: same key -> same response; same key, different body -> conflict.
      const prior = seen.get(key);
      if (prior) {
        // The platform re-sends the identical body on a retry (only the timestamp and signature headers change).
        if (prior.body !== raw) return send(res, 409, { error: "idempotency_key_reused" });
        log(`replay ${tool} ${key}`);
        return send(res, 200, prior.response);
      }

      const handler = handlers[tool];
      if (!handler) return send(res, 404, { error: "unknown_tool" });

      // 3. Do the work and answer with the contract shape.
      const response = handler(body, { lineTestResult });
      seen.set(key, { body: raw, response });
      log(`${tool} ${key} -> ${response.status}`);
      return send(res, 200, response);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.PORT ?? 4010);
  const server = createReferenceServer({
    secret: process.env.INTEGRATION_SECRET,
    tenantId: process.env.REFERENCE_TENANT_ID,
    lineTestResult: process.env.REFERENCE_LINE_TEST,
    log: (m) => console.log(`[reference-client-api] ${m}`),
  });
  server.listen(port, () => console.log(`[reference-client-api] listening on http://localhost:${port}/tools/<tool>`));
}
