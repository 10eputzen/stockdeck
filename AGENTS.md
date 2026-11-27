# AGENTS.md

Guidance for coding agents working on stockdeck. Human contributors: see [CONTRIBUTING.md](CONTRIBUTING.md), which this file follows.

## Project

Watchlist and portfolio app. React + Vite frontend (static hosting, e.g. Cloudflare Pages), Supabase backend (Postgres, Edge Functions in `supabase/functions/`).

## Checks

Run before every push; CI runs the same:

```bash
npm run lint && npx tsc -b && npm test && npm run build
```

## Rules

- Never commit instance values or secrets: project refs, deployment URLs, account IDs, keys, tokens, email addresses, names or portfolio data. Not in code, comments, tests or commit messages. They belong in `.env`, `.env.deploy`, `setup.env` (all gitignored) or the Supabase secrets.
- No native browser dialogs (`alert`, `confirm`, `prompt`). Use `useDialogs()` from `src/ui/useDialogs.ts`; the `DialogProvider` sits in `main.tsx`. Custom form dialogs use `<dialog>` with `showModal()` and the `.dialog` class.
- Keep files under about 500 lines. Split a component or hook (behaviour unchanged) before it grows past that.
- Every user-facing string goes through i18next; add new keys to all files in `src/locales/`.
- Database changes are new files in `supabase/migrations/`; never edit a released migration. New tables get Row Level Security policies in the same migration.
- Bank connectors in `connectors/` follow the privacy rules in CONTRIBUTING.md.
- Add a line to `Unreleased` in CHANGELOG.md for changes users notice.

## Deploy

- Frontend: only `npm run deploy` (`scripts/deploy-frontend.mjs`). It reads the instance values, builds, checks the bundle and tests the live URL. Never run `wrangler pages deploy` by hand: without the Supabase environment the app renders blank. Dry run: `npm run deploy:check`.
- Functions and migrations: Supabase CLI.
