# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Crypto in dollars: search offers each coin as euro and dollar pair (`BTC-EUR`, `BTC-USD`). Exchange-style queries like `btc-usdt`, `BTCUSDT` or `eth/usd` list the dollar pair first (Yahoo has no stablecoin pairs, USDT/USDC track the dollar 1:1). The portfolio converts dollar crypto to euros like US stocks. Redeploy the `market` and `mcp` functions.
- Crypto (BTC, ETH, SOL …) in the watchlist and portfolio, free and without an extra key: search finds coins by name or ticker and adds them as euro pair (`BTC-EUR`, quotes and charts via Yahoo chart data), with coin name and logo from CoinGecko's public API and crypto news from Finnhub. Small prices and fractional quantities show enough decimals (0.00001234 €, 0.0123 BTC). Outside stock market hours the watchlist keeps updating crypto every minute. Trade Republic's crypto pseudo-ISINs (`XF000BTC0017`) resolve to the euro pair, TradingView crypto pairs (`BINANCE:BTCUSDT`) are imported, and the MCP tools accept crypto symbols. Redeploy the `market` and `mcp` functions.
- Local bank connectors (#10): `npm run connect -- tr --upload` reads your own Trade Republic transactions via pytr on your computer and uploads them into your instance; later runs fetch only what is new since the last import (`--full` for everything); without `--upload` it writes a file the CSV import recognizes. Only date, type, ISIN, quantity, amount, currency, fees and taxes are kept. Personal use only, see `connectors/README.md`.
- Export portfolio transactions as CSV (#4): "Export" on the portfolio page saves all transactions, the depot menu (⋮) saves one depot. The file uses the simple import format and re-imports 1:1, including FX rate and note; a re-import into the same account recognizes the transactions as duplicates.
- Watchlist import (#6): besides TradingView exports, the import now takes a pasted ticker list (separated by commas, spaces, semicolons or new lines) or a CSV with a Symbol/Ticker column (optional Group column). The preview shows company names, flags unknown symbols and skips them, and symbols without a group can go to a chosen group.

- Portfolio history chart (#5): the portfolio page shows the value of the open positions and the invested capital over time (1M / 6M / 1Y / Max), with the gain in the chosen period (change in value minus newly invested money). It is computed in the browser from your transactions and historical closes (split-adjusted, valued in EUR at today's ECB rates), ends at the live portfolio value, and loads the closes once per day. The `market` function now also returns split events and the quote currency with chart data, so positions sold before a later split are valued correctly (redeploy the function).

- Portfolio analysis below the positions: a donut chart shows how the portfolio value splits across holdings, depots or currencies (click a holding to open it), and a dividend panel shows net dividends received in the last 12 months, this year and per year.

- Manage the sign-up allowlist in the app (#2): admins see an "Access" section on the Account page to grant access by email, make someone an admin or remove the role, and revoke access. Revoking locks the app but keeps the account and its data. The database enforces it through admin-only functions (the table itself stays unreadable); an admin cannot revoke or demote themselves, so there is always one admin left. Needs the new migration.
- Database tests: `npm test` runs all migrations in PGlite and checks the allowlist permissions.

- Command palette: Ctrl+K / Cmd+K (or `/`) opens a quick switcher on desktop. Type to jump to a stock in your watchlist, find new stocks and open them (Shift+Enter adds them to the watchlist), go to Watchlist/Portfolio/Account, create a group, import, or switch light/dark. Fully keyboard-driven; a "Search & commands" button in the tab bar opens it too.

- Notes per stock: a "Notes" tab on the detail page for your thesis, reasons to buy and what to watch. Saves while you type, private per user (new table `stock_notes` with Row Level Security). The MCP server gets `get_notes` and `set_note` (replace or append with date), so an assistant can keep your notes up to date. Needs the new migration and a redeploy of the `mcp` function.

- Heatmap view for the watchlist: "Tiles" next to the columns menu (grid icon on phones) shows every stock as a tile colored by today's move (full color from ±3 %), per group and shared list, with a market breadth line (rising / falling, average move). Click a tile to open the stock. The choice is remembered per device. On phones the Edit button becomes a pencil icon so the title has room.

### Changed

- Segmented controls size to their number of buttons (the Today/Total switch no longer has an empty third slot).
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
