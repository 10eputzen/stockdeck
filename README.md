# Stockdeck

Watchlist und Portfolio als installierbare Web-App (PWA): Kurse, Charts, Nachrichten, Signale je Aktie, Depots mit CSV-Import, Web-Push-Alarme, geteilte Watchlists und ein MCP-Server für KI-Zugriff.

**Stack:** React 19 + TypeScript (Vite), PWA · Supabase (Postgres mit Row Level Security, Google-Login, Edge Functions, pg_cron) · statisches Hosting (Cloudflare Pages) · Kurse von [Finnhub](https://finnhub.io), Charts und Nicht-US-Werte über Yahoo-Chartdaten.

## Aufbau

- `src/` – React-Frontend, spricht direkt mit Supabase (supabase-js, RLS schützt die Daten).
- `supabase/migrations/` – Schema, Policies, Auth-Hook, Cron-Job.
- `supabase/functions/market/` – Kurse (60-s-Cache), Suche, Charts, News, Kennzahlen, Signale; der Finnhub-Key bleibt serverseitig.
- `supabase/functions/alerts/` – prüft Alarmregeln (per pg_cron alle 15 Minuten) und schickt Web-Push.
- `supabase/functions/mcp/` – MCP-Server (Streamable HTTP, zustandslos) für Watchlist und Portfolio. Auth per OAuth (Supabase Auth als OAuth-Server, Zustimmung unter `/oauth/consent`) oder API-Key im Header.
- Instanzwerte (Supabase-Projekt, App-URL, VAPID-Key, Deploy-Ziel) stehen nicht im Repo: Frontend und Deploy lesen sie aus `.env` (Vorlage `.env.example`), die Functions aus ihren Secrets (Vorlage `supabase/functions/.env.example`).

## Eigene Instanz aufsetzen

Du brauchst: Node 22+, die [Supabase-CLI](https://supabase.com/docs/guides/cli), ein Supabase-Projekt, einen Finnhub-API-Key (Free-Tier reicht zum Ausprobieren) und ein Google-OAuth-Client für den Login.

1. **Env anlegen:** `cp .env.example .env` und ausfüllen (Supabase-URL und Publishable Key, App-URL, VAPID-Public-Key; Cloudflare-Werte nur für `npm run deploy`).
2. **VAPID-Schlüssel erzeugen** (für Web-Push): `npx web-push generate-vapid-keys`. Public Key nach `.env` (`VITE_VAPID_PUBLIC_KEY`), beide Schlüssel in die Function-Secrets (Schritt 4).
3. **Datenbank:** Im SQL-Editor zuerst die Vault-Secrets für den Cron-Job anlegen, dann die Migrationen einspielen:
   ```sql
   select vault.create_secret('https://<projekt-ref>.supabase.co', 'project_url');
   select vault.create_secret('<zufälliger-string>', 'alerts_cron_secret');
   ```
   ```bash
   supabase link --project-ref <projekt-ref>
   supabase db push
   ```
4. **Function-Secrets:** `supabase/functions/.env.example` nach `supabase/functions/.env` kopieren, ausfüllen, dann:
   ```bash
   supabase secrets set --env-file supabase/functions/.env
   supabase functions deploy market alerts mcp
   ```
5. **Auth im Supabase-Dashboard:** Google-Provider aktivieren (E-Mail-Login aus), Site-URL und Redirect-URLs setzen (App-URL, `https://*.<deine-domain>/**`, `<App-URL>/oauth/consent**`), Hook „Before User Created“ auf `public.hook_before_user_created` stellen. Für den MCP-Connector OAuth-Server mit Dynamic Client Registration einschalten.
6. **Zugang freischalten:** Neue Konten entstehen nur für Adressen in `allowed_emails`. Die erste Adresse per SQL-Editor eintragen, sie wird Admin und kann weitere Personen über geteilte Listen einladen:
   ```sql
   insert into public.allowed_emails (email, is_admin) values ('du@example.com', true);
   ```
7. **Frontend lokal:**
   ```bash
   npm install
   npm run dev
   ```

## Entwicklung

```bash
npm run lint && npx tsc -b && npm test && npm run build
```

Es gibt keine CI; die Gates laufen lokal vor jedem Push.

## Deploy

- **Frontend:** `npm run build` erzeugt ein statisches `dist/` (inkl. `_headers` mit CSP für Cloudflare Pages). `npm run deploy` baut, prüft das Bundle, deployt auf Cloudflare Pages und testet die Live-URL im Browser (Playwright). Werte und Tokens kommen aus der Umgebung, `.env`/`.env.deploy` oder (mit `STOCKDECK_GCP_PROJECT`) aus dem GCP Secret Manager; Details im Kopf von `scripts/deploy-frontend.mjs`. Ohne `npm run deploy` geht jeder statische Host: `dist/` hochladen, `_headers` ist für Cloudflare Pages.
- **Backend:** `supabase db push` und `supabase functions deploy market alerts mcp`.

## KI-Zugriff (MCP)

- Endpoint: `https://<projekt-ref>.supabase.co/functions/v1/mcp`
- claude.ai-Connector: URL eintragen, Login läuft per OAuth über die App.
- Claude Code oder andere Clients: Header `Authorization: Bearer <key>`. Key anlegen: zufälligen Key erzeugen, nur `sha256(key)` (hex) mit `user_id` und `label` in `api_keys` speichern. Sperren per `revoked_at`.

## Lizenz und Daten

- Code: MIT, siehe `LICENSE`.
- Finnhub Free und die Yahoo-Chartdaten sind nur für private Nutzung gedacht. Wer stockdeck öffentlich für andere betreibt, braucht einen Datenanbieter mit passender Lizenz.
- Charts: [Lightweight Charts](https://github.com/tradingview/lightweight-charts) von TradingView (Apache 2.0).
