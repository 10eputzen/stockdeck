# stockdeck

Watchlist- und Portfolio-App. Frontend auf Cloudflare Pages, Backend auf Supabase. Das Repo ist für eine Veröffentlichung vorbereitet: Instanzwerte (Supabase-Ref, App-URL, Cloudflare-Konto, GCP-Projekt, VAPID-Key) stehen nie im Repo, sondern in `.env`/`.env.deploy` (gitignored), im Secret Manager und in den Supabase-Secrets. Die konkreten Werte der Hauptinstanz stehen im Projekt-Gedächtnis.

## Freigaben

Die Hauptinstanz ist privat betrieben. Deploys (DB-Migrationen, Functions, Pages) und das Löschen eigener Hilfsfunktionen, Testdaten und Branches laufen ohne Rückfrage. Commit und Push auf `main` ebenso. Verlangt die Supabase-CLI eine Bestätigung, mit `--yes` ausführen.

Nicht ohne Rückfrage: Watchlist-Daten, Nutzer und Secrets löschen.

## Öffentliches Repo

Keine E-Mail-Adressen, Namen, Instanz-IDs/URLs, Portfolio-Daten, Tokens oder Keys ins Repo (auch nicht in Kommentare, Tests oder Commit-Nachrichten). Zugangslisten nur in der Datenbank, Secrets nur im Secret Manager bzw. in den Supabase-Secrets.

## CI und Deploy

Keine CI in GitHub: Gates (Lint, Typen, Tests, Build) laufen lokal vor jedem Push.

- Frontend: kein automatischer Deploy. Deploy **nur** mit `npm run deploy` (`scripts/deploy-frontend.mjs`), aus dem Cloud-Thread oder vom PC: holt Supabase-Werte und den Pages-Token (`stockdeck-cf-pages-token` im Secret Manager von `STOCKDECK_GCP_PROJECT`, nie `cloudflare-master`; Instanzwerte aus `.env.deploy`, Umgebung oder Secret `stockdeck-instance-env`) selbst, baut, prüft das Bundle, deployt und testet Deploy- und Produktions-URL (Konsole ohne Fehler/Warnungen, Header-Check). Nie `wrangler pages deploy` von Hand: ohne Supabase-Env läuft die Live-App weiß. Nur prüfen: `npm run deploy:check`. Nach Push auf `main` mit Frontend-Änderungen also immer selbst `npm run deploy` laufen lassen.
- Functions und Migrationen: per Supabase-CLI vom PC oder aus Cloud-Threads. Den Token holt man aus dem Secret Manager (`supabase-access-token`, Cloud-Threads lesen ihn mit dem zentralen Konto). Der Supabase-Token kommt nicht nach GitHub.

## UI- und Code-Regeln

- **Keine nativen Browser-Dialoge**: kein `window.confirm`, `alert` oder `prompt`. Bestätigen und Texteingabe laufen über `useDialogs()` aus `src/ui/useDialogs.ts` (`await confirm({ title, message, confirmLabel, danger })`, `await prompt({ title, label, initial })`); der `DialogProvider` sitzt in `main.tsx`. Eigene Formulardialoge nutzen `<dialog>` mit `showModal()` (Fokus-Falle, Escape) und die Klasse `.dialog`.
- **Höchstens ca. 500 Zeilen pro Datei**: wird eine Komponente oder ein Hook größer, in Teile aufteilen (Verhalten unverändert), bevor es weitergeht. Aktuell größte Datei: `Watchlist.tsx` mit ~400 Zeilen.
