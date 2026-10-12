# Production Readiness — Server Edition
## Absolute Intelligence Visual Assist

**Last updated:** 2026-10-11
**Scope:** how to configure and run the server edition durably on a single instance, what each environment variable does, and what is observable. Related specs: `07-NON-FUNCTIONAL-REQUIREMENTS.md`, `10-OPERATIONS-AND-SUPPORT.md`, `IMPLEMENTATION-PLAN.md`.

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
| `ICE_SERVERS` | public STUN (`stun:stun.l.google.com:19302`) | JSON array of [RTCIceServer](https://developer.mozilla.org/docs/Web/API/RTCIceServer) for live video, e.g. `[{"urls":"stun:stun.example.com:3478"},{"urls":["turn:turn.example.com:3478?transport=udp","turns:turn.example.com:443?transport=tcp"],"username":"…","credential":"…"}]`. Invalid entries (and TURN entries without credentials) are dropped. See §3.5. |

Secrets (`ANTHROPIC_API_KEY`, `TWILIO_AUTH_TOKEN`, `RESEND_API_KEY`, `METRICS_TOKEN`, `AUTH_SECRET`, TURN credentials in `ICE_SERVERS`) belong in the platform's secret store, never in the repository or `.env` files that are committed.

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

### 3.4 Observability

| Endpoint | Use |
|---|---|
| `GET /api/health?probe=live` | Liveness: 200 while the process serves. |
| `GET /api/health` | Readiness: 503 until stored sessions are loaded; then 200 with `status: ok` or `degraded` (unresolved store write error), store status, session counts, reasoning and notification provider modes. |
| `GET /api/metrics` | Prometheus text format: `va_sessions{status,live}`, `va_escalations_total{reason}`, `va_session_outcomes_total{outcome}`, `va_ai_resolution_ratio`, `va_escalation_ratio`, `va_queue_wait_seconds_avg`, `va_queue_waiting_sessions`, `va_queue_longest_wait_seconds`, `va_vision_latency_seconds` (from observations), `va_provider_call_duration_seconds{provider,model,operation,quantile}`, `va_provider_call_errors_total`, `va_provider_tokens_total{direction}`, `va_cost_gbp_total{category,basis}`, `va_notifications_total{channel,status,provider}`, `va_store_*`. |

Logs are one JSON object per line (`lib/server/log.ts`) with `ts`, `level`, `msg`, `requestId` (from `x-request-id` or minted) and `sessionId` where known. Customer link tokens are stripped from logged routes. Useful messages: `session.created`, `session.create_rejected`, `command.rejected`, `notification.recorded`, `notification.failed`, `provider.call_failed`, `store.ready`, `store.save_failed`, `store.load_failed`.

Suggested alerts: `va_store_error == 1`; `va_store_pending_writes > 100` for 5 min; `rate(va_provider_call_errors_total[5m]) / rate(va_provider_call_duration_seconds_count[5m]) > 0.1`; `va_queue_longest_wait_seconds > 120` (docs/07 queue target); `va_notifications_total{status="failed"}` increasing.

### 3.5 Live video (`lib/media/live-call.ts`, `lib/client/live-call.ts`, `lib/server/signal-relay.ts`)

While a human agent is with the customer, the customer's camera video and microphone go to the agent console over WebRTC, and the agent's microphone goes back to the customer. The call starts only when there is an active `human_agent` participant, the customer has consented and the camera is on; it stops when the agent leaves, the camera is turned off or the session ends. Video is not recorded or retained (docs/06 §3): media flows peer to peer (or through TURN, which relays encrypted packets it cannot read).

- **Signalling.** Offers, answers and ICE candidates are relayed by `GET|POST /api/sessions/{id}/rtc` (agent, needs `session.join` and must be the agent the customer is with) and `GET|POST /api/assist/{token}/rtc` (customer). `GET` is an SSE stream of messages for that side. Messages are validated, rate limited, and held only while they are fanned out: they never enter the session audit, transcript or store. Like the session runtime, the relay is in-process; more than one instance needs sticky sessions or a shared pub/sub in its place.
- **ICE servers.** `GET /api/sessions/{id}/rtc/ice` and `GET /api/assist/{token}/rtc/ice` serve `ICE_SERVERS` to authorised clients only, so TURN credentials never ship in the client bundle. The static demo uses public STUN only.
- **TURN.** Without TURN, calls fail on symmetric NAT and strict corporate or mobile networks (often 10–20% of real calls). Use one of:
  - *Twilio Network Traversal Service*: mint short-lived credentials with the Tokens API (`POST /2010-04-01/Accounts/{sid}/Tokens.json`) and put its `ice_servers` in `ICE_SERVERS`, rotating before the TTL (default 24 h).
  - *Cloudflare Calls TURN*: create a TURN key in the dashboard and generate short-lived credentials with its API; it returns ready-made `iceServers` for `turn.cloudflare.com` (UDP/TCP 3478, TLS 5349 and 443).
  - *Self-hosted coturn*: run it with `use-auth-secret` and a `static-auth-secret`, open UDP 3478, TCP/TLS 5349 (or 443) and the relay port range, and issue time-limited REST-API credentials.

  Long-lived static credentials are acceptable for a pilot; for production, rotate them (a small job that rewrites `ICE_SERVERS` and restarts, or an extension of the `ice` endpoint that mints per-request credentials).
- **Fallback.** If the browser has no WebRTC, or the connection fails three times (15 s connect timeout each), the console shows **Fallback: snapshots** and the low-rate preview relay (`/preview`, one JPEG a second, live only) carries on; the agent can press *Retry live video*. The relay pauses while the call is live.
- **UI.** The console shows **Connecting**, **Live** or **Fallback: snapshots** on the video, with a microphone mute. The customer sees **Agent can see your camera** and can mute from that badge or the control bar.

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
- [ ] `ICE_SERVERS` includes a TURN service (with rotated credentials) and a live call tested from a phone on mobile data to a console on the corporate network.
- [ ] Model and price table reviewed (`VISUAL_ASSIST_MODEL`, `MODEL_PRICES_USD`, `USD_TO_GBP`).
- [ ] Retention/deletion schedule agreed (retention workstream) — the file store keeps sessions until deleted.
