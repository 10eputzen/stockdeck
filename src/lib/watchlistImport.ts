import { splitLine } from './csv'
import { parseTradingView, type ParsedWatchlist } from './tradingview'

// Eingaben für den Watchlist-Import: TradingView-Export, freie Tickerliste oder CSV mit Symbolspalte.

const SYMBOL_COLS = ['symbol', 'ticker', 'symbole', 'kürzel', 'code']
const GROUP_COLS = ['group', 'gruppe', 'list', 'liste', 'watchlist', 'section']

const norm = (cell: string) => cell.replace(/^﻿/, '').trim().toLowerCase()

/** CSV, wenn die erste Zeile eine Symbol-/Ticker-Spalte hat; sonst null. */
function parseCsvList(text: string): ParsedWatchlist | null {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const sep = [';', '\t', ','].find((s) => lines[0].includes(s))
  if (!sep) return null
  const head = splitLine(lines[0], sep).map(norm)
  const symCol = head.findIndex((h) => SYMBOL_COLS.includes(h))
  if (symCol < 0) return null
  const groupCol = head.findIndex((h) => GROUP_COLS.includes(h))
  // Über den TradingView-Parser, damit Börsenpräfix, Duplikate und ungültige Symbole gleich behandelt werden
  const sections = new Map<string, string[]>()
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, sep)
    const sym = cells[symCol]?.trim()
    if (!sym) continue
    const group = groupCol >= 0 ? (cells[groupCol]?.trim() ?? '') : ''
    sections.set(group, [...(sections.get(group) ?? []), sym])
  }
  const ungrouped = sections.get('') ?? []
  sections.delete('')
  const tv = [...ungrouped, ...[...sections].flatMap(([g, syms]) => [`###${g}`, ...syms])].join('\n')
  return parseTradingView(tv)
}

/**
 * Text aus Datei oder Zwischenablage: CSV mit Kopfzeile (Spalte Symbol/Ticker, optional Gruppe),
 * TradingView-Export (###Gruppe, BÖRSE:SYMBOL) oder Ticker getrennt durch Komma, Semikolon, Leerzeichen oder Zeilen.
 */
export function parseWatchlist(text: string): ParsedWatchlist {
  const csv = parseCsvList(text)
  if (csv) return csv
  // Gruppennamen (###…) dürfen Leerzeichen enthalten, alles andere wird an Leerraum und Semikolon getrennt
  const tokens = text
    .replace(/^﻿/, '')
    .split(/[,\n\r]+/)
    .flatMap((t) => (t.trim().startsWith('###') ? [t] : t.split(/[\s;]+/)))
  return parseTradingView(tokens.join('\n'))
}
