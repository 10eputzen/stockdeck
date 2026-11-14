import type { Columns } from "../lib/columns";
import { earningsBadge, earningsLong, earningsShort } from "../lib/events";
import { signalBadge } from "../lib/signals";
import type { EarningsEvent, Profile, Quote, Signals } from "../lib/supabase";

export type MarketData = {
  quotes: Record<string, Quote>;
  profiles: Record<string, Profile>;
  events: Record<string, EarningsEvent>;
  signals: Record<string, Signals>;
};

/** Anzeigewerte einer Zeile (Kurs, Logo, Name, Termine, Analysten), gleich für eigene und geteilte Listen. */
export function rowData(symbol: string, fallbackName: string | null | undefined, cols: Columns, d: MarketData) {
  const ev = d.events[symbol];
  return {
    cols,
    q: d.quotes[symbol],
    logoUrl: d.profiles[symbol]?.logo_url,
    name: d.profiles[symbol]?.name ?? fallbackName,
    badge: earningsBadge(ev),
    earn: earningsShort(ev),
    earnTitle: ev?.next_date ? earningsLong(ev) : undefined,
    signal: cols.analyst ? signalBadge(d.signals[symbol], d.quotes[symbol]) : null,
  };
}
