# OAuth Setup Guide (Google / Slack / HubSpot / Stripe)

The OAuth code in this repo is **complete** — init, callback, and (for Google) token
refresh functions all exist and are routed in `netlify.toml`. Integrations appear
disabled only because the provider credentials have never been configured.

This guide lists the exact remaining steps. All values below are taken from the
actual code in `netlify/functions/oauth-*.js`, not from memory — the redirect URIs
and scopes must match **exactly** or the provider will reject the flow.

---

## 0. One-time prerequisites (all providers)

### 0.1 Database tables

Run `sql/db_v2_migration.sql` in the Supabase SQL editor (idempotent — safe to
re-run). It creates `oauth_connections` and `oauth_states` with RLS policies.

Verify:

```sql
select count(*) from oauth_states;   -- should not error
select count(*) from oauth_connections;
```

### 0.2 Netlify environment variables (shared)

In **Netlify → Site settings → Environment variables**, make sure these exist
(they are also used elsewhere in the app):

| Variable | Value |
|---|---|
| `SITE_URL` | `https://blupe.space` (no trailing slash — used to build redirect URIs) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key |

> After adding/changing env vars, trigger a redeploy — Netlify functions read
> env at deploy time.

---

## 1. Google (Sheets, Gmail, Drive)

Used by: **Google Sheets node**, agent `append_to_sheet` tool.

1. Go to https://console.cloud.google.com/ → create (or pick) a project.
2. **APIs & Services → Library**: enable **Google Sheets API**, **Gmail API**,
   **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - Fill app name, support email, developer email.
   - Add scopes (these are exactly what `oauth-google-init.js` requests):
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/drive.readonly`
     - `https://www.googleapis.com/auth/userinfo.email`
   - While in **Testing** mode, add your own Google account under **Test users**
     (only test users can complete the flow until you publish the app).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URI (exact): `https://blupe.space/api/oauth-google-callback`
   - For local testing also add: `http://localhost:8888/api/oauth-google-callback`
5. Copy the Client ID / Client secret into Netlify env:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 4 |
| `GOOGLE_CLIENT_SECRET` | from step 4 |

Notes:
- The init function requests `access_type=offline&prompt=consent`, so a refresh
  token is stored and `oauth-google-refresh.js` auto-refreshes — users won't be
  asked to reconnect hourly.
- The Gmail scopes are "restricted" scopes: publishing the consent screen to
  production for >100 users eventually requires Google verification. For a
  small beta, Testing mode with named test users is fine.

## 2. Slack

Used by: **Slack node**, agent `send_slack` tool.

1. Go to https://api.slack.com/apps → **Create New App → From scratch**.
2. **OAuth & Permissions**:
   - Redirect URL (exact): `https://blupe.space/api/oauth-slack-callback`
   - Bot token scopes (exactly what `oauth-slack-init.js` requests):
     - `chat:write`
     - `chat:write.public`
     - `channels:read`
     - `users:read`
3. **Basic Information → App Credentials** → copy into Netlify env:

| Variable | Value |
|---|---|
| `SLACK_CLIENT_ID` | Client ID |
| `SLACK_CLIENT_SECRET` | Client Secret |

4. To let other workspaces install (not just yours), enable **Manage
   Distribution → Public distribution**. For personal/beta use this is not needed.

## 3. HubSpot

Used by: **HubSpot node** (contacts, companies, deals).

1. Go to https://developers.hubspot.com/ → create a **developer account**, then
   **Create app**.
2. **Auth** tab:
   - Redirect URL (exact): `https://blupe.space/api/oauth-hubspot-callback`
   - Scopes (exactly what `oauth-hubspot-init.js` requests):
     - `crm.objects.contacts.read`
     - `crm.objects.contacts.write`
     - `crm.objects.companies.read`
     - `crm.objects.companies.write`
     - `crm.objects.deals.read`
     - `crm.objects.deals.write`
3. Copy into Netlify env:

| Variable | Value |
|---|---|
| `HUBSPOT_CLIENT_ID` | App ID / Client ID from the Auth tab |
| `HUBSPOT_CLIENT_SECRET` | Client secret from the Auth tab |

## 4. Stripe (optional — Stripe Connect)

Used by: **Stripe node**. This uses **Stripe Connect OAuth** (connecting *other
people's* Stripe accounts). If you only need your own Stripe account in flows,
skip OAuth entirely and put your Stripe secret key in the Secrets Vault instead.

1. https://dashboard.stripe.com/settings/connect → enable **Connect** (Platform).
2. **Connect → Onboarding options -> OAuth**: enable OAuth and add redirect URI (exact):
   `https://blupe.space/api/oauth-stripe-callback`
3. Copy into Netlify env:

| Variable | Value |
|---|---|
| `STRIPE_CLIENT_ID` | `ca_...` from Connect OAuth settings |
| `STRIPE_SECRET_KEY` | Your `sk_live_...` (or `sk_test_...`) API key — the callback uses it as `client_secret` |

---

## 5. Verify

1. Redeploy the site (env vars require it).
2. Open `https://blupe.space/api/oauth-status` — configured providers should be `true`.
   The **Settings → Integrations** tab reads this endpoint and shows a Connect
   button for each configured provider (no code change needed per provider).
3. Click **Connect Google** → complete consent → you should land back in the app;
   `oauth_connections` in Supabase should contain a row with a refresh token.
4. Add a Google Sheets node to a flow and run it.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | Redirect URI in provider console differs from `SITE_URL + /api/oauth-<provider>-callback` — check trailing slashes and http vs https |
| "Failed to create OAuth state" | `oauth_states` table missing → run `sql/db_v2_migration.sql` |
| Provider shows "Not configured" in Settings | Env var missing/empty in Netlify, or site not redeployed after setting it |
| Google works once then dies after 1 h | Refresh token missing — user must reconnect once (init already forces `prompt=consent`) |
