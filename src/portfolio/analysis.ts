// Auswertungen fürs Portfolio: Aufteilung des Depotwerts und erhaltene Dividenden je Jahr.
import { toEur, type FxRates, type Position, type Tx } from '../../supabase/functions/_shared/positions.ts'

export type AllocBy = 'position' | 'depot' | 'currency'
export type Slice = { key: string; label: string; value: number; share: number }

/** Höchstens so viele Stücke, der Rest kommt unter „Weitere“. */
const MAX_SLICES = 7

/**
 * Aufteilung des aktuellen Werts (nur bewertete Positionen) nach Wert, Depot oder Währung,
 * größte zuerst; kleine Reste werden zu einem Stück `other` zusammengefasst.
 */
export function allocation(
  positions: Pick<Position, 'symbol' | 'portfolio_id' | 'currency' | 'value'>[],
  by: AllocBy,
  labelOf: (key: string) => string,
): Slice[] {
  const sums = new Map<string, number>()
  for (const p of positions) {
    if (p.value == null || !Number.isFinite(p.value) || p.value <= 0) continue
    const key = by === 'position' ? p.symbol : by === 'depot' ? p.portfolio_id : p.currency || '?'
    sums.set(key, (sums.get(key) ?? 0) + p.value)
  }
  const total = [...sums.values()].reduce((s, v) => s + v, 0)
  if (total <= 0) return []
  const sorted = [...sums.entries()].sort((a, b) => b[1] - a[1])
  const head = sorted.length > MAX_SLICES ? sorted.slice(0, MAX_SLICES - 1) : sorted
  const rest = sorted.slice(head.length).reduce((s, [, v]) => s + v, 0)
  const out = head.map(([key, value]) => ({ key, label: labelOf(key), value, share: value / total }))
  if (rest > 0) out.push({ key: 'other', label: '', value: rest, share: rest / total })
  return out
}

export type DividendYear = { year: number; amount: number; count: number }

/** Netto-Dividende einer Buchung in EUR (wie in der Positionsrechnung: Betrag abzüglich Gebühren und Steuern). */
export function dividendEur(t: Tx, fx: FxRates): number {
  const total = t.quantity > 0 ? t.quantity * t.price : t.price
  return toEur(total - t.fees - t.taxes, t.currency, fx, t.fx_rate)
}

/** Erhaltene Dividenden je Kalenderjahr (aufsteigend), Jahre ohne Zahlung dazwischen mit 0. */
export function dividendsByYear(txs: Tx[], fx: FxRates): DividendYear[] {
  const map = new Map<number, DividendYear>()
  for (const t of txs) {
    if (t.type !== 'dividend') continue
    const amount = dividendEur(t, fx)
    if (!Number.isFinite(amount)) continue
    const year = Number(t.date.slice(0, 4))
    const y = map.get(year) ?? { year, amount: 0, count: 0 }
    y.amount += amount
    y.count++
    map.set(year, y)
  }
  if (!map.size) return []
  const years = [...map.keys()]
  const out: DividendYear[] = []
  for (let y = Math.min(...years); y <= Math.max(...years); y++) out.push(map.get(y) ?? { year: y, amount: 0, count: 0 })
  return out
}

/** Dividenden der letzten 12 Monate bis `today` (YYYY-MM-DD). */
export function trailingDividends(txs: Tx[], fx: FxRates, today: string): number {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() - 1)
  const from = d.toISOString().slice(0, 10)
  return txs
    .filter((t) => t.type === 'dividend' && t.date > from && t.date <= today)
    .reduce((s, t) => {
      const v = dividendEur(t, fx)
      return Number.isFinite(v) ? s + v : s
    }, 0)
}
