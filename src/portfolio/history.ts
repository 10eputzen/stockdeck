// Depotverlauf: Wert und Einstand je Tag aus Transaktionen und historischen Schlusskursen.
// Reine Rechnung ohne Netz, damit sie testbar bleibt; das Laden steckt in useHistory.ts.
import { holdings, toEur, type FxRates, type Tx } from '../../supabase/functions/_shared/positions.ts'

/** Schlusskurse eines Symbols, aufsteigend nach Datum (YYYY-MM-DD). */
export type Closes = { date: string; close: number }[]

export type HistPoint = { date: string; value: number; invested: number }

export type HistRange = '1mo' | '6mo' | '1y' | 'max'

export type Split = { date: string; factor: number }

const EPS = 1e-6

/** Letzter Schlusskurs am oder vor `date` (binäre Suche). */
export function closeAt(closes: Closes, date: string): number | null {
  let lo = 0
  let hi = closes.length - 1
  let hit = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (closes[mid].date <= date) {
      hit = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return hit < 0 ? null : closes[hit].close
}

/**
 * Yahoo liefert split-bereinigte Kurse, die Stückzahl vor einem Split ist aber die alte.
 * Faktor, mit dem ein bereinigter Kurs am `date` auf den damaligen Kurs zurückgerechnet wird.
 */
function splitFactor(splits: Split[], date: string) {
  let f = 1
  for (const s of splits) if (s.date > date) f *= s.factor
  return f
}

/**
 * Wert (Menge × Schlusskurs, in EUR zum heutigen EZB-Kurs) und Einstand (Durchschnittskosten in EUR)
 * für jeden Tag in `dates`. Fehlt für einen Tag noch ein Kurs, zählt die Position mit ihrem Einstand,
 * damit die Kurve nicht auf null fällt. `live` ersetzt am letzten Tag den Schlusskurs durch den aktuellen Kurs,
 * so endet die Kurve beim selben Wert wie die Übersicht.
 */
export function buildHistory(
  txs: Tx[],
  closes: Record<string, Closes>,
  fx: FxRates,
  currencyOf: (symbol: string, fallback: string) => string,
  dates: string[],
  live?: Record<string, { price: number; currency?: string | null } | undefined>,
  chartSplits: Record<string, Split[] | undefined> = {},
): HistPoint[] {
  if (!txs.length || !dates.length) return []
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
  // Splits laut Kursdaten (auch nach einem Verkauf); fehlen sie, die gebuchten Split-Transaktionen
  const splits = new Map<string, Split[]>(Object.entries(chartSplits).filter((e): e is [string, Split[]] => Array.isArray(e[1])))
  const seen = new Set<string>()
  for (const t of sorted) {
    if (t.type !== 'split' || !(t.quantity > 0) || chartSplits[t.symbol]) continue
    // Derselbe Split in mehreren Depots zählt für den Kurs nur einmal
    const k = `${t.symbol}|${t.date}`
    if (seen.has(k)) continue
    seen.add(k)
    const list = splits.get(t.symbol) ?? []
    list.push({ date: t.date, factor: t.quantity })
    splits.set(t.symbol, list)
  }
  const last = dates[dates.length - 1]
  const out: HistPoint[] = []
  let n = 0
  for (const date of dates) {
    while (n < sorted.length && sorted[n].date <= date) n++
    if (n === 0) continue
    let value = 0
    let invested = 0
    for (const h of holdings(sorted.slice(0, n), fx)) {
      if (h.quantity < EPS || !Number.isFinite(h.cost)) continue
      let v: number
      if (live && date === last) {
        // Letzter Tag wie die Übersicht (valuate): nur Positionen mit aktuellem Kurs, Währung des Kurses
        const q = live[h.symbol]
        if (!q) continue
        v = toEur(h.quantity * q.price, q.currency ?? 'USD', fx)
      } else {
        const adj = closes[h.symbol] ? closeAt(closes[h.symbol], date) : null
        v = adj == null ? h.cost : toEur(h.quantity * adj * splitFactor(splits.get(h.symbol) ?? [], date), currencyOf(h.symbol, h.currency), fx)
      }
      if (!Number.isFinite(v)) continue
      value += v
      invested += h.cost
    }
    out.push({ date, value, invested })
  }
  return out
}

/** Alle Kalendertage mit mindestens einem Kurs ab `from`, dazu immer `today` als letzter Punkt. */
export function tradingDays(closes: Record<string, Closes>, from: string, today: string): string[] {
  const set = new Set<string>()
  for (const list of Object.values(closes)) for (const c of list) if (c.date >= from && c.date < today) set.add(c.date)
  set.add(from < today ? from : today)
  set.add(today)
  return [...set].sort()
}

/** Startdatum eines Zeitraums relativ zu `today` (Max = ab erster Transaktion). */
export function rangeStart(range: HistRange, today: string, first: string): string {
  if (range === 'max') return first
  const d = new Date(`${today}T00:00:00Z`)
  if (range === '1mo') d.setUTCMonth(d.getUTCMonth() - 1)
  else if (range === '6mo') d.setUTCMonth(d.getUTCMonth() - 6)
  else d.setUTCFullYear(d.getUTCFullYear() - 1)
  const s = d.toISOString().slice(0, 10)
  return s < first ? first : s
}

/** Ausschnitt eines Zeitraums; der Gewinn darin ist die Wertänderung abzüglich neu investierten Geldes. */
export function slice(points: HistPoint[], from: string) {
  const i = points.findIndex((p) => p.date >= from)
  // Der Tag vor dem Zeitraum dient als Basis, sonst fehlt die Bewegung des ersten Tages
  const pts = i < 0 ? [] : points.slice(Math.max(0, i - 1))
  const a = pts[0]
  const b = pts[pts.length - 1]
  if (!a || !b) return { points: pts, gain: null, gainPct: null }
  const gain = b.value - a.value - (b.invested - a.invested)
  // Bezugsgröße: Startwert plus neu eingezahltes Kapital (einfache Näherung ohne Zeitgewichtung)
  const basis = a.value + Math.max(0, b.invested - a.invested)
  return { points: pts, gain, gainPct: basis > 0 ? gain / basis : null }
}

/** Welche Kurs-Zeiträume für Daten ab `first` nötig sind: 1 Jahr täglich, älter wöchentlich bzw. monatlich. */
export function neededRanges(first: string, today: string): ('1y' | '5y' | 'max')[] {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 864e5
  return days <= 360 ? ['1y'] : days <= 5 * 365 ? ['1y', '5y'] : ['1y', '5y', 'max']
}

/**
 * Kerzen mehrerer Zeiträume (fein → grob) zu einer Tagesliste zusammenführen. Gröbere Daten
 * füllen nur die Zeit vor dem Beginn der feineren auf.
 */
export function mergeCloses(sets: { bars: { t: number; c: number }[]; gmtoffset: number }[]): Closes {
  const out: Closes = []
  let start = '9999-12-31'
  const day = (t: number, off: number) => new Date((t + off) * 1000).toISOString().slice(0, 10)
  const before = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 864e5).toISOString().slice(0, 10)
  sets.forEach((s, k) => {
    const add: Closes = []
    const bars = s.bars.filter((b) => Number.isFinite(b.c) && b.c > 0)
    bars.forEach((b, i) => {
      // Wochen-/Monatskerzen stehen auf dem Periodenbeginn, tragen aber den Schlusskurs: auf das Periodenende legen
      const next = bars[i + 1]
      let date = day(b.t, s.gmtoffset)
      if (k > 0) date = next ? before(day(next.t, s.gmtoffset)) : date
      if (k > 0 && date >= start) date = before(start)
      if (date < start && date >= (add[add.length - 1]?.date ?? '') && add[add.length - 1]?.date !== date) add.push({ date, close: b.c })
    })
    if (add.length) {
      out.unshift(...add)
      start = add[0].date
    }
  })
  return out
}

/**
 * Lightweight Charts verteilt Punkte gleichmäßig, nicht nach Zeit. Über lange Zeiträume daher nur
 * einen Punkt je Woche (über 1 Jahr) bzw. je Monat (über 5 Jahre) zeigen, damit die Achse stimmt.
 * Erster und letzter Punkt bleiben immer erhalten.
 */
export function thin(points: HistPoint[]): HistPoint[] {
  if (points.length < 3) return points
  const days = (Date.parse(points[points.length - 1].date) - Date.parse(points[0].date)) / 864e5
  if (days <= 400) return points
  const bucket = days > 5 * 365 ? (d: string) => d.slice(0, 7) : (d: string) => String(Math.floor((Date.parse(d) / 864e5 + 3) / 7))
  const out: HistPoint[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    // Jeweils den letzten Tag eines Abschnitts behalten
    if (bucket(points[i].date) !== bucket(points[i + 1].date)) out.push(points[i])
  }
  out.push(points[points.length - 1])
  return out
}
