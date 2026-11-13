// Technik aus Tageskursen (ohne Deno-Abhängigkeiten, auch im Frontend-Test nutzbar).

const round = (n: number | null, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

export type Technicals = {
  high52: number | null;
  /** Abstand zum 52-Wochen-Hoch in Prozent (≤ 0) */
  from_high_pct: number | null;
  sma200: number | null;
  /** Kurs über/unter dem 200-Tage-Schnitt in Prozent */
  vs_sma200_pct: number | null;
  rsi14: number | null;
};

/** RSI nach Wilder über die letzten Schlusskurse. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export function technicals(closes: number[], highs: number[]): Technicals | null {
  if (closes.length < 20) return null;
  const last = closes[closes.length - 1];
  const high52 = Math.max(...highs.slice(-252));
  const sma = closes.length >= 200 ? closes.slice(-200).reduce((s, c) => s + c, 0) / 200 : null;
  return {
    high52: round(high52),
    from_high_pct: round(((last - high52) / high52) * 100, 1),
    sma200: round(sma),
    vs_sma200_pct: sma == null ? null : round(((last - sma) / sma) * 100, 1),
    rsi14: round(rsi(closes), 0),
  };
}

