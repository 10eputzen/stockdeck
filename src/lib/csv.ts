import { t } from '../i18n'
import type { TxType } from './supabase'
import { toStockdeck } from '../../connectors/core/toStockdeck.ts'
import { FORMAT as CONNECTOR_FORMAT } from '../../connectors/core/normalize.ts'
import { KINDS, type Kind } from '../../connectors/core/types.ts'

/** Eine Zeile aus der CSV, bereit zum Anlegen (Symbol ggf. erst nach ISIN-Auflösung). */
export type ParsedTx = {
  line: number
  type: TxType
  date: string
  symbol: string | null
  isin: string | null
  name: string | null
  quantity: number
  price: number
  currency: string
  fees: number
  taxes: number
  external_id: string
}

export type ParseResult = {
  format: 'parqet' | 'einfach' | 'connector'
  rows: ParsedTx[]
  skipped: { line: number; reason: string }[]
}

export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

/** Zahl in deutscher (1.234,56) oder englischer (1234.56) Schreibweise; leer = 0. */
export function parseNum(raw: string | undefined): number {
  let s = (raw ?? '').replace(/[\s€$ ]/g, '')
  if (!s) return 0
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** 2026-01-15, 2026-01-15T10:00:00Z oder 15.01.2026 → 2026-01-15 */
export function parseDate(raw: string | undefined): string | null {
  const s = (raw ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

const TYPE_MAP: Record<string, TxType | null> = {
  buy: 'buy',
  kauf: 'buy',
  sell: 'sell',
  verkauf: 'sell',
  dividend: 'dividend',
  dividende: 'dividend',
  ausschüttung: 'dividend',
  fee: 'fee',
  fees: 'fee',
  feestaxes: 'fee',
  fees_taxes: 'fee',
  gebühr: 'fee',
  gebühren: 'fee',
  split: 'split',
  transferin: 'transfer_in',
  transfer_in: 'transfer_in',
  einbuchung: 'transfer_in',
  transferout: 'transfer_out',
  transfer_out: 'transfer_out',
  ausbuchung: 'transfer_out',
  // Bargeldbewegungen gehören nicht ins Wertpapier-Portfolio
  deposit: null,
  withdrawal: null,
  interest: null,
  einzahlung: null,
  auszahlung: null,
  zinsen: null,
}

/** Kurzer, stabiler Hash (FNV-1a) für die Dublettenprüfung ohne ID-Spalte. */
function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

const ALIASES: Record<string, string[]> = {
  date: ['datetime', 'date', 'datum', 'buchungstag', 'valuta'],
  type: ['type', 'typ', 'art', 'transaktion'],
  id: ['id', 'activityid', 'activity_id', 'transaktions-id'],
  ident: ['identifier', 'isin', 'symbol', 'ticker', 'wertpapier', 'kürzel'],
  isin: ['isin'],
  symbol: ['symbol', 'ticker', 'kürzel'],
  name: ['holdingname', 'name', 'assetname', 'bezeichnung', 'wertpapiername'],
  shares: ['shares', 'stück', 'stueck', 'anzahl', 'menge', 'quantity'],
  price: ['price', 'kurs', 'preis'],
  amount: ['amount', 'betrag', 'gesamt'],
  fee: ['fee', 'fees', 'gebühren', 'gebuehren', 'gebühr'],
  tax: ['tax', 'taxes', 'steuern', 'steuer'],
  currency: ['currency', 'währung', 'waehrung'],
}

/** Liest einen Parqet-Export (Semikolon, deutsche Zahlen) oder das einfache eigene Format. */
export function parseCsv(text: string): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const headerIdx = lines.findIndex((l) => l.trim())
  if (headerIdx < 0) return { format: 'einfach', rows: [], skipped: [] }
  const headLine = lines[headerIdx]
  const sep = headLine.includes(';') ? ';' : headLine.includes('\t') ? '\t' : ','
  const head = splitLine(headLine, sep).map((h) => h.toLowerCase())
  const col = (key: string) => {
    for (const a of ALIASES[key]) {
      const i = head.indexOf(a)
      if (i >= 0) return i
    }
    return -1
  }
  if (head.includes('format') && head.includes('bank')) return parseConnector(lines, headerIdx, sep, head)
  const format: ParseResult['format'] = head.includes('shares') || head.includes('holdingname') || head.includes('identifier') ? 'parqet' : 'einfach'
  const c = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(k)])) as Record<keyof typeof ALIASES, number>
  const rows: ParsedTx[] = []
  const skipped: ParseResult['skipped'] = []
  const seen = new Map<string, number>()

  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const line = i + 1
    const f = splitLine(lines[i], sep)
    const get = (k: number) => (k >= 0 ? f[k] ?? '' : '')
    const rawType = get(c.type).toLowerCase().replace(/[\s-]/g, '')
    const type = TYPE_MAP[rawType]
    if (type === null) {
      skipped.push({ line, reason: t('common.csvSkipCash', { type: get(c.type) }) })
      continue
    }
    if (!type) {
      skipped.push({ line, reason: t('common.csvSkipUnknownType', { type: get(c.type) }) })
      continue
    }
    const date = parseDate(get(c.date))
    if (!date) {
      skipped.push({ line, reason: t('common.csvSkipMissingDate') })
      continue
    }
    const ident = (get(c.isin) || get(c.ident) || get(c.symbol)).trim().toUpperCase()
    const isin = ISIN_RE.test(ident) ? ident : null
    const symbol = !isin && ident ? ident : get(c.symbol) && !ISIN_RE.test(get(c.symbol).toUpperCase()) ? get(c.symbol).toUpperCase() : null
    if (!isin && !symbol) {
      skipped.push({ line, reason: t('common.csvSkipMissingIdent') })
      continue
    }
    let quantity = Math.abs(parseNum(get(c.shares)))
    let price = Math.abs(parseNum(get(c.price)))
    const amount = Math.abs(parseNum(get(c.amount)))
    // Dividenden/Gebühren ohne Stück/Kurs: Gesamtbetrag als Preis
    if ((type === 'dividend' || type === 'fee') && (!quantity || !price) && amount) {
      quantity = 0
      price = amount
    }
    if (!price && quantity && amount && type !== 'split') price = amount / quantity
    const fees = Math.abs(parseNum(get(c.fee)))
    const taxes = parseNum(get(c.tax))
    if ([quantity, price, fees, taxes].some((n) => Number.isNaN(n))) {
      skipped.push({ line, reason: t('common.csvSkipInvalidNumber') })
      continue
    }
    const currency = (get(c.currency) || 'EUR').toUpperCase()
    const id = get(c.id)
    let external_id: string
    if (id) external_id = `${format}:${id}`
    else {
      const key = [type, date, isin ?? symbol, quantity, price, fees, taxes].join('|')
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      external_id = `${format}:${hash(key)}-${n}`
    }
    rows.push({ line, type, date, symbol, isin, name: get(c.name) || null, quantity, price, currency, fees, taxes, external_id })
  }
  return { format, rows, skipped }
}

/** Reads the normalized file of the local bank connectors (`npm run connect`, format stockdeck-v1). */
function parseConnector(lines: string[], headerIdx: number, sep: string, head: string[]): ParseResult {
  const rows: ParsedTx[] = []
  const skipped: ParseResult['skipped'] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const line = i + 1
    const f = splitLine(lines[i], sep)
    const get = (k: string) => f[head.indexOf(k)] ?? ''
    const type = get('type') as Kind
    if (get('format') !== CONNECTOR_FORMAT || !(KINDS as readonly string[]).includes(type)) {
      skipped.push({ line, reason: t('common.csvSkipUnknownType', { type: get('type') }) })
      continue
    }
    const date = parseDate(get('date'))
    const num = (k: string) => Number(get(k) || 0)
    const isin = get('isin').toUpperCase()
    const values = [num('quantity'), num('amount'), num('fees'), num('taxes')]
    if (!date) {
      skipped.push({ line, reason: t('common.csvSkipMissingDate') })
      continue
    }
    if (values.some((n) => !Number.isFinite(n))) {
      skipped.push({ line, reason: t('common.csvSkipInvalidNumber') })
      continue
    }
    const [quantity, amount, fees, taxes] = values
    const m = toStockdeck({
      bank: get('bank'),
      date,
      type,
      isin: ISIN_RE.test(isin) ? isin : null,
      quantity,
      amount,
      currency: (get('currency') || 'EUR').toUpperCase(),
      fees,
      taxes,
      id: get('id'),
    })
    if (!m.tx) {
      skipped.push({ line, reason: m.skip === 'cash' ? t('common.csvSkipCash', { type }) : t('common.csvSkipMissingIdent') })
      continue
    }
    if (!m.tx.external_id) {
      skipped.push({ line, reason: t('common.csvSkipMissingIdent') })
      continue
    }
    rows.push({ line, symbol: null, name: null, ...m.tx })
  }
  return { format: 'connector', rows, skipped }
}
