# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `npm run setup`: one command sets up a new instance on a hosted Supabase project (migrations, secrets, functions, auth, first admin, frontend `.env`). The README quickstart shrinks to four steps.
- `npm run setup -- --self-hosted <folder>`: the same setup for the official self-hosted Supabase stack (Docker), tested against the official stack.
- Navigation animations: a glowing line glides to the active tab (bottom bar on phones, underline on desktop) and pages slide in from the direction of the tab. Respects reduced motion.

### Fixed

- A toast no longer disappears when switching between Watchlist, Portfolio and Account.
- Company logos are copied once into a public Supabase Storage bucket and served from there with a 30-day cache. Finnhub's logo server sends no cache headers and sometimes fails, which left errors in the browser console.

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
