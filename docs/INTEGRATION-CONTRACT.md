# Client Integration Contract — Business Actions
## Absolute Intelligence Visual Assist

**Last updated:** 2026-10-12
**Contract version:** `2026-10-01` (sent as `X-VA-Contract-Version`)
**Audience:** the client's integration developers, and platform engineers configuring a tenant.
**Related:** `02-SYSTEM-ARCHITECTURE.md` §4 (business automation outside the media loop), `05-AI-AND-WORKFLOW-SPEC.md` (business-action steps and tool results), `06-SECURITY-PRIVACY-COMPLIANCE.md` (secrets, audit, redaction), `PRODUCTION-READINESS.md` §2 and §5.

The AI and human agents run business actions such as `line_test`, `create_ticket` and `book_engineer`. Each action is policy-checked first. Only after the policy allows it does the platform call the client's system through this contract. You build one small HTTPS endpoint per tool, usually as a thin adapter in front of a system you already run.

A working reference implementation is in `scripts/reference-client-api.mjs`. It is a plain Node server with no dependencies that verifies signatures and handles idempotency.

---

## 1. Endpoints per tool

Each tool is configured with its own URL, so one tool can go to your CRM and another to your network OSS. A typical layout is `POST https://<your-host>/visual-assist/tools/<tool>`.

| Tool | Typical target system | Result fields used by workflows | Required |
|---|---|---|---|
| `line_test` | Line-test or OSS API (network diagnostics) | `status` (`fault_detected` \| `no_fault`), `detail`, `testId` | `status` |
| `create_ticket` | Ticketing: ServiceNow, Zendesk, Salesforce Service Cloud | `ticketId`, `queue` | `ticketId` |
| `update_case` | CRM case: Salesforce Service Cloud, Dynamics 365 | `caseId`, `status` | `caseId` |
| `book_engineer` | Field-service booking (e.g. Salesforce Field Service, ServiceNow FSM, an in-house workforce scheduler) | `jobId`, `slot` | `jobId`, `slot` |
| `send_sms_summary` | Messaging gateway | `messageId`, `delivered` (boolean) | `messageId` |
| `order_replacement_router` | Order management / logistics | `orderId`, `dispatch` | `orderId` |
| `issue_account_credit` | Billing | `creditId`, `amount` | `creditId` |
| `attach_claim_evidence` | Claims platform | `claimId`, `attachmentId` | `claimId` |

Policy decides which tools a tenant may run and who may run them (`allow`, `human_only` or `deny`). A tool that policy denies is never sent to your endpoint.

---

## 2. Request

`POST <endpoint>` with `Content-Type: application/json`.

Headers:

| Header | Value |
|---|---|
| `Idempotency-Key` | The platform's action id, e.g. `act_3f2a9c1b7d4e`. It stays the same on a retry. |
| `X-VA-Timestamp` | Unix time in seconds when this attempt was signed. |
| `X-VA-Signature` | `v1=<hex>`. See §4. |
| `X-VA-Contract-Version` | `2026-10-01` |

Body:

```json
{
  "tool": "line_test",
  "params": { "depth": "standard" },
  "sessionId": "ses_8c1d2e3f",
  "actionId": "act_3f2a9c1b7d4e",
  "tenantId": "tnt_northline",
  "requestedBy": "ai"
}
```

- `params` are the step's configured parameters (for AI-run steps) or what the agent entered (for human-run actions). They are strings, numbers or booleans.
- `requestedBy` is `ai` or `human`.
- `tenantId` is always the tenant the session belongs to. Reject any other value.
- The body carries no customer contact details. Look the customer up in your own system by `sessionId` or by the case already linked to it.

---

## 3. Response

Return HTTP `200` with a JSON body:

```json
{
  "status": "succeeded",
  "result": { "status": "fault_detected", "detail": "loss of sync at street cabinet", "testId": "LT-482913" },
  "externalRef": "LT-482913"
}
```

A business failure is a successful HTTP exchange that reports `failed`:

```json
{ "status": "failed", "result": { "code": "no_capacity" }, "externalRef": "REQ-99120" }
```

| Field | Rules |
|---|---|
| `status` | `"succeeded"` or `"failed"`. Anything else is an invalid response. |
| `result` | An object. When the status is succeeded, it must contain the tool's required fields (§1). Fields not listed for the tool are ignored. When the status is failed, `result.code` (`[A-Za-z0-9_.-]{1,64}`) is recorded. |
| `externalRef` | Optional. Your reference, up to 128 characters from `A-Z a-z 0-9 . _ : / # -`. It is shown to agents and written to the audit. |

Keep responses under 64 KB. Do not put personal data in `result`. Free-text fields still pass the platform's PII redaction (`lib/privacy/redact.ts`) before they are stored.

---

## 4. Signature verification

Each tenant has one shared secret of at least 32 characters. Generate it with `openssl rand -hex 32` and exchange it out of band. The platform signs every attempt like this:

```
signed_payload = X-VA-Timestamp + "." + <raw request body>
X-VA-Signature = "v1=" + hex(HMAC_SHA256(secret, signed_payload))
```

To verify, your endpoint must:

1. Read the raw body bytes before you parse the JSON.
2. Reject the request if `X-VA-Timestamp` is more than 300 seconds from your clock.
3. Compute the HMAC and compare it with a constant-time function (`crypto.timingSafeEqual`, `hmac.compare_digest`, `MessageDigest.isEqual`). Today the platform sends one `v1=` value. Parse the header as a comma-separated list anyway and accept the request if any `v1=` entry matches, so the header can change later without breaking you. During a secret rotation, check the signature against both the old and the new secret until the platform has switched.
4. Return `401` when the signature is wrong. Do not explain why.

Node, from the reference server:

```js
const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
const got = Buffer.from(signatureHeader.slice(3), "hex"); // strip "v1="
const ok = got.length === expected.length && timingSafeEqual(got, expected);
```

The platform keeps the secret in an environment variable that the connector names by reference (`INTEGRATION_SECRET_<TENANT>`). The secret never appears in configuration files, the audit trail, logs or the UI.

---

## 5. Idempotency

- `Idempotency-Key` is the action id. If you receive a key you have already handled, return the stored response and do not repeat the side effect. This covers a second ticket, a second booking and a second credit.
- If the key is reused with a different body, return `409`.
- Keep keys for at least 24 hours.
- The platform blocks duplicate actions itself as well. The same session, step, tool and parameters are never requested twice (`tool.duplicate_blocked`). Your idempotency check covers the network-level retry described in §6.

---

## 6. Timeouts and retries

| Situation | What the platform does |
|---|---|
| No response within the connector's `timeoutMs` (default 8000 ms, range 500–30000 ms) | Gives up on the call. **It does not retry a timeout**, because your system may still be processing the request. The action fails with `timeout`. |
| Network error (connection refused or reset, DNS failure, TLS failure) | Retries **once** after 250 ms with the same `Idempotency-Key` and body, and a fresh timestamp and signature. |
| HTTP `5xx` | Retries **once** in the same way. |
| HTTP `4xx` (including `401` and `409`) | No retry. The action fails with `http_<status>`. |
| Redirect (`3xx`) | The platform does not follow it. The action fails. |
| `200` with an invalid body | No retry. The action fails with `invalid_response`. |
| `200` with `"status": "failed"` | No retry. The action fails with your `result.code` (or `client_failed`). |

Keep `line_test` under about 3 seconds at p95. Business actions run outside the real-time voice and video loop, but the customer is waiting for the result.

---

## 7. How results reach the workflow

On success, each field the tool accepts becomes a workflow fact named `<tool>.<field>`. For example, `line_test.status = fault_detected`. Workflow branch rules read these facts. The router troubleshooting workflow branches like this:

```
when tool_result line_test.status in [fault_detected] → escalate_network   ("Line fault found")
when tool_result line_test.status in [no_fault]       → escalate_unresolved ("No line fault")
```

On failure, the step follows its `onFailure` path. If the step has none, the session is escalated to a human with reason `workflow_failure`. The session itself keeps running. Agents see the action, its status, the short error and your `externalRef` in the console.

---

## 8. Audit

Every call adds an `integration.called` event to the session audit, containing:

```json
{ "toolActionId": "act_3f2a9c1b7d4e", "tool": "line_test", "provider": "http", "mode": "http",
  "status": "succeeded", "latencyMs": 412, "attempts": 1, "endpointHost": "ops.northline.example",
  "httpStatus": 200, "externalRef": "LT-482913" }
```

The event records no secrets, request bodies, raw responses, URL paths or query strings. The following `tool.completed` event holds only the validated result fields. Simulated (sandbox) calls are recorded the same way with `"mode": "simulated"`.

---

## 9. Platform configuration

Connectors are set per tenant and per tool. Any tenant and tool without a connector uses the simulated sandbox, which is the default.

```bash
INTEGRATIONS_CONFIG='[
  { "tenantId": "tnt_northline", "tool": "line_test", "mode": "http",
    "endpoint": "https://ops.northline.example/visual-assist/tools/line_test",
    "secretRef": "INTEGRATION_SECRET_NORTHLINE", "timeoutMs": 5000, "system": "Northline NetOps" },
  { "tenantId": "tnt_northline", "tool": "create_ticket", "mode": "http",
    "endpoint": "https://northline.service-now.example/api/x_va/tools/create_ticket", "system": "ServiceNow" }
]'
INTEGRATION_SECRET_NORTHLINE=<64 hex chars from your secret store>
```

| Field | Rules |
|---|---|
| `tenantId`, `tool` | Required. There is one connector per pair. |
| `mode` | `simulated` (the default) or `http`. |
| `endpoint` | Required for `http`. Must use `https://`. `http://localhost` and `127.0.0.1` are accepted only outside production. URLs that contain credentials are refused. |
| `secretRef` | Must name an `INTEGRATION_SECRET_*` variable. Defaults to `INTEGRATION_SECRET_<TENANT>`, for example `INTEGRATION_SECRET_NORTHLINE` for `tnt_northline`. A `secret` field in the config is rejected. |
| `timeoutMs` | 500–30000 ms. Defaults to 8000 ms. |
| `includeScenarioSessions` | Defaults to `false`. Sessions started with a simulation scenario use the sandbox unless this is `true`, which is useful for pointing test sessions at your sandbox endpoint. |
| `system` | Optional label shown on the Integrations page. |

- Connectors can also be stored in `<DATA_DIR>/config.json` under `connectors`. `INTEGRATIONS_CONFIG` overrides a stored entry for the same tenant and tool.
- An invalid entry is never quietly simulated. Calls for that tenant and tool fail with `connector_invalid`, the error is logged at startup, and the Integrations page shows the connector as *Misconfigured*.
- If the referenced secret is missing or shorter than 32 characters, calls fail with `secret_missing` and nothing is sent.
- The static demo edition (GitHub Pages) ignores all of this and always uses the sandbox.

**Platform → Integrations** and **Platform → Clients → <client>** show each tool's mode, endpoint host, whether its secret is set, its timeout, and its last call (outcome, latency and external reference). The display is read-only.

---

## 10. Testing locally

```bash
export INTEGRATION_SECRET_NORTHLINE=$(openssl rand -hex 32)
INTEGRATION_SECRET=$INTEGRATION_SECRET_NORTHLINE REFERENCE_TENANT_ID=tnt_northline \
  node scripts/reference-client-api.mjs            # listens on :4010

INTEGRATIONS_CONFIG='[{"tenantId":"tnt_northline","tool":"create_ticket","mode":"http",
  "endpoint":"http://localhost:4010/tools/create_ticket","includeScenarioSessions":true}]' npm run dev
```

Start a test session for Northline, take it over as an agent and run **Create ticket**. The action shows an `INC…` reference, and the audit records `integration.called`. Set `REFERENCE_LINE_TEST=no_fault` on the reference server to drive the other `line_test` branch. A `book_engineer` call with `priority: same_day` shows a business failure (`no_capacity`).

`tests/integrations.test.ts` covers signing, the idempotency header, the timeout, the single retry, invalid responses, mode routing and HTTPS-only validation. It also runs end-to-end tests against the reference server.
