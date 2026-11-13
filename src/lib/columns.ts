import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from './cache'
import { supabase } from './supabase'

export type ColumnKey = 'logo' | 'symbol' | 'name' | 'price' | 'ext' | 'chg_abs' | 'chg_pct' | 'range' | 'analyst' | 'earnings'

export const COLUMNS: { key: ColumnKey; label: string; hint?: string }[] = [
  { key: 'logo', label: 'Logo' },
  { key: 'symbol', label: 'Kürzel' },
  { key: 'name', label: 'Name', hint: 'Handy: nur ohne Kürzel' },
  { key: 'price', label: 'Kurs' },
  { key: 'ext', label: 'Vor-/Nachbörse', hint: 'unter dem Kurs' },
  { key: 'chg_abs', label: 'Heute $', hint: 'nicht auf dem Handy' },
  { key: 'chg_pct', label: 'Heute %' },
  { key: 'range', label: 'Tagesspanne', hint: 'nicht auf dem Handy' },
  { key: 'analyst', label: 'Analysten', hint: 'Konsens und Kursziel' },
  { key: 'earnings', label: 'Nächste Zahlen', hint: 'nicht auf dem Handy' },
]

/** Spalten mit eigener Zelle, in der Reihenfolge der Liste (Logo links und Entfernen rechts bleiben fest). */
export type OrderKey = Exclude<ColumnKey, 'logo' | 'ext'>
export const DEFAULT_ORDER: OrderKey[] = ['symbol', 'name', 'price', 'chg_abs', 'chg_pct', 'range', 'analyst', 'earnings']

export const MIN_WIDTH = 48
export const MAX_WIDTH = 640
/** Mindestbreite der flexiblen Spalte (Name bzw. Kürzel) */
export const FLEX_MIN = 64
/** Abstand zwischen den Spalten am Desktop; der Ziehgriff sitzt mittig darin */
export const COL_GAP = 20

export type Columns = Record<ColumnKey, boolean> & {
  order: OrderKey[]
  /** Vom Nutzer gezogene Spaltenbreiten in px (nur Desktop); fehlt ein Eintrag, gilt die Standardbreite */
  widths: Partial<Record<OrderKey, number>>
}

export function cleanWidths(w: unknown): Columns['widths'] {
  const out: Columns['widths'] = {}
  if (w && typeof w === 'object')
    for (const k of DEFAULT_ORDER) {
      const v = (w as Record<string, unknown>)[k]
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, v)))
    }
  return out
}

/** Gespeicherte Reihenfolge bereinigen: Unbekanntes raus, Fehlendes hinten anhängen. */
export function cleanOrder(order: unknown): OrderKey[] {
  const known = Array.isArray(order) ? order.filter((k): k is OrderKey => DEFAULT_ORDER.includes(k)) : []
  const seen = [...new Set(known)]
  return [...seen, ...DEFAULT_ORDER.filter((k) => !seen.includes(k))]
}

export const DEFAULT_COLUMNS: Columns = {
  logo: true,
  symbol: true,
  name: true,
  price: true,
  ext: true,
  chg_abs: true,
  chg_pct: true,
  range: true,
  analyst: true,
  earnings: true,
  order: DEFAULT_ORDER,
  widths: {},
}

/** Mindestens Kürzel oder Name bleibt sichtbar. */
export function toggleColumn(cols: Columns, key: ColumnKey): Columns {
  const next = { ...cols, [key]: !cols[key] }
  if (!next.symbol && !next.name) return cols
  return next
}

type Settings = { columns?: Partial<Columns> }

/** Spaltenauswahl: sofort aus dem Browser, dann aus der Datenbank (gilt auf allen Geräten). */
export function useColumns(userId: string) {
  const cacheKey = `columns:${userId}`
  const [columns, setColumns] = useState<Columns>(() => ({
    ...DEFAULT_COLUMNS,
    ...readCache<Partial<Columns>>(cacheKey),
    order: cleanOrder(readCache<Partial<Columns>>(cacheKey)?.order),
    widths: cleanWidths(readCache<Partial<Columns>>(cacheKey)?.widths),
  }))

  useEffect(() => {
    supabase
      .from('user_settings')
      .select('settings')
      .maybeSingle()
      .then(({ data }) => {
        const saved = (data?.settings as Settings | undefined)?.columns
        if (!saved) return
        const next = { ...DEFAULT_COLUMNS, ...saved, order: cleanOrder(saved.order), widths: cleanWidths(saved.widths) }
        setColumns(next)
        writeCache(cacheKey, next)
      })
  }, [cacheKey])

  const update = useCallback(
    (next: Columns) => {
      setColumns(next)
      writeCache(cacheKey, next)
      supabase
        .from('user_settings')
        .upsert({ user_id: userId, settings: { columns: next }, updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.error('Einstellungen nicht gespeichert', error)
        })
    },
    [cacheKey, userId],
  )

  /** Nur anzeigen (beim Ziehen einer Spaltenbreite), gespeichert wird erst mit update. */
  const preview = useCallback((next: Columns) => setColumns(next), [])

  return [columns, update, preview] as const
}

/** Die Spalte, die den Rest füllt, solange sie keine eigene Breite hat: der Name, ohne Namen das Kürzel. */
export function flexKey(c: Columns): OrderKey | null {
  return c.name ? 'name' : c.symbol ? 'symbol' : null
}

/**
 * CSS-Grid-Spalten passend zur Auswahl und Reihenfolge.
 * Desktop: Die Tabelle passt immer in die Breite, nie eine Scrollleiste. Solange die flexible Spalte (Name bzw.
 * Kürzel) keine eigene Breite hat, füllt sie den Rest; sonst füllt die letzte Spalte (Entfernen-Knopf) den Rest.
 * Feste Breiten sind Obergrenzen (minmax), damit zu breit Gespeichertes schrumpft statt überzulaufen.
 */
export function gridTemplate(c: Columns, narrow: boolean): string {
  const parts: string[] = []
  if (c.logo) parts.push('28px')
  // schmal: Kürzel und Name zusammen passen nicht, dann nur das Kürzel
  const showName = c.name && !(narrow && c.symbol)
  const flex = narrow ? (showName ? 'name' : 'symbol') : flexKey(c)
  const track: Record<OrderKey, string | null> = {
    symbol: c.symbol ? (flex === 'symbol' ? `minmax(${FLEX_MIN}px, 1fr)` : '64px') : null,
    name: showName ? (narrow ? 'minmax(0, 1fr)' : `minmax(${FLEX_MIN}px, 1fr)`) : null,
    price: c.price ? (narrow ? 'minmax(84px, auto)' : '128px') : null,
    chg_abs: c.chg_abs && !narrow ? '84px' : null,
    chg_pct: c.chg_pct ? (narrow ? '72px' : '84px') : null,
    range: c.range && !narrow ? '172px' : null,
    // nur am Desktop; feste Breiten, damit nichts springt
    analyst: c.analyst && !narrow ? '128px' : null,
    earnings: c.earnings && !narrow ? '112px' : null,
  }
  // Am Handy bleibt die feste Reihenfolge, die Zeilen dort sind anders aufgebaut
  if (!narrow)
    for (const k of DEFAULT_ORDER) {
      const w = c.widths[k] ?? (k === flex ? null : Number(/^(\d+)px$/.exec(track[k] ?? '')?.[1] ?? 0))
      if (w && track[k]) track[k] = `minmax(${MIN_WIDTH}px, ${w}px)`
    }
  const keys = narrow ? DEFAULT_ORDER : c.order
  if (!c.name && !c.symbol) parts.push('minmax(0, 1fr)')
  for (const k of keys) if (track[k]) parts.push(track[k]!)
  parts.push(!narrow && flex && c.widths[flex] ? 'minmax(32px, 1fr)' : '32px')
  return parts.join(' ')
}
