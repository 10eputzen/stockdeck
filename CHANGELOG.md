# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Local bank connectors (#10): `npm run connect -- tr --upload` reads your own Trade Republic transactions via pytr on your computer and uploads them into your instance; later runs fetch only what is new since the last import (`--full` for everything); without `--upload` it writes a file the CSV import recognizes. Only date, type, ISIN, quantity, amount, currency, fees and taxes are kept. Personal use only, see `connectors/README.md`.
- Export portfolio transactions as CSV (#4): "Export" on the portfolio page saves all transactions, the depot menu (⋮) saves one depot. The file uses the simple import format and re-imports 1:1, including FX rate and note; a re-import into the same account recognizes the transactions as duplicates.
- Watchlist import (#6): besides TradingView exports, the import now takes a pasted ticker list (separated by commas, spaces, semicolons or new lines) or a CSV with a Symbol/Ticker column (optional Group column). The preview shows company names, flags unknown symbols and skips them, and symbols without a group can go to a chosen group.

- Portfolio history chart (#5): the portfolio page shows the value of the open positions and the invested capital over time (1M / 6M / 1Y / Max), with the gain in the chosen period (change in value minus newly invested money). It is computed in the browser from your transactions and historical closes (split-adjusted, valued in EUR at today's ECB rates), ends at the live portfolio value, and loads the closes once per day. The `market` function now also returns split events and the quote currency with chart data, so positions sold before a later split are valued correctly (redeploy the function).

### Changed

- Tests for the Edge Functions (#7): alert rule evaluation (price above/below, daily move, take-profit/stop, dedupe keys) and the MCP checks (key extraction, OAuth vs. API key, origin, protocol version, rate limit, user scoping of every query) now run with `npm test`, so CI covers them on every pull request. The pure logic moved into `alerts/evaluate.ts` and `mcp/guard.ts`; behaviour is unchanged.

## [1.1.0] – 2026-11-14

### Added

- API keys for the MCP server can be created and revoked on the Account page (#1). The key is generated in the browser and shown once; only its hash is stored. The page also shows the MCP address with a copy button.
- `npm run setup`: one command sets up a new instance on a hosted Supabase project (migrations, secrets, functions, auth, first admin, frontend `.env`). The README quickstart shrinks to four steps.
- `npm run setup -- --self-hosted <folder>`: the same setup for the official self-hosted Supabase stack (Docker), tested against the official stack.
- Navigation animations: a glowing line glides to the active tab (bottom bar on phones, underline on desktop) and pages slide in from the direction of the tab. Respects reduced motion.

### Changed

- Faster, leaner quote updates: the watchlist refreshes quotes every 30 s while markets are open (US pre-market to after-hours, European session included) and every 15 min otherwise, and pauses while the tab is hidden. Polled quotes are served from the server cache immediately and refreshed in the background.
- Quotes for known symbols load in parallel with the watchlist instead of after it, which shortens startup.
- The browser remembers the CORS preflight of the market function for 2 h instead of repeating it before almost every call.
- Switching back to the portfolio within 30 s shows the cached state instead of reloading transactions, quotes and logos.

### Fixed

- A toast no longer disappears when switching between Watchlist, Portfolio and Account.
- Company logos are copied once into a public Supabase Storage bucket and served from there with a 30-day cache. Finnhub's logo server sends no cache headers and sometimes fails, which left errors in the browser console.

### Security

- Build tooling: `glob` (via `workbox-build`) pinned to a patched version through an npm override; fixes the `glob` and `minimatch` advisories.
- MCP server: accepts only tokens issued by the OAuth server (not app session tokens), runs OAuth calls with the user's own rights (RLS), limits tool calls to 60 per minute per user, rejects foreign browser origins, unsupported protocol versions and batch requests, and logs one line per tool call. Protocol version 2025-11-25 added.

## [1.0.0] – 2026-11-13

First public version.

### Added

- Watchlist with groups, drag & drop, configurable and resizable columns, pre-/post-market quotes and company logos.
- Detail view per stock: chart, key metrics, news, analyst consensus, price target, insider trades, earnings history, short interest and technicals.
- Portfolios with transactions, CSV import (Parqet export or a simple format) and valuation in EUR.
- Web push alerts: price above/below, daily move, take-profit and stop rules.
- Shared watchlists: invite by email, members edit together, owner manages access.
- MCP server with 13 tools, OAuth 2.1 (dynamic client registration) and API keys.
- English and German UI (i18next), push notifications in each device's language.
- Invite-only sign-up via an auth hook and allowlist.
- CI for pull requests: lint, type check, tests.
