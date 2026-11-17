// DKB depot via FinTS, using python-fints (https://github.com/raphaelm/python-fints).
// FinTS gives DKB depot holdings only, no transaction history.
//
// FinTS needs a product registration number from the German banking industry (Die Deutsche
// Kreditwirtschaft). It is personal: every user registers their own at
// https://www.fints.org/de/hersteller/produktregistrierung and puts it into .env.connect as
// STOCKDECK_FINTS_PRODUCT_ID. It is never part of the repository.
//
// The user types login name and PIN into the Python helper's own prompt and confirms in the DKB app.
// This process never sees them (inherited stdio).
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connector, ParseOutput, Position } from '../core/types.ts'
import { toNumber } from '../core/normalize.ts'

const OUT_FILE = 'holdings.json'
const HELPER = join(dirname(fileURLToPath(import.meta.url)), 'fetch_holdings.py')
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/


/** Validates the helper's output. Invalid positions are skipped with a fixed reason. */
export function parsePositions(text: string): { positions: Position[]; skipped: { reason: string }[] } {
  const data = JSON.parse(text) as { format?: unknown; positions?: unknown }
  if (data.format !== 'dkb-holdings-v1' || !Array.isArray(data.positions)) throw new Error('unexpected output of the DKB helper')
  const positions: Position[] = []
  const skipped: { reason: string }[] = []
  for (const p of data.positions as Record<string, unknown>[]) {
    const isin = String(p.isin ?? '').trim().toUpperCase()
    const quantity = toNumber(p.quantity)
    const price = toNumber(p.price)
    const currency = String(p.currency ?? '').trim().toUpperCase()
    const date = String(p.date ?? '')
    const acq = p.acquisition_price == null ? null : toNumber(p.acquisition_price)
    if (!ISIN.test(isin)) skipped.push({ reason: 'position without valid ISIN' })
    else if (!(quantity > 0)) skipped.push({ reason: 'position without quantity' })
    else if (!(price > 0) || !/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) skipped.push({ reason: 'position without price' })
    else positions.push({ isin, quantity, price, currency, date, acquisitionPrice: acq != null && acq > 0 ? acq : null })
  }
  return { positions, skipped }
}

function python(): string {
  return process.env.STOCKDECK_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
}

export function dkb(opts: { env?: Record<string, string | undefined> } = {}): Connector {
  const productId = opts.env?.STOCKDECK_FINTS_PRODUCT_ID ?? ''
  return {
    id: 'dkb',
    name: 'DKB',
    requires: ['python', 'fints'],
    loginHint: 'Type your DKB login name and PIN when asked, then confirm in the DKB app. Only your current holdings are read.',
    async preflight() {
      if (!productId) throw new Error('DKB needs your own FinTS product registration number in STOCKDECK_FINTS_PRODUCT_ID (see connectors/README.md).')
      return []
    },
    async fetch(tmpDir) {
      await new Promise<void>((resolve, reject) => {
        const cmd = python()
        // stdio is inherited: the helper asks for login and PIN directly, nothing passes through this process
        const p = spawn(cmd, [HELPER, join(tmpDir, OUT_FILE)], {
          cwd: tmpDir,
          stdio: 'inherit',
          env: { ...process.env, STOCKDECK_FINTS_PRODUCT_ID: productId, PYTHONUTF8: '1' },
        })
        p.on('error', (e) => reject(e.message.includes('ENOENT') ? new Error(`${cmd} not found. Install Python 3 and run "pip install fints".`) : e))
        p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`DKB helper exited with code ${code}`))))
      })
    },
    async parse(tmpDir): Promise<ParseOutput> {
      const { positions, skipped } = parsePositions(await readFile(join(tmpDir, OUT_FILE), 'utf8'))
      return { rows: [], skipped, holdings: new Map(positions.map((p) => [p.isin, p.quantity])), positions }
    },
  }
}
