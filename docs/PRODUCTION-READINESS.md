# Production Readiness — Server Edition
## Absolute Intelligence Visual Assist

**Last updated:** 2026-10-12
**Scope:** how to configure and run the server edition durably on a single instance, what each environment variable does, and what is observable. Related specs: `07-NON-FUNCTIONAL-REQUIREMENTS.md`, `10-OPERATIONS-AND-SUPPORT.md`, `IMPLEMENTATION-PLAN.md`, `INTEGRATION-CONTRACT.md`.

The static demo edition (`npm run build:static`, GitHub Pages) runs entirely in the browser and ignores everything in this document.

---

## 1. Run it durably

```bash
npm ci
npm run build                      # build WITHOUT DATA_DIR set
DATA_DIR=./data npm start          # http://localhost:3000
```

- On first start the data directory is empty, so demo history is generated and written to it. On every later start the stored sessions are loaded instead, and nothing is re-seeded.
- To start clean, stop the server and delete the data directory.
- Back up by copying the directory while the server is stopped (or snapshot the volume). Every file is written to a temporary file and renamed into place, so a copy taken while running only ever contains whole files.
- Run one instance per data directory. The file store is not shared-safe across processes; multi-instance needs the Postgres adapter (§4).
- Behind a reverse proxy, set `PUBLIC_BASE_URL` so links sent by SMS/email point at the public host.

Container sketch:

```bash
docker run -p 3000:3000 -e DATA_DIR=/data -v va-data:/data \
  -e ANTHROPIC_API_KEY=… -e PUBLIC_BASE_URL=https://assist.example.com  <image>
```

---

## 2. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | unset → in-memory | Directory for the file store. Unset keeps today's behaviour: nothing survives a restart. |
| `PERSIST_DEBOUNCE_MS` | `250` | Longest a committed change waits before it is written. Pending writes are also flushed synchronously on process exit. |
| `ANTHROPIC_API_KEY` | unset | Enables **Live AI** sessions on Claude. Without it every session uses the simulator. `ANTHROPIC_AUTH_TOKEN` also works. |
| `VISUAL_ASSIST_MODEL` | `claude-opus-5-5` | Model for live sessions. Must appear in `MODEL_PRICES_USD` (`lib/domain/pricing.ts`) for costs to be *measured*; unknown models fall back to estimated unit rates. |
| `USD_TO_GBP` | `0.79` | Conversion applied to measured model costs (list prices are USD). |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | unset | All three enable SMS link delivery through Twilio. `TWILIO_FROM` is an E.164 number or a Messaging Service SID (`MG…`). |
| `RESEND_API_KEY`, `EMAIL_FROM` | unset | Both enable email link delivery through a Resend-style HTTP API (`POST /emails`). `EMAIL_FROM` must be a verified sender. |
| `ELEVENLABS_API_KEY` | unset | Enables live British text-to-speech (`POST /api/tts`) for assistant and agent lines that have no pre-recorded clip. Without it, recorded clips in `public/voice` are used where available and the browser's en-GB voice otherwise. |
| `ELEVENLABS_VOICE_ID`, `ELEVENLABS_AGENT_VOICE_ID`, `ELEVENLABS_AGENT_VOICE_ID_MALE`, `ELEVENLABS_MODEL` | British defaults | Override the assistant voice (Clarice), the female and male agent voices (Grace, James) and the model (`eleven_turbo_v2_5`). |
| `PUBLIC_BASE_URL` | request origin | Origin used to build the customer link sent by SMS/email, e.g. `https://assist.example.com`. |
| `METRICS_TOKEN` | unset | When set, `/api/metrics` requires `Authorization: Bearer <token>`. |
| `LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error`. |
| `LOG_FORMAT` | JSON | `pretty` for compact human-readable lines in development. |
| `AUTH_SECRET` | — | Reserved for agent/admin sign-in (owned by the auth workstream). Set a long random value in every deployed environment. |
| `NEXT_PUBLIC_BASE_PATH` | empty | Path prefix when served under a sub-path. Build-time. |
| `INTEGRATIONS_CONFIG` | unset → every tool simulated | JSON array (or `{ "connectors": [...] }`) of business-action connectors: `tenantId`, `tool`, `mode` (`simulated` \| `http`), `endpoint` (HTTPS; `http://localhost` only outside production), `secretRef`, `timeoutMs` (500–30000, default 8000), optional `includeScenarioSessions`, `system`. Overrides entries stored under `connectors` in `<DATA_DIR>/config.json`. See `INTEGRATION-CONTRACT.md` §9. |
| `INTEGRATION_SECRET_<TENANT>` | unset | Per-tenant HMAC-SHA256 signing secret (≥ 32 characters) for connector calls, e.g. `INTEGRATION_SECRET_NORTHLINE` for `tnt_northline`. Referenced by a connector's `secretRef`; never written to config, audit or logs. A missing secret makes that tenant's HTTP calls fail closed (`secret_missing`). |

Secrets (`ANTHROPIC_API_KEY`, `TWILIO_AUTH_TOKEN`, `RESEND_API_KEY`, `METRICS_TOKEN`, `AUTH_SECRET`, `INTEGRATION_SECRET_*`) belong in the platform's secret store, never in the repository or `.env` files that are committed.

---

## 3. What each capability does

### 3.1 Persistence (`lib/server/store/`)

- `SessionStore` interface: `load`, `saveSession`, `saveFrame`, `deleteSession`, `status`, plus optional `readFrameSync` (lazy frame reads) and `saveSessionSync` (exit flush).
- `MemorySessionStore` (default) and `FileSessionStore` (`DATA_DIR`):
  - `sessions/<id>.json` — one snapshot per session (state, customer token, pinned workflow id, live flag).
  - `frames/<sessionId>/<frameId>.bin` + `.json` — selected-evidence frames only; read from disk on demand.
- The runtime writes through on every commit (debounced per session); a newer sequence number always wins, so an out-of-order write can never roll a session back.
- Workflow and policy versions (including those published from the platform) and their config audit are saved to `<DATA_DIR>/config.json` and loaded before sessions. A session whose workflow version is missing is skipped and logged as `store.sessions_skipped`. The live preview relay is intentionally never stored.

### 3.2 Link delivery (`lib/server/notifications/`)

- `POST /api/sessions` accepts `deliverTo: { sms?: "+447700900123", email?: "name@example.com" }`. Phone numbers must be E.164 (common spacing/brackets are accepted and normalised); invalid input is rejected with 400 before a session is created.
- The test-session launcher (server edition only) has optional mobile and email fields.
- Without provider credentials, messages go to an in-memory **outbox** shown on **Platform → Integrations** and are marked *simulated*.
- Every attempt is written to the session audit as `notification.sent` / `notification.failed` with a **masked** recipient, provider and outcome. The link itself and full contact details are never written to audit or logs. The Integrations page's delivery log is built from these audit events, so it survives restarts.

### 3.3 Cost capture (`lib/domain/pricing.ts`)

- Live Claude calls read `usage` (input, output, cache-write and cache-read tokens) from each response. When a server-side fallback ran, each model's share is priced at that model's rate.
- Cost events carry `basis: "measured"` (token-priced) or `"estimated"` (unit rate). Simulated sessions and non-model costs (media, speech, tools) stay estimated. The Cost Centre and session detail label both.

### 3.4 Client integrations (`lib/integrations/`)

- `RoutingToolExecutor` picks the executor per tenant and tool. Without a connector, or with `mode: "simulated"`, the tool runs on the sandbox executor, as before. With `mode: "http"`, `HttpToolExecutor` POSTs the contract body to the client's endpoint.
- Every HTTP call carries an `Idempotency-Key` (the action id), `X-VA-Timestamp` and `X-VA-Signature` (`v1=` HMAC-SHA256 over `"<timestamp>.<body>"`). It has a per-connector timeout and makes one retry on a network error or 5xx only. Timeouts, 4xx and redirects are not retried.
- Responses are validated. Only the tool's declared result fields become workflow facts (`line_test.status`, …), and free text passes PII redaction.
- An invalid connector entry fails closed (`connector_invalid`) and never falls back to simulation. Invalid entries are logged at startup as `integration.connector_invalid`.
- Sessions started with a simulation scenario stay on the sandbox unless the connector sets `includeScenarioSessions: true`.
- Each call writes an `integration.called` audit event (provider, mode, status, latency, attempts, endpoint host, HTTP status, external reference, error code) and the log line `integration.called` or `integration.call_failed`. The event never includes secrets, bodies or URL paths.
- **Platform → Integrations** and each client page show read-only connector status: mode, endpoint host, whether the secret is set, timeout and the last call.
- The static demo build never reads `INTEGRATIONS_CONFIG` and always simulates.
- `scripts/reference-client-api.mjs` is a reference implementation of the client side to hand to client developers.

### 3.5 Observability

| Endpoint | Use |
|---|---|
| `GET /api/health?probe=live` | Liveness: 200 while the process serves. |
| `GET /api/health` | Readiness: 503 until stored sessions are loaded; then 200 with `status: ok` or `degraded` (unresolved store write error), store status, session counts, reasoning and notification provider modes. |
| `GET /api/metrics` | Prometheus text format: `va_sessions{status,live}`, `va_escalations_total{reason}`, `va_session_outcomes_total{outcome}`, `va_ai_resolution_ratio`, `va_escalation_ratio`, `va_queue_wait_seconds_avg`, `va_queue_waiting_sessions`, `va_queue_longest_wait_seconds`, `va_vision_latency_seconds` (from observations), `va_provider_call_duration_seconds{provider,model,operation,quantile}`, `va_provider_call_errors_total`, `va_provider_tokens_total{direction}`, `va_cost_gbp_total{category,basis}`, `va_notifications_total{channel,status,provider}`, `va_store_*`. |

Logs are one JSON object per line (`lib/server/log.ts`) with `ts`, `level`, `msg`, `requestId` (from `x-request-id` or minted) and `sessionId` where known. Customer link tokens are stripped from logged routes. Useful messages: `session.created`, `session.create_rejected`, `command.rejected`, `notification.recorded`, `notification.failed`, `provider.call_failed`, `integration.called`, `integration.call_failed`, `integration.connector_invalid`, `store.ready`, `store.save_failed`, `store.load_failed`.

Suggested alerts: `va_store_error == 1`; `va_store_pending_writes > 100` for 5 min; `rate(va_provider_call_errors_total[5m]) / rate(va_provider_call_duration_seconds_count[5m]) > 0.1`; `va_queue_longest_wait_seconds > 120` (docs/07 queue target); `va_notifications_total{status="failed"}` increasing.

---

## 4. Path to a database

The store interface is shaped for a Postgres adapter (table definitions are in `lib/server/store/types.ts`): `va_sessions` (one row per session, `state jsonb`, upsert only when `seq` is newer) and `va_frames` (`bytea` or an object-storage key, cascade on session delete). `load()` may be async; `runtimeReady()` in `lib/server/runtime.ts` resolves once loading finishes and `/api/health` reports 503 until then. Moving beyond one instance also needs the SSE fan-out replaced by a shared event bus (docs/07 §3).

---

## 5. Pre-go-live checklist

- [ ] `DATA_DIR` on a persistent, backed-up volume (or Postgres adapter in place).
- [ ] `PUBLIC_BASE_URL` set to the HTTPS origin customers will open.
- [ ] SMS/email credentials set and a test link received on a real handset; sender identity verified.
- [ ] `/api/health` wired to the load balancer; `/api/metrics` scraped with `METRICS_TOKEN`.
- [ ] Log shipping configured; `LOG_LEVEL=info`.
- [ ] `AUTH_SECRET` set; platform and console behind sign-in (auth workstream).
- [ ] Model and price table reviewed (`VISUAL_ASSIST_MODEL`, `MODEL_PRICES_USD`, `USD_TO_GBP`).
- [ ] Retention/deletion schedule agreed (retention workstream) — the file store keeps sessions until deleted.
- [ ] For each tenant going live on its own systems:
  - [ ] Client endpoints built to `INTEGRATION-CONTRACT.md`: signature check, idempotency, `{ status, result, externalRef }`.
  - [ ] Endpoints tested against the client's sandbox using `includeScenarioSessions`.
  - [ ] `INTEGRATIONS_CONFIG` set with HTTPS endpoints and realistic `timeoutMs` values.
  - [ ] `INTEGRATION_SECRET_<TENANT>` (≥ 32 characters) in the secret store and shared with the client out of band.
  - [ ] No connector shows *Misconfigured* or *Secret missing* on Platform → Integrations.
  - [ ] Each workflow step that calls a client system has an `onFailure` path, or relies on escalation by design.
  - [ ] An alert is set on `integration.call_failed` log volume.
  - [ ] A secret rotation is rehearsed: the client accepts both signatures during the switch.
