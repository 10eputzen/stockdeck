import { KINDS, type Candidate, type Kind, type NormalizedTx } from './types.ts'

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/
const CURRENCY_RE = /^[A-Z]{3}$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/

/** The whitelisted columns, in output order. Tests assert that nothing else is ever produced. */
export const COLUMNS = ['format', 'bank', 'date', 'type', 'isin', 'quantity', 'amount', 'currency', 'fees', 'taxes', 'id'] as const
export const FORMAT = 'stockdeck-v1'

/** Stable, dependency-free hash (FNV-1a 32 bit + cyrb53, about 85 bits), so distinct rows practically never collide. */
export function hash(s: string): string {
  let f = 0x811c9dc5
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    f = Math.imul(f ^ c, 0x01000193)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const c53 = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return (f >>> 0).toString(36) + c53.toString(36)
}

/** Number from a JS number or a string in English (1234.56) or German (1.234,56) notation. */
export function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (v == null || v === '') return 0
  let s = String(v).replace(/[\s€$ ]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

function toDate(v: unknown): string | null {
  const m = String(v ?? '').trim().match(DATE_RE)
  if (!m) return null
  const d = `${m[1]}-${m[2]}-${m[3]}`
  return Number.isNaN(Date.parse(d)) ? null : d
}

const round = (n: number) => Math.round(n * 1e8) / 1e8

export type NormalizeResult = { rows: NormalizedTx[]; rejected: { index: number; reason: string }[] }

/**
 * Builds normalized transactions from connector candidates.
 * Every output object is created here from scratch out of the whitelisted fields only,
 * and every value is validated, so names, IBANs or free text cannot slip through.
 * Rejection reasons never echo the rejected value.
 */
export function normalize(bank: string, candidates: Candidate[]): NormalizeResult {
  if (!/^[a-z0-9-]{1,40}$/.test(bank)) throw new Error('invalid connector id')
  const rows: NormalizedTx[] = []
  const rejected: NormalizeResult['rejected'] = []
  const seen = new Map<string, number>()

  candidates.forEach((c, index) => {
    const reject = (reason: string) => rejected.push({ index, reason })
    const type = String(c.type ?? '') as Kind
    if (!(KINDS as readonly string[]).includes(type)) return reject('unknown type')
    const date = toDate(c.date)
    if (!date) return reject('invalid date')
    const rawIsin = c.isin == null || c.isin === '' ? null : String(c.isin).trim().toUpperCase()
    if (rawIsin !== null && !ISIN_RE.test(rawIsin)) return reject('invalid ISIN')
    const isin = rawIsin
    if (['buy', 'sell', 'dividend'].includes(type) && !isin) return reject('missing ISIN')
    const currency = String(c.currency ?? 'EUR').trim().toUpperCase()
    if (!CURRENCY_RE.test(currency)) return reject('invalid currency')
    const quantity = Math.abs(toNumber(c.quantity))
    const amount = Math.abs(toNumber(c.amount))
    const fees = Math.abs(toNumber(c.fees))
    const taxes = toNumber(c.taxes)
    if ([quantity, amount, fees, taxes].some((n) => !Number.isFinite(n))) return reject('invalid number')
    if ((type === 'buy' || type === 'sell') && quantity <= 0) return reject('missing quantity')

    const fields = [bank, date, type, isin ?? '', round(quantity), round(amount), currency, round(fees), round(taxes)]
    const key = fields.join('|')
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    rows.push({
      bank,
      date,
      type,
      isin,
      quantity: round(quantity),
      amount: round(amount),
      currency,
      fees: round(fees),
      taxes: round(taxes),
      id: `${bank}:${hash(key)}-${n}`,
    })
  })
  return { rows, rejected }
}

/** Serializes normalized rows to the semicolon CSV of the `stockdeck-v1` format. */
export function toCsv(rows: NormalizedTx[]): string {
  const lines = [COLUMNS.join(';')]
  for (const r of rows) {
    const values: Record<(typeof COLUMNS)[number], string> = {
      format: FORMAT,
      bank: r.bank,
      date: r.date,
      type: r.type,
      isin: r.isin ?? '',
      quantity: String(r.quantity),
      amount: String(r.amount),
      currency: r.currency,
      fees: String(r.fees),
      taxes: String(r.taxes),
      id: r.id,
    }
    lines.push(COLUMNS.map((k) => values[k]).join(';'))
  }
  return lines.join('\n') + '\n'
}

/** Counts per type, for the summary shown before anything is written or uploaded. */
export function countByType(rows: NormalizedTx[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.type] = (out[r.type] ?? 0) + 1
  return out
}

/** Quantity per ISIN from buys and sells, for the local cross-check against the bank's holdings. */
export function quantities(rows: NormalizedTx[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    if (!r.isin || (r.type !== 'buy' && r.type !== 'sell')) continue
    out.set(r.isin, round((out.get(r.isin) ?? 0) + (r.type === 'buy' ? r.quantity : -r.quantity)))
  }
  return out
}
