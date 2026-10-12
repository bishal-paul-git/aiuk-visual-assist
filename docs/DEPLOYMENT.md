# Deploying the server edition

The GitHub Pages site is the **static demo**: everything runs in the visitor's
browser with simulated AI and sample data. The **server edition** is the full
product: live sessions shared between the customer's phone and the agent
console, sign-in and roles, durable storage, link delivery by SMS/email, live
Claude reasoning, health and metrics endpoints.

The server edition is a single Node.js process. It needs a host that runs a
long-lived Node 22 server (not serverless functions) with a persistent disk for
`DATA_DIR`. It is not configured for Vercel.

## What you need

| Setting | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | Yes | 32+ random characters (`openssl rand -base64 32`). Signs sign-in cookies. |
| `DATA_DIR` | Yes for production | Persistent directory. The Docker image uses `/data` (mount a volume). |
| `PUBLIC_BASE_URL` | Recommended | Public origin, e.g. `https://assist.example.com`, used in links sent by SMS/email. |
| `ANTHROPIC_API_KEY` | For live AI | Enables the "Live AI" provider; otherwise sessions use the simulator. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | For SMS | Customer link by text message. |
| `RESEND_API_KEY`, `EMAIL_FROM` | For email | Customer link by email. |
| `ELEVENLABS_API_KEY` | For live voice | British ElevenLabs voice for lines without a recorded clip. |
| `METRICS_TOKEN` | Recommended | Protects `/api/metrics`. |
| `ICE_SERVERS` | Recommended | JSON array of RTCIceServer for live video, including a TURN server with credentials. Default: public STUN only. |

Full reference: [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).

**Build without `DATA_DIR` set.** Some pages are prerendered at build time.

## The static demo on GitHub Pages

`.github/workflows/deploy-pages.yml` publishes the static demo on every push to `main`. One-time setup: the repository must be public (or on a plan that allows Pages for private repos), **Settings → Pages → Source: GitHub Actions**, and `main` must be allowed to deploy. If the deploy job fails with "Branch main is not allowed to deploy to github-pages due to environment protection rules", open **Settings → Environments → github-pages** and add `main` under *Deployment branches and tags* (or allow all branches). Changing the default branch alone does not update that rule.

## Option 1 — Docker (any VM or container platform)

```bash
docker build -t visual-assist .
docker run -d -p 3000:3000 -v va-data:/data \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  -e PUBLIC_BASE_URL=https://assist.example.com \
  visual-assist
```

Or `AUTH_SECRET=... docker compose up -d --build` with the included
`docker-compose.yml`. Put HTTPS in front (Caddy, nginx, or the platform's
load balancer): browsers only allow camera access on HTTPS.

Health checks: liveness `GET /api/health?probe=live`, readiness `GET /api/health`.

## Option 2 — Render (managed, simplest)

1. In Render: **New → Blueprint**, select this repository. `render.yaml`
   creates a Docker web service with a 1 GB persistent disk at `/data` and a
   generated `AUTH_SECRET`.
2. Enter the optional secrets (Anthropic, Twilio, Resend) when prompted, and set
   `PUBLIC_BASE_URL` to the service URL (or your custom domain).
3. Render gives you `https://visual-assist.onrender.com` (or similar) with HTTPS.

## Option 3 — Railway or Fly.io

Both deploy the `Dockerfile` directly. Attach a volume mounted at `/data`, set
the variables above, and expose port 3000.

## Option 4 — Hostinger Node.js hosting (Business / Cloud plans)

1. Create a subdomain (e.g. `visualassist.example.com`) as a Node.js app.
2. Connect this GitHub repository, Node version 22, build command
   `npm ci && npm run build`, start command `npm start`.
3. Set the environment variables above. Use a directory outside the web root
   for `DATA_DIR` (e.g. `/home/<user>/visual-assist-data`).

## Live video

When an agent joins a session, the customer's camera and microphone reach the
console over WebRTC, and the agent's microphone reaches the customer. Video is
not recorded. Signalling uses the app's own endpoints (`/api/.../rtc`), so no
extra service is needed for that, but media needs a path between the two
devices:

- **STUN** (the default) is enough on most home networks.
- **TURN** is needed for symmetric NAT and many mobile and corporate networks.
  Use Twilio Network Traversal, Cloudflare Calls TURN or a self-hosted coturn,
  and set its servers and credentials in `ICE_SERVERS`, for example
  `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"…","credential":"…"}]`.
  Credentials are only served to signed-in agents and customer links, never
  bundled. Details: [PRODUCTION-READINESS.md §3.5](PRODUCTION-READINESS.md).
- The page must be served over **HTTPS** (browsers only allow camera and
  microphone on secure origins) and SSE responses must not be buffered by a
  proxy (the app sets `X-Accel-Buffering: no`).
- Run **one instance**, or sticky sessions per session id: the signalling relay
  is in-process like the session runtime.

If WebRTC can't connect, the console shows "Fallback: snapshots" and the
one-frame-a-second preview carries on. The static demo uses public STUN only,
with signalling between tabs on the same device.

## After deploying

1. Open `/sign-in` and sign in as a demo user (the demo identity provider lists
   users by role). Replace it with your company's sign-in (Entra ID, Okta or
   Auth0 via OpenID Connect) before real use: see `lib/auth/identity.ts`.
2. Start a test session from the console header and open the customer link on a
   phone.
3. Point monitoring at `/api/health` and `/api/metrics`.
