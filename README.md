# Stockdeck

A self-hosted watchlist and portfolio tracker as an installable web app (PWA): live quotes, charts, news, per-stock signals, portfolios with CSV import, web push alerts, shared watchlists and an MCP server for AI assistants.

![Stockdeck watchlist (demo data)](docs/screenshot.png)

The UI is available in English and German (browser language by default, switchable in the account settings). Translations live in `src/locales/*.json`; adding a language means adding one file.

**Stack:** React 19 + TypeScript (Vite), PWA · Supabase (Postgres with Row Level Security, Google sign-in, Edge Functions, pg_cron) · any static host (Cloudflare Pages by default) · quotes from [Finnhub](https://finnhub.io), charts and non-US symbols via Yahoo chart data.

## Features

- Watchlist with groups, drag & drop, configurable and resizable columns
- Detail view per stock: chart, key metrics, news, analyst consensus, price target, insider trades, earnings, short interest, technicals
- Portfolios with transactions, CSV import (Parqet export or a simple format), valuation in EUR
- Web push alerts: price above/below, daily move, take-profit and stop rules
- Shared watchlists: invite people by email, everyone can edit
- MCP server so Claude and other assistants can read and edit the watchlist and portfolio

## Project layout

- `src/` – React frontend, talks to Supabase directly (supabase-js; RLS protects the data).
- `supabase/migrations/` – schema, policies, auth hook, cron job.
- `supabase/functions/market/` – quotes (60 s cache), search, charts, news, metrics, signals; the Finnhub key stays server-side.
- `supabase/functions/alerts/` – evaluates alert rules (via pg_cron every 15 minutes) and sends web push.
- `supabase/functions/mcp/` – MCP server (Streamable HTTP, stateless) for watchlist and portfolio. Auth via OAuth (Supabase Auth as OAuth server, consent page at `/oauth/consent`) or an API key header.
- Instance values (Supabase project, app URL, VAPID key, deploy target) are not in the repo: the frontend and the deploy script read them from `.env` (template `.env.example`), the functions from their secrets (template `supabase/functions/.env.example`).

## Run your own instance

You need Node 22+, the [Supabase CLI](https://supabase.com/docs/guides/cli), a Supabase project, a Finnhub API key (the free tier is fine for trying it out) and a Google OAuth client for sign-in.

1. **Environment:** `cp .env.example .env` and fill it in (Supabase URL and publishable key, app URL, VAPID public key; Cloudflare values only for `npm run deploy`).
2. **VAPID keys** (web push): `npx web-push generate-vapid-keys`. Put the public key into `.env` (`VITE_VAPID_PUBLIC_KEY`) and both keys into the function secrets (step 4).
3. **Database:** in the SQL editor, create the vault secrets for the cron job first, then push the migrations:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<random-string>', 'alerts_cron_secret');
   ```
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```
4. **Function secrets:** copy `supabase/functions/.env.example` to `supabase/functions/.env`, fill it in, then:
   ```bash
   supabase secrets set --env-file supabase/functions/.env
   supabase functions deploy market alerts mcp
   ```
5. **Auth in the Supabase dashboard:** enable the Google provider (disable email sign-in), set the site URL and redirect URLs (app URL, `https://*.<your-domain>/**`, `<app-url>/oauth/consent**`), and point the “Before User Created” hook to `public.hook_before_user_created`. For the MCP connector, enable the OAuth server with dynamic client registration.
6. **Grant access:** accounts can only be created for addresses in `allowed_emails`. Add the first one in the SQL editor; it becomes admin and can invite others through shared lists:
   ```sql
   insert into public.allowed_emails (email, is_admin) values ('you@example.com', true);
   ```
7. **Run the frontend locally:**
   ```bash
   npm install
   npm run dev
   ```

## Development

```bash
npm run lint && npx tsc -b && npm test && npm run build
```

There is no CI; run the checks locally before pushing.

## Deploy

- **Frontend:** `npm run build` produces a static `dist/` (including `_headers` with a CSP for Cloudflare Pages). `npm run deploy` builds, checks the bundle, deploys to Cloudflare Pages and smoke-tests the live URL in a headless browser (Playwright). Values and tokens come from the environment, `.env`/`.env.deploy`, or (with `STOCKDECK_GCP_PROJECT`) from Google Cloud Secret Manager; see the header of `scripts/deploy-frontend.mjs`. Any static host works too: upload `dist/` (`_headers` is Cloudflare-specific).
- **Backend:** `supabase db push` and `supabase functions deploy market alerts mcp`.

## AI access (MCP)

- Endpoint: `https://<project-ref>.supabase.co/functions/v1/mcp`
- claude.ai connector: add the URL; sign-in runs via OAuth through the app.
- Claude Code or other clients: header `Authorization: Bearer <key>`. To create a key, generate a random string and store only its SHA-256 hash (hex) with `user_id` and `label` in `api_keys`; revoke via `revoked_at`.

## License and data

- Code: MIT, see `LICENSE`.
- Finnhub's free tier and Yahoo chart data are for personal use only. If you run Stockdeck for other people, you need a data provider with a suitable license.
- Charts: [Lightweight Charts](https://github.com/tradingview/lightweight-charts) by TradingView (Apache 2.0).
