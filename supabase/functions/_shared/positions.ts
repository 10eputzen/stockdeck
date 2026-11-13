// Positionsrechnung mit Durchschnittskosten (wie Parqet). Reines TypeScript ohne Deno- oder
// Browser-APIs: die Edge Functions (MCP) und die App nutzen dieselbe Datei.

export type TxType = "buy" | "sell" | "dividend" | "fee" | "split" | "transfer_in" | "transfer_out";

export type Tx = {
  id?: string;
  portfolio_id: string;
  symbol: string;
  name?: string | null;
  type: TxType;
  date: string;
  quantity: number;
  price: number;
  currency: string;
  fees: number;
  taxes: number;
  /** Fremdwährung je 1 EUR; leer = aktueller EZB-Kurs */
  fx_rate?: number | null;
  created_at?: string;
};

/** EZB-Kurse: Einheiten je 1 EUR, z. B. { USD: 1.08 } */
export type FxRates = Record<string, number>;

export type Holding = {
  portfolio_id: string;
  symbol: string;
  name: string | null;
  currency: string;
  quantity: number;
  /** Einstand in EUR inkl. Kaufgebühren */
  cost: number;
  realized: number;
  dividends: number;
  /** Datum des ersten Kaufs seit die Position zuletzt bei null stand */
  opened: string | null;
};

export function toEur(amount: number, currency: string, fx: FxRates, rate?: number | null): number {
  if (currency === "EUR" || amount === 0) return amount;
  // Pence (GBX/GBp) kennt die EZB nicht: 1 GBP = 100 Pence
  const pence = currency === "GBX" || currency === "GBp";
  const r = rate && rate > 0 ? rate : pence && fx.GBP ? fx.GBP * 100 : fx[currency];
  return r ? amount / r : NaN;
}

const EPS = 1e-6;

/** Am selben Tag erst Zugänge, dann Abgänge (Importe kommen ohne Uhrzeit). */
const RANK: Record<TxType, number> = { buy: 0, transfer_in: 0, split: 1, dividend: 2, fee: 2, sell: 3, transfer_out: 3 };

/** Positionen je Depot und Symbol aus den Transaktionen (Reihenfolge: Datum, Zugang vor Abgang, dann Anlage). */
export function holdings(txs: Tx[], fx: FxRates): Holding[] {
  const sorted = [...txs].sort((a, b) =>
    a.date !== b.date
      ? a.date.localeCompare(b.date)
      : RANK[a.type] - RANK[b.type] || String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
  );
  const map = new Map<string, Holding>();
  for (const t of sorted) {
    const key = `${t.portfolio_id}|${t.symbol}`;
    let h = map.get(key);
    if (!h) {
      h = { portfolio_id: t.portfolio_id, symbol: t.symbol, name: t.name ?? null, currency: t.currency, quantity: 0, cost: 0, realized: 0, dividends: 0, opened: null };
      map.set(key, h);
    }
    if (t.name) h.name = t.name;
    const eur = (amount: number) => toEur(amount, t.currency, fx, t.fx_rate);
    const total = t.quantity > 0 ? t.quantity * t.price : t.price;
    switch (t.type) {
      case "buy":
      case "transfer_in":
        if (h.quantity < EPS) h.opened = t.date;
        h.quantity += t.quantity;
        h.cost += eur(t.quantity * t.price + t.fees + Math.max(0, t.taxes));
        h.currency = t.currency;
        break;
      case "sell": {
        if (h.quantity < EPS) break;
        const part = Math.min(t.quantity, h.quantity);
        const avg = h.cost / h.quantity;
        // Nur der vorhandene Bestand zählt; Erlös, Gebühren und Steuern anteilig
        h.realized += eur((t.quantity * t.price - t.fees - t.taxes) * (part / t.quantity)) - avg * part;
        h.cost -= avg * part;
        h.quantity -= part;
        if (h.quantity < EPS) {
          h.quantity = 0;
          h.cost = 0;
          h.opened = null;
        }
        break;
      }
      case "transfer_out": {
        // Ausbuchung: Einstand anteilig mit hinaus, kein realisierter Gewinn
        if (h.quantity < EPS) break;
        const part = Math.min(t.quantity, h.quantity);
        h.cost -= (h.cost / h.quantity) * part;
        h.quantity -= part;
        if (h.quantity < EPS) {
          h.quantity = 0;
          h.cost = 0;
          h.opened = null;
        }
        break;
      }
      case "dividend":
        h.dividends += eur(total - t.fees - t.taxes);
        break;
      case "fee":
        h.realized -= eur(total + t.fees + t.taxes);
        break;
      case "split":
        if (t.quantity > 0) h.quantity *= t.quantity;
        break;
    }
  }
  return [...map.values()];
}

export type PriceInfo = { price: number; change: number; currency?: string | null };

export type Position = Holding & {
  price: number | null;
  value: number | null;
  day: number | null;
  gain: number | null;
  gain_pct: number | null;
  share: number | null;
};

export type Totals = { value: number; cost: number; gain: number; gain_pct: number | null; day: number; day_pct: number | null };

/** Bewertung offener Positionen in EUR (Tagesänderung zum heutigen EZB-Kurs). */
export function valuate(hs: Holding[], quotes: Record<string, PriceInfo | undefined>, fx: FxRates) {
  const open = hs.filter((h) => h.quantity > EPS);
  const rows: Position[] = open.map((h) => {
    const q = quotes[h.symbol];
    if (!q) return { ...h, price: null, value: null, day: null, gain: null, gain_pct: null, share: null };
    const cur = q.currency ?? "USD";
    const value = toEur(h.quantity * q.price, cur, fx);
    const day = toEur(h.quantity * q.change, cur, fx);
    const gain = value - h.cost;
    return { ...h, price: q.price, currency: cur, value, day, gain, gain_pct: h.cost > 0 ? gain / h.cost : null, share: null };
  });
  const totals = sum(rows);
  for (const r of rows) r.share = r.value != null && totals.value > 0 ? r.value / totals.value : null;
  rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return { positions: rows, totals };
}

export function sum(rows: Pick<Position, "value" | "cost" | "day">[]): Totals {
  // Ohne Kurs keine Bewertung: solche Positionen fließen weder in Wert noch Einstand ein
  // Ohne gültigen Einstand (z. B. fehlender FX-Kurs) ebenso raus, sonst wird alles NaN
  const priced = rows.filter((r) => r.value != null && Number.isFinite(r.value) && Number.isFinite(r.cost));
  const value = priced.reduce((s, r) => s + (r.value ?? 0), 0);
  const cost = priced.reduce((s, r) => s + r.cost, 0);
  const day = priced.reduce((s, r) => s + (r.day ?? 0), 0);
  const gain = value - cost;
  return { value, cost, gain, gain_pct: cost > 0 ? gain / cost : null, day, day_pct: value - day > 0 ? day / (value - day) : null };
}
