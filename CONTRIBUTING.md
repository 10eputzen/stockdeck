# Contributing

Thanks for your interest. Bug reports, small fixes and translations are very welcome. For larger features, please open an issue first so we can agree on the approach before you spend time on it.

## Setup

Follow [Run your own instance](README.md#run-your-own-instance): `npm install`, `npm run setup`, `npm run dev`. You need your own Supabase project for development.

## Before you open a pull request

```bash
npm run lint && npx tsc -b && npm test && npm run build
```

CI runs the same checks on every pull request.

## Guidelines

- Keep files under about 500 lines; split components or hooks before they grow past that.
- No native browser dialogs (`alert`, `confirm`, `prompt`); use `useDialogs()` from `src/ui/useDialogs.ts`.
- Every user-facing string goes through i18next. Add new keys to all files in `src/locales/`.
- Database changes are new files in `supabase/migrations/`; never edit a migration that is already released. Every new table needs Row Level Security policies in the same migration.
- Never commit instance values or secrets (project refs, URLs of your deployment, keys, tokens). They belong in `.env`, `setup.env` or your Supabase secrets.
- Add a line to the `Unreleased` section of [CHANGELOG.md](CHANGELOG.md) for changes users notice.

## Bank connectors

New banks are welcome as connectors in `connectors/`, see [connectors/README.md](connectors/README.md). They are for personal use only, and the privacy rules are not negotiable:

- Connectors run locally. The user logs in inside the bank tool; credentials are never read, stored, logged or sent anywhere.
- Only date, type, ISIN, quantity, amount, currency, fees and taxes leave a connector. No IBANs, account numbers, names, addresses, counterparties or payment references.
- Data goes only to the user's own instance or a local file, never to the project, third parties or telemetry.
- Tests, fixtures, issues and logs contain made-up data only. Never paste real exports, not even shortened ones.
- Follow the checklist in `connectors/_template/index.ts`.

## Translations

A new language is one file: copy `src/locales/en.json` to `src/locales/<code>.json`, translate the values and register it in `src/i18n/index.ts`.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
