# Bank connectors

Local command-line connectors that read **your own** transactions from a bank or broker and bring them into **your own** stockdeck instance.

> **Personal use only.** Connectors may use unofficial interfaces that no bank endorses or supports. Use them only for your own accounts, at your own risk, and check your bank's terms first.

## Privacy

- Connectors run only on your computer. You log in inside the bank tool yourself; stockdeck never sees, stores or logs your phone number, PIN, TAN or password.
- Only these fields leave a connector: date, type, ISIN, quantity, amount, currency, fees, taxes (plus the connector id and a hash for duplicate detection). IBANs, account numbers, names, addresses, counterparties and payment references are dropped. A test enforces this (`connectors/core/normalize.test.ts`).
- The data goes only to your own stockdeck instance (`--upload`) or into a local file. Nothing is sent to the project, to third parties or to any telemetry.
- The bank tool's raw output lands in a temporary folder that is deleted after every run, also on errors.

## Usage

Requires Node.js 22.18 or newer and the bank tool of the connector (see below).

```bash
# Upload straight into your instance (asks before anything is sent)
npm run connect -- tr --upload

# Or write a file and import it in the app under Portfolio → Import CSV
npm run connect -- tr
```

Options: `--portfolio "<name>"` (default: the bank's name, created if missing), `--out <dir>` (default `stockdeck-export/`), `--check-holdings` (logs in a second time to compare your computed positions with the bank's).

For `--upload`, set two values in the environment or in a `.env.connect` file in the repository root (gitignored):

```bash
STOCKDECK_MCP_URL=https://<project-ref>.supabase.co/functions/v1/mcp
STOCKDECK_API_KEY=sdk_...   # Account page → AI access (MCP)
```

Uploads go through the `add_transactions` tool of your MCP endpoint. Running a connector again is safe: transactions already there are skipped.

Cash bookings (deposits, withdrawals, interest, taxes without a security) are read but not imported, because stockdeck has no cash account yet.

## Available connectors

| Bank | Id | Bank tool | Notes |
| --- | --- | --- | --- |
| Trade Republic | `trade-republic` (`tr`) | [pytr](https://github.com/pytr-org/pytr) (`pipx install pytr`) | Login with phone number and PIN, confirmed in the app. Credentials are never stored (no `--store_credentials`). Pending orders without shares are skipped. |

## Adding a bank

1. Copy `_template/` to a folder named after the bank and follow the privacy checklist at the top of the file.
2. Register the factory in `registry.ts`.
3. Add a test with made-up data that covers every type the bank exports, including a row with personal data that must not come out.
4. Add a row to the table above.

The normalized format (`stockdeck-v1`) is defined in `core/normalize.ts` and `core/types.ts`. `amount` is the gross amount before fees and taxes; quantities are always positive, the direction comes from the type.
