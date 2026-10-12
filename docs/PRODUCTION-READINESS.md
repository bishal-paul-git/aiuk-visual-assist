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
| `AUTH_SECRET` | random per process | 32+ random characters. Signs the session cookie and encrypts the single sign-on transaction cookie. Without it sessions do not survive a restart. |
| `OIDC_ISSUER` | unset → demo sign-in | Issuer URL of the organisation's identity provider; enables workforce single sign-on (§3.5). Must be HTTPS and match the `issuer` in its discovery document. Entra ID: `https://login.microsoftonline.com/<tenant-id>/v2.0`. Okta: `https://<org>.okta.com/oauth2/default` (or your custom authorization server). |
| `OIDC_CLIENT_ID` | — | Application (client) ID. Required with `OIDC_ISSUER`. |
| `OIDC_CLIENT_SECRET` | unset | Client secret (confidential web app). Omit only for a public client; PKCE is always used. |
| `OIDC_REDIRECT_URI` | `${PUBLIC_BASE_URL}/api/auth/callback` | Callback URL registered with the IdP. Falls back to the request origin when `PUBLIC_BASE_URL` is unset (development only). |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | `${PUBLIC_BASE_URL}/sign-in?signed_out=1` | Where the IdP returns the browser after sign-out. Register it with the IdP. |
| `OIDC_SCOPES` | `openid profile email` | Space- or comma-separated; `openid` is always added. |
| `OIDC_PROVIDER_NAME` | `SSO` | Button label: "Sign in with *Microsoft*". |
| `OIDC_ROLE_CLAIM` | `roles` | ID token claim carrying role values: `roles` for Entra app roles, `groups` for Okta groups. Dot paths (`realm_access.roles`) and namespaced claims (`https://example.com/roles`) work. |
| `OIDC_ROLE_MAP` | unset | JSON object, claim value → app role (`aiuk_admin`, `qa_reviewer`, `client_admin`, `supervisor`, `agent`). Unset: claim values must equal the role names. A user with several mapped roles gets the most privileged one. |
| `OIDC_TENANT_CLAIM` | unset | Claim carrying the client organisation, e.g. Entra `tid` or an Okta group/profile claim. Unset: the tenant comes from the matched catalog user. |
| `OIDC_TENANT_MAP` | unset | JSON object, claim value → tenant id (e.g. `{"<entra-tenant-id>":"tnt_northline"}`). Unset: claim values must equal tenant ids. |
| `OIDC_REQUIRE_MFA` | off | `1` refuses an ID token whose `amr` claim has none of `OIDC_MFA_AMR_VALUES`. |
| `OIDC_MFA_AMR_VALUES` | `mfa` | Comma-separated `amr` values that count as multi-factor. |
| `ALLOW_DEMO_SIGNIN` | off | With `OIDC_ISSUER` set, `1` keeps the password-less demo sign-in available as well. Never in production. |
| `NEXT_PUBLIC_BASE_PATH` | empty | Path prefix when served under a sub-path. Build-time. |
| `INTEGRATIONS_CONFIG` | unset → every tool simulated | JSON array (or `{ "connectors": [...] }`) of business-action connectors: `tenantId`, `tool`, `mode` (`simulated` \| `http`), `endpoint` (HTTPS; `http://localhost` only outside production), `secretRef`, `timeoutMs` (500–30000, default 8000), optional `includeScenarioSessions`, `system`. Overrides entries stored under `connectors` in `<DATA_DIR>/config.json`. See `INTEGRATION-CONTRACT.md` §9. |
| `INTEGRATION_SECRET_<TENANT>` | unset | Per-tenant HMAC-SHA256 signing secret (≥ 32 characters) for connector calls, e.g. `INTEGRATION_SECRET_NORTHLINE` for `tnt_northline`. Referenced by a connector's `secretRef`; never written to config, audit or logs. A missing secret makes that tenant's HTTP calls fail closed (`secret_missing`). |

Secrets (`ANTHROPIC_API_KEY`, `TWILIO_AUTH_TOKEN`, `RESEND_API_KEY`, `METRICS_TOKEN`, `AUTH_SECRET`, `OIDC_CLIENT_SECRET`, `INTEGRATION_SECRET_*`) belong in the platform's secret store, never in the repository or `.env` files that are committed.

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

### 3.5 Workforce sign-in (`lib/auth/oidc.ts`, `app/api/auth/*`)

Agents, supervisors and administrators sign in through the organisation's identity provider with OpenID Connect (docs/06 §2: SSO, MFA, RBAC, tenant isolation). Any issuer with `/.well-known/openid-configuration` works: Microsoft Entra ID, Okta, Auth0. Setup steps per IdP are in [DEPLOYMENT.md](DEPLOYMENT.md#workforce-single-sign-on-oidc).

- **Flow.** `GET /api/auth/sign-in?next=/console` → IdP → `GET /api/auth/callback`. Authorization Code with PKCE (S256), `state` and `nonce`. The attempt is kept for 10 minutes in an HttpOnly cookie encrypted and authenticated with a key derived from `AUTH_SECRET`, and is single use.
- **ID token validation** (`jose`): signature against the issuer's JWKS (asymmetric algorithms only; `none` and HMAC are refused), `iss` (from discovery, which must match `OIDC_ISSUER`), `aud` = client ID, `azp` when present or when there are several audiences, `exp` / `iat` / `nbf` with 60 s skew, `nonce`; and `amr` when `OIDC_REQUIRE_MFA=1`.
- **Who the user is.** Matched by email to a catalog user (unless the IdP marks the email unverified), otherwise provisioned just in time with a stable id derived from issuer + subject. Disabled or invited catalog users are refused.
- **Role and tenant.** Role: the most privileged role mapped from `OIDC_ROLE_CLAIM`; otherwise the matched catalog user's role. Tenant: platform roles (`aiuk_admin`, `qa_reviewer`) work across clients; other roles need exactly one tenant mapped from `OIDC_TENANT_CLAIM`, otherwise the matched catalog user's tenant. A user who cannot be mapped is refused and the sign-in page says why (no role, no organisation, MFA required, account inactive).
- **Session.** The usual signed `va_session` cookie (8 hours). Roles are re-read from the provider on every request, so a user disabled in the catalog loses access at once.
- **Sign-out** clears the session and, when the issuer advertises `end_session_endpoint`, sends the browser to it (RP-initiated logout, with `id_token_hint` when the token fits in a cookie).
- **Demo sign-in** is disabled while `OIDC_ISSUER` is set (unless `ALLOW_DEMO_SIGNIN=1`), and existing demo sessions stop working. An incomplete OIDC configuration (missing client ID, invalid JSON maps, unknown roles or tenants) stops the server answering authenticated requests rather than falling back to demo sign-in.
- **Security log.** `security.signed_in` (provider, session id, `amr`, whether the role and tenant came from claims or the catalog), `security.sign_in_failed` (error code and reason), `security.signed_out` (whether IdP logout followed). Shown in the platform audit explorer.
- **Limits.** Just-in-time users are held in memory: after a restart they sign in again (normally silently at the IdP), and multi-instance deployments need a shared user store. The static demo build ignores all of this and keeps its browser-only demo identities.

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
- [ ] `AUTH_SECRET` set (32+ random characters, from the secret store).
- [ ] `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` set; the redirect URI (`…/api/auth/callback`) and post-logout URI (`…/sign-in?signed_out=1`) registered with the IdP exactly as `PUBLIC_BASE_URL` produces them.
- [ ] Role mapping tested: one user per role signs in and lands on the right home page; a user with no assigned role is refused with the "no role" message.
- [ ] Tenant mapping tested: client users land in their own organisation only (`OIDC_TENANT_CLAIM` + `OIDC_TENANT_MAP`, or catalog users).
- [ ] MFA enforced at the IdP (conditional access / sign-on policy) and `OIDC_REQUIRE_MFA=1` set; a password-only sign-in is refused.
- [ ] `ALLOW_DEMO_SIGNIN` unset; `/sign-in` shows only "Sign in with …".
- [ ] Sign-out ends the IdP session (or the IdP's single-logout behaviour is understood and accepted).
- [ ] `security.*` audit events reach the SIEM / audit store.
- [ ] Client secret rotation scheduled (Entra secrets expire; Okta supports two active secrets).
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
