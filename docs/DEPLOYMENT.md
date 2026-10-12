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

Full reference: [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).

**Build without `DATA_DIR` set.** Some pages are prerendered at build time.

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

## After deploying

1. Open `/sign-in` and sign in as a demo user (the demo identity provider lists
   users by role). Replace it with your company's sign-in (Entra ID, Okta or
   Auth0 via OpenID Connect) before real use: see `lib/auth/identity.ts`.
2. Start a test session from the console header and open the customer link on a
   phone.
3. Point monitoring at `/api/health` and `/api/metrics`.
