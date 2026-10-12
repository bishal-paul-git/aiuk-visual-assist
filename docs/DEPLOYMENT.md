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
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Yes for real use | Workforce single sign-on (Entra ID, Okta, Auth0). See [below](#workforce-single-sign-on-oidc). Without them the server offers password-less demo sign-in. |
| `DATA_DIR` | Yes for production | Persistent directory. The Docker image uses `/data` (mount a volume). |
| `PUBLIC_BASE_URL` | Recommended | Public origin, e.g. `https://assist.example.com`, used in links sent by SMS/email. |
| `ANTHROPIC_API_KEY` | For live AI | Enables the "Live AI" provider; otherwise sessions use the simulator. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | For SMS | Customer link by text message. |
| `RESEND_API_KEY`, `EMAIL_FROM` | For email | Customer link by email. |
| `ELEVENLABS_API_KEY` | For live voice | British ElevenLabs voice for lines without a recorded clip. |
| `STT_PROVIDER` + `ELEVENLABS_API_KEY` or `DEEPGRAM_API_KEY` | Recommended for iPhone customers | Server speech-to-text for the customer's voice: `STT_PROVIDER=elevenlabs` (Scribe) or `STT_PROVIDER=deepgram` (Nova-3). Used on iOS/Safari and wherever browser recognition is missing or fails. Unset: browser recognition only, and customers without it type. Audio is not stored. |
| `METRICS_TOKEN` | Recommended | Protects `/api/metrics`. |
| `ICE_SERVERS` | Recommended | JSON array of RTCIceServer for live video, including a TURN server with credentials. Default: public STUN only. |

Full reference: [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).

**Build without `DATA_DIR` set.** Some pages are prerendered at build time.

## Workforce single sign-on (OIDC)

Agents and administrators sign in with their organisation account through
OpenID Connect. Customers never sign in; they use their session link. Set
`PUBLIC_BASE_URL` first: the callback URL is derived from it.

| URL to register with the IdP | Value |
|---|---|
| Redirect (callback) URI | `https://assist.example.com/api/auth/callback` |
| Post-logout redirect URI | `https://assist.example.com/sign-in?signed_out=1` |

### Microsoft Entra ID

1. **Entra admin centre → App registrations → New registration.** Name
   "Visual Assist"; *Accounts in this organizational directory only*; redirect
   URI platform **Web**, value `https://assist.example.com/api/auth/callback`.
2. **Authentication:** add `https://assist.example.com/sign-in?signed_out=1`
   as a second Web redirect URI (Entra only returns to registered URLs after
   sign-out). Leave implicit grant off.
3. **Certificates & secrets → New client secret.** Put the value in the
   secret store as `OIDC_CLIENT_SECRET`; note its expiry.
4. **App roles → Create app role** (allowed member types: Users/Groups), one per
   role you use, e.g. values `VisualAssist.Agent`, `VisualAssist.Supervisor`,
   `VisualAssist.ClientAdmin`, `VisualAssist.QaReviewer`,
   `VisualAssist.PlatformAdmin`.
5. **Enterprise applications → Visual Assist → Properties:** *Assignment
   required* = Yes. **Users and groups:** assign people or groups to the roles.
6. **Token configuration → Add optional claim → ID → `email`.** Role values
   arrive in the `roles` claim; the directory id arrives in `tid`.
7. **MFA:** a Conditional Access policy requiring multi-factor authentication
   for the app. Entra then puts `mfa` in the `amr` claim.
8. Configure:

```bash
OIDC_ISSUER=https://login.microsoftonline.com/<directory-tenant-id>/v2.0
OIDC_CLIENT_ID=<application-client-id>
OIDC_CLIENT_SECRET=<secret value>
OIDC_PROVIDER_NAME=Microsoft
OIDC_ROLE_CLAIM=roles
OIDC_ROLE_MAP='{"VisualAssist.Agent":"agent","VisualAssist.Supervisor":"supervisor","VisualAssist.ClientAdmin":"client_admin","VisualAssist.QaReviewer":"qa_reviewer","VisualAssist.PlatformAdmin":"aiuk_admin"}'
OIDC_TENANT_CLAIM=tid
OIDC_TENANT_MAP='{"<directory-tenant-id>":"tnt_northline"}'
OIDC_REQUIRE_MFA=1
```

Use the tenant-specific issuer (not `common` or `organizations`): it must match
the issuer in the ID token. Each client's Entra directory maps to one Visual
Assist tenant through `tid`; staff with platform roles need no tenant mapping.
Entra does not mark emails as verified, so matching existing catalog users by
email relies on your directory's email hygiene; prefer app roles for access.

### Okta

1. **Admin console → Applications → Create App Integration:** *OIDC*, *Web
   Application*, grant type *Authorization Code*. Sign-in redirect URI
   `https://assist.example.com/api/auth/callback`; sign-out redirect URI
   `https://assist.example.com/sign-in?signed_out=1`. Assign the groups that
   may use the app.
2. Create groups, e.g. `VisualAssist-Agents`, `VisualAssist-Supervisors`,
   `VisualAssist-ClientAdmins`.
3. **Security → API → Authorization Servers → default → Claims → Add claim:**
   name `groups`, include in the *ID Token* (always), value type *Groups*,
   filter *Starts with* `VisualAssist-`.
4. For client users, add a claim that carries the organisation, e.g. `org`
   from a user profile attribute.
5. **MFA:** an authentication policy for the app that requires two factors.
   Okta reports it in `amr` (e.g. `["pwd","mfa","otp"]`).
6. Configure:

```bash
OIDC_ISSUER=https://<your-org>.okta.com/oauth2/default
OIDC_CLIENT_ID=<client id>
OIDC_CLIENT_SECRET=<client secret>
OIDC_PROVIDER_NAME=Okta
OIDC_ROLE_CLAIM=groups
OIDC_ROLE_MAP='{"VisualAssist-Agents":"agent","VisualAssist-Supervisors":"supervisor","VisualAssist-ClientAdmins":"client_admin"}'
OIDC_TENANT_CLAIM=org
OIDC_TENANT_MAP='{"northline":"tnt_northline"}'
OIDC_REQUIRE_MFA=1
```

Auth0 and other issuers work the same way: register the two URLs, put roles in
an ID token claim (Auth0: a namespaced claim added by an Action, e.g.
`OIDC_ROLE_CLAIM=https://assist.example.com/roles`) and set the variables.

### Check it

1. Open `/sign-in`: it shows **Sign in with Microsoft** (or your label) and no
   demo users.
2. Sign in as one user per role; each lands on their home page and sees only
   their organisation.
3. Sign in as a user with no role: the page says the account has no Visual
   Assist role, and Platform → Audit shows `security.sign_in_failed` with code
   `no_role`.
4. Sign out: you pass through the IdP's logout and return to `/sign-in`.

If the variables are incomplete (for example `OIDC_ROLE_MAP` is not valid JSON
or names an unknown role), the server logs an `[auth]` error and refuses
sign-in rather than falling back to demo sign-in. `ALLOW_DEMO_SIGNIN=1` keeps
demo users available beside single sign-on for a pilot; never in production.
Full variable reference: [PRODUCTION-READINESS.md §2 and §3.7](PRODUCTION-READINESS.md).

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
  bundled. Details: [PRODUCTION-READINESS.md §3.8](PRODUCTION-READINESS.md).
- The page must be served over **HTTPS** (browsers only allow camera and
  microphone on secure origins) and SSE responses must not be buffered by a
  proxy (the app sets `X-Accel-Buffering: no`).
- Run **one instance**, or sticky sessions per session id: the signalling relay
  is in-process like the session runtime.

If WebRTC can't connect, the console shows "Fallback: snapshots" and the
one-frame-a-second preview carries on. The static demo uses public STUN only,
with signalling between tabs on the same device.

## After deploying

1. Open `/sign-in`. With single sign-on configured, sign in with your
   organisation account; otherwise sign in as a demo user (listed by role).
   Configure [single sign-on](#workforce-single-sign-on-oidc) before real use.
2. Start a test session from the console header and open the customer link on a
   phone.
3. Point monitoring at `/api/health` and `/api/metrics`.
