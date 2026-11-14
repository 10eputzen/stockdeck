// Template for a new bank or broker connector. Copy this folder, rename it after the bank,
// register the factory in ../registry.ts and add a test with made-up data next to it.
//
// PRIVACY CHECKLIST (mandatory, reviewers check every item):
// - Runs only on the user's computer. No network calls except the bank tool talking to the bank.
// - The user logs in inside the bank tool (inherited terminal). Never read, store, log or pass on
//   phone numbers, PINs, TANs, passwords, cookies or session tokens. Never enable "store credentials".
// - Write raw output only into `tmpDir`; the core deletes it afterwards. No caches outside it.
// - `parse` reads only the columns it needs. Never read note, purpose, counterparty, IBAN or name columns.
// - Candidates may only fill: date, type, isin, quantity, amount, currency, fees, taxes.
//   The core drops everything else anyway, but do not hand it over in the first place.
// - Skip reasons are fixed texts. Never put row values into them, into errors or into console output.
// - Tests and fixtures use made-up data only (fake ISINs like US0000000001, fake amounts, "Erika Mustermann").
// - Personal use only: connectors may use unofficial interfaces no bank endorses.
import type { Connector, ParseOutput } from '../core/types.ts'

export function exampleBank(): Connector {
  return {
    id: 'example-bank', // lowercase, used as `npm run connect -- example-bank`
    aliases: [],
    name: 'Example Bank',
    requires: ['example-tool'],
    loginHint: 'example-tool asks for your login; confirm it in your banking app.',
    async fetch(_tmpDir) {
      // Start the bank tool with stdio: 'inherit' so the user logs in directly, e.g.
      // spawn('example-tool', ['export', '--out', tmpDir], { stdio: 'inherit' })
      throw new Error('not implemented')
    },
    async parse(_tmpDir): Promise<ParseOutput> {
      // Read the export from tmpDir and map each row:
      // { date, type: 'buy' | 'sell' | 'dividend' | 'fee' | 'deposit' | 'withdrawal' | 'interest' | 'tax' | 'tax_refund',
      //   isin, quantity, amount /* gross, before fees and taxes */, currency, fees, taxes /* paid > 0, refund < 0 */ }
      return { rows: [], skipped: [] }
    },
  }
}
