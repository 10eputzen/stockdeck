// npm run connect -- <bank> [--upload] [--full] [--portfolio "<name>"] [--out <dir>] [--check-holdings]
//
// Runs a bank connector on your own computer. You log in inside the bank tool yourself.
// Only date, type, ISIN, quantity, amount, currency, fees and taxes leave the connector,
// and only to your own stockdeck instance (--upload) or to a local file.
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { countByType, toCsv } from './core/normalize.ts'
import { runConnector } from './core/run.ts'
import { daysSince, importable, lastImportDate, upload } from './core/upload.ts'
import { CONNECTORS, findConnector } from './registry.ts'

const NOTICE = `
  stockdeck bank connectors – personal use only.
  Connectors may use unofficial interfaces that no bank endorses. Use them only for your own
  accounts and at your own risk. Your login stays in the bank tool; nothing is stored.
  Only date, type, ISIN, quantity, amount, currency, fees and taxes are kept. IBANs, names,
  counterparties and payment references are dropped. Data goes only to your own instance or a local file.
`

/** Reads KEY=value lines from .env.connect (gitignored) without touching process.env. */
function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^(y|yes|j|ja)$/i.test((await rl.question(`${question} [y/N] `)).trim())
  } finally {
    rl.close()
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      upload: { type: 'boolean', default: false },
      full: { type: 'boolean', default: false },
      portfolio: { type: 'string' },
      out: { type: 'string', default: 'stockdeck-export' },
      'check-holdings': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  const ids = CONNECTORS.map((make) => make({}).id).join(', ')
  if (values.help || positionals.length !== 1) {
    console.log(`Usage: npm run connect -- <bank> [--upload] [--full] [--portfolio "<name>"] [--out <dir>] [--check-holdings]\nBanks: ${ids}`)
    process.exit(values.help ? 0 : 1)
  }
  const connector = findConnector(positionals[0], { checkHoldings: values['check-holdings'] })
  if (!connector) throw new Error(`Unknown bank "${positionals[0]}". Available: ${ids}`)

  // Check the upload target before the user logs in at the bank
  const env = { ...loadEnvFile('.env.connect'), ...process.env }
  const target = values.upload
    ? { url: env.STOCKDECK_MCP_URL ?? '', apiKey: env.STOCKDECK_API_KEY ?? '', portfolio: values.portfolio ?? connector.name }
    : null
  if (target && (!target.url || !target.apiKey)) {
    throw new Error('--upload needs STOCKDECK_MCP_URL and STOCKDECK_API_KEY (environment or .env.connect).')
  }

  console.log(NOTICE)
  for (const w of (await connector.preflight?.()) ?? []) console.warn(`Warning: ${w}`)
  console.log(`${connector.name}: ${connector.loginHint}\n`)

  // Delta import: with --upload, fetch only what is new since the last import into this portfolio.
  // The holdings check needs the full history, so it always fetches everything.
  let sinceDays: number | undefined
  if (target && !values.full && !values['check-holdings']) {
    const last = await lastImportDate(target)
    if (last) {
      sinceDays = daysSince(last)
      console.log(`Last import into "${target.portfolio}": ${last}. Fetching only the last ${sinceDays} days (--full for everything).`)
    }
  }

  const result = await runConnector(connector, { sinceDays })
  console.log(`\n${result.rows.length} transactions read:`, countByType(result.rows))
  if (Object.keys(result.skipped).length) console.log('Skipped:', result.skipped)
  if (result.mismatches) {
    if (result.mismatches.length === 0) console.log('Holdings check: all positions match the bank.')
    else {
      console.warn('Holdings check: these positions differ from the bank (computed vs. bank):')
      for (const m of result.mismatches) console.warn(`  ${m.isin}: ${m.computed} vs. ${m.bank}`)
    }
  }

  if (target) {
    const n = importable(result.rows).length
    const host = new URL(target.url).host
    console.log(`${n} of them can be stored in stockdeck (cash bookings have no place there yet).`)
    if (!n) return
    if (!(await confirm(`Upload ${n} transactions to portfolio "${target.portfolio}" on ${host}?`))) {
      console.log('Nothing uploaded.')
      return
    }
    const r = await upload(result.rows, target)
    console.log(`Done: ${r.inserted} new, ${r.duplicates} already there, ${r.errors} rejected by the server.`)
    for (const m of r.messages) console.warn(`  ${m}`)
    return
  }

  await mkdir(values.out, { recursive: true })
  const file = join(values.out, `${connector.id}-${new Date().toISOString().slice(0, 10)}.csv`)
  await writeFile(file, toCsv(result.rows), 'utf8')
  console.log(`Written to ${file}. Import it in stockdeck under Portfolio → Import CSV.`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
