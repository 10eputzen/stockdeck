// Trade Republic via pytr (https://github.com/pytr-org/pytr), an unofficial client.
// The user installs pytr and logs in inside pytr's own prompt; this connector never sees the
// phone number, PIN or code. It never passes --store_credentials and disables pytr's event database,
// so pytr writes only the export file into the temporary folder, which the core deletes afterwards.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { Candidate, Connector, Kind, ParseOutput } from '../core/types.ts'
import { toNumber } from '../core/normalize.ts'

const EXPORT_FILE = 'account_transactions.json'
const HOLDINGS_FILE = 'portfolio.csv'

/** pytr type labels (English with --lang en, German for exports made with the system language). */
const TYPES: Record<string, Kind | 'unsupported'> = {
  buy: 'buy',
  kauf: 'buy',
  sell: 'sell',
  verkauf: 'sell',
  dividend: 'dividend',
  dividende: 'dividend',
  fees: 'fee',
  gebühren: 'fee',
  deposit: 'deposit',
  einlage: 'deposit',
  einzahlung: 'deposit',
  removal: 'withdrawal',
  entnahme: 'withdrawal',
  auszahlung: 'withdrawal',
  interest: 'interest',
  zinsen: 'interest',
  taxes: 'tax',
  steuern: 'tax',
  'tax refund': 'tax_refund',
  steuerrückerstattung: 'tax_refund',
  split: 'unsupported',
  spinoff: 'unsupported',
  swap: 'unsupported',
  'transfer (inbound)': 'unsupported',
  'transfer (outbound)': 'unsupported',
  'umbuchung (eingang)': 'unsupported',
  'umbuchung (ausgang)': 'unsupported',
  'interest charge': 'unsupported',
  zinsbelastung: 'unsupported',
  'fees refund': 'unsupported',
  gebührenerstattung: 'unsupported',
}

/** Column names in English and German. `Note`, `ISIN2` and `Shares2` are deliberately never read. */
const COL = {
  date: ['Date', 'Datum'],
  type: ['Type', 'Typ'],
  value: ['Value', 'Wert'],
  isin: ['ISIN'],
  shares: ['Shares', 'Stück'],
  fees: ['Fees', 'Gebühren'],
  taxes: ['Taxes', 'Steuern'],
} as const

function pick(row: Record<string, unknown>, names: readonly string[]): unknown {
  for (const n of names) if (n in row) return row[n]
  return undefined
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // stdio is inherited: pytr talks to the user directly, nothing passes through this process
    const p = spawn(cmd, args, { cwd, stdio: 'inherit' })
    p.on('error', (e) => reject(e.message.includes('ENOENT') ? new Error(`${cmd} not found. Install it first, e.g. "pipx install pytr".`) : e))
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))))
  })
}

/** Converts one pytr row into a candidate. Only the fields below are read. */
export function fromPytrRow(row: Record<string, unknown>): Candidate | { skip: string } {
  const label = String(pick(row, COL.type) ?? '').trim().toLowerCase()
  const kind = TYPES[label]
  if (!kind) return { skip: 'unknown type' }
  if (kind === 'unsupported') return { skip: 'type not supported yet' }
  const value = Math.abs(toNumber(pick(row, COL.value)))
  const fees = Math.abs(toNumber(pick(row, COL.fees)))
  const taxes = toNumber(pick(row, COL.taxes))
  const rawShares = pick(row, COL.shares)
  // Subscribed but not yet allotted orders (e.g. IPOs) come without a share count
  if ((kind === 'buy' || kind === 'sell') && (rawShares == null || rawShares === '' || !toNumber(rawShares))) {
    return { skip: 'pending order without shares' }
  }
  // Corporate actions (spin-offs, exchanges with a second ISIN) come as trades without any cash value.
  // Importing them as a sale at 0 would close the position with a false loss, so they are skipped.
  if ((kind === 'buy' || kind === 'sell') && value === 0) return { skip: 'corporate action without cash value' }
  // pytr's value is the cash movement. Gross amount: buys paid fees and taxes on top, sells and dividends had them deducted.
  let amount = value
  if (kind === 'buy') amount = value - fees - Math.max(0, taxes)
  else if (kind === 'sell' || kind === 'dividend') amount = value + fees + taxes
  return {
    date: pick(row, COL.date),
    type: kind,
    isin: pick(row, COL.isin) || null,
    quantity: rawShares ?? 0,
    amount: Math.max(0, amount),
    currency: 'EUR', // Trade Republic accounts are in EUR; pytr has no currency column
    fees,
    taxes,
  }
}

/** Parses pytr's JSON-lines export. */
export function parseExport(text: string): ParseOutput {
  const out: ParseOutput = { rows: [], skipped: [] }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    let row: Record<string, unknown>
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      out.skipped.push({ reason: 'unreadable line' })
      continue
    }
    const c = fromPytrRow(row)
    if ('skip' in c && typeof c.skip === 'string') out.skipped.push({ reason: c.skip })
    else out.rows.push(c as Candidate)
  }
  return out
}

/** Parses `pytr portfolio -o` (Name;ISIN;quantity;…): only ISIN and quantity are read. */
export function parseHoldings(text: string): Map<string, number> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const head = (lines.shift() ?? '').split(';').map((h) => h.trim().toLowerCase())
  const iIsin = head.indexOf('isin')
  const iQty = head.indexOf('quantity')
  const out = new Map<string, number>()
  if (iIsin < 0 || iQty < 0) return out
  for (const l of lines) {
    const f = l.split(';')
    const isin = (f[iIsin] ?? '').trim().toUpperCase()
    const q = toNumber(f[iQty])
    if (isin && Number.isFinite(q)) out.set(isin, q)
  }
  return out
}

export function tradeRepublic(opts: { checkHoldings?: boolean } = {}): Connector {
  return {
    id: 'trade-republic',
    aliases: ['tr'],
    name: 'Trade Republic',
    requires: ['pytr'],
    loginHint: 'pytr asks for your phone number and PIN, then you confirm the login in the Trade Republic app.',
    async preflight() {
      // pytr reuses credentials stored by an earlier run with --store_credentials
      return existsSync(join(homedir(), '.pytr', 'credentials'))
        ? ['pytr has stored credentials in ~/.pytr/credentials from an earlier run. Delete that file if you do not want them kept.']
        : []
    },
    async fetch(tmpDir) {
      const login = ['--v2', '--lang', 'en']
      await run(
        'pytr',
        ['export_transactions', ...login, '--export-format', 'json', '--no-store-event-database', '--last_days', '0', '--outputdir', tmpDir],
        tmpDir,
      )
      if (opts.checkHoldings) await run('pytr', ['portfolio', '--v2', '-o', join(tmpDir, HOLDINGS_FILE)], tmpDir)
    },
    async parse(tmpDir) {
      const out = parseExport(await readFile(join(tmpDir, EXPORT_FILE), 'utf8'))
      if (opts.checkHoldings) out.holdings = parseHoldings(await readFile(join(tmpDir, HOLDINGS_FILE), 'utf8'))
      return out
    },
  }
}
