# Launch checklist

What is built, and the exact settings to switch it on. Settings go in Render → visual-assist → Environment.

## 1. Company sign-in for staff (replaces the demo sign-in)

Works with Microsoft (Entra ID), Google Workspace or Okta.

1. In your identity provider, register a web app. Redirect URL: `https://<your address>/api/auth/callback`.
2. On Render set:

| Setting | Example |
|---|---|
| `OIDC_ISSUER` | Microsoft: `https://login.microsoftonline.com/<tenant id>/v2.0` · Google: `https://accounts.google.com` |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | from the app registration |
| `OIDC_PROVIDER_NAME` | `Microsoft` (the button says "Continue with Microsoft") |
| `PUBLIC_BASE_URL` | `https://<your address>` |
| `OIDC_EMAIL_ACCESS` | `{"you@yourcompany.co.uk":"aiuk_admin","@client.co.uk":"agent:tnt_northline","lead@client.co.uk":"supervisor:tnt_northline"}` |

`OIDC_EMAIL_ACCESS` gives access by email: an exact address, or `@domain` for everyone at a company. Client roles need the client after a colon. Roles: `aiuk_admin`, `qa_reviewer`, `client_admin`, `supervisor`, `agent`. Anyone not listed cannot sign in. (Groups from the identity provider also work: `OIDC_ROLE_CLAIM` and `OIDC_ROLE_MAP`.)

Once `OIDC_ISSUER` is set, the one-click demo sign-in is switched off automatically.

## 2. Switch the trial login off

`TRIAL_LOGIN_ENABLED=0`: the ready-made trial login disappears and its address refuses sign-ins.

## 3. Clean start for a client

Platform → Settings → **Reset test data**: choose the client, type RESET, press Delete. Every conversation of that client is deleted, from the database too.

## 4. Your client's brand

Platform → Clients → the client → **Edit brand**: the name customers see, assistant name, colour, support line. The AI's greeting ("Hi, I'm the … visual assistant") and new conversations use it at once.

## 5. Monitoring

- **Uptime:** every 15 minutes GitHub checks the server answers (`.github/workflows/uptime.yml`). A failure emails the repository owner. To be sure you get it: GitHub → Settings → Notifications → Actions → "Send notifications for failed workflows only".
- **Full check:** every morning a real conversation runs with the real AI (`production-check.yml`).
- **Per-conversation device report:** each conversation records the browser, voice, camera and call state (agent screen → Audit).

## 6. Server size, backups (costs: your decision)

| Item | Now | For launch | Where |
|---|---|---|---|
| Server | Render Starter (0.5 CPU, 512 MB), one instance, Oregon | Standard (1 CPU, 2 GB) or two instances, Frankfurt | Render → visual-assist → Settings → Instance type |
| Database backups | Supabase daily backups (plan dependent) | Point-in-time recovery | Supabase → Project → Database → Backups |
| Address | visual-assist-7viw.onrender.com | assist.yourcompany.co.uk | Render → Settings → Custom domains (add one DNS CNAME) |

## 7. The client's line test

Platform → Integrations → `line_test` → **Client API or n8n**: paste the client's endpoint and secret, press Test. The request and reply format is in `docs/INTEGRATION-CONTRACT.md`. Until then the line test is a stand-in that reports "no fault".
