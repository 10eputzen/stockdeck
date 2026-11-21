// Regelauswertung der Alerts ohne Deno-, Netz- oder Datenbankzugriff, damit Vitest sie prüfen kann.
// index.ts lädt Regeln, Kurse und Positionen, ruft evaluateRules auf und verschickt die Ereignisse.
import { valuate, type FxRates, type Holding, type Tx } from "../_shared/positions.ts";
import { fmt, TEXTS, type Lang } from "./texts.ts";

export type Rule = {
  id: string;
  user_id: string;
  kind: "price_above" | "price_below" | "change_pct_day" | "finanzplan_gain" | "finanzplan_stop";
  symbol: string | null;
  threshold: number;
  params: { weeks?: number; exclude?: string[]; since?: string };
};
export type Quote = { price: number; change: number; change_pct: number; currency?: string | null };
/** Text je Sprache: jedes Gerät bekommt den Push in seiner Sprache. */
export type Text = (lang: Lang) => { title: string; body: string };
export type Push = { text: Text; url: string; tag?: string };
export type NewEvent = { user_id: string; rule_id: string; kind: string; symbol: string; title: string; body: string; dedupe_key: string };
export type UserHoldings = Map<string, { hs: Holding[]; txs: (Tx & { isin: string | null })[] }>;

/** Berliner Datum und ob gerade gehandelt wird (Mo–Fr 8:00–22:15, deckt Xetra und US-Börsen ab). */
export function berlinNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const open = !["Sat", "Sun"].includes(parts.weekday) && minutes >= 8 * 60 && minutes <= 22 * 60 + 15;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, open };
}

/**
 * Ereignisse für alle Regeln. Doppelte Pushes verhindert der dedupe_key (eindeutig je Nutzer in alert_events):
 * Kurs- und Tagesregeln einmal pro Tag, Finanzplan-Regeln einmal pro Position (Depot, Symbol, Kaufdatum).
 * oneShot: Kursregeln, die ausgelöst haben und danach abgeschaltet werden.
 */
export function evaluateRules(input: {
  rules: Rule[];
  quotes: Record<string, Quote>;
  userHoldings: UserHoldings;
  fx: FxRates;
  today: string;
  langOf: Map<string, Lang>;
}): { events: (NewEvent & { push: Push })[]; oneShot: string[] } {
  const { rules, quotes, userHoldings, fx, today, langOf } = input;
  const events: (NewEvent & { push: Push })[] = [];
  const oneShot: string[] = [];
  for (const r of rules) {
    const thr = Number(r.threshold);
    const lang = langOf.get(r.user_id) ?? "de";
    if (r.symbol) {
      const q = quotes[r.symbol];
      if (!q || !(q.price > 0)) continue;
      const url = `/#/s/${encodeURIComponent(r.symbol)}`;
      if ((r.kind === "price_above" && q.price >= thr) || (r.kind === "price_below" && q.price <= thr)) {
        const sym = r.symbol, above = r.kind === "price_above";
        const text: Text = (L) => {
          const { pct, num } = fmt(L);
          return { title: TEXTS[L].priceTitle(sym, above, num(thr, q.currency)), body: TEXTS[L].priceBody(num(q.price, q.currency), pct(q.change_pct)) };
        };
        const { title, body } = text(lang);
        events.push({ user_id: r.user_id, rule_id: r.id, kind: r.kind, symbol: r.symbol, title, body, dedupe_key: `rule:${r.id}:${today}`, push: { text, url, tag: r.id } });
        oneShot.push(r.id);
      } else if (r.kind === "change_pct_day" && Math.abs(q.change_pct) >= thr) {
        const sym = r.symbol;
        const text: Text = (L) => {
          const { pct, num } = fmt(L);
          return { title: TEXTS[L].dayTitle(sym, pct(q.change_pct)), body: TEXTS[L].dayBody(num(q.price, q.currency), num(thr)) };
        };
        const { title, body } = text(lang);
        events.push({ user_id: r.user_id, rule_id: r.id, kind: r.kind, symbol: r.symbol, title, body, dedupe_key: `rule:${r.id}:${today}`, push: { text, url, tag: r.id } });
      }
      continue;
    }

    const u = userHoldings.get(r.user_id);
    if (!u) continue;
    const exclude = new Set(r.params?.exclude ?? []);
    const isinOf = new Map(u.txs.filter((t) => t.isin).map((t) => [`${t.portfolio_id}|${t.symbol}`, t.isin!]));
    const { positions } = valuate(u.hs, quotes, fx);
    const since = new Date(Date.parse(today) - (r.params?.weeks ?? 4) * 7 * 864e5).toISOString().slice(0, 10);
    for (const p of positions) {
      // Nur Käufe ab Start der Regel, ältere Positionen bleiben außen vor
      if (p.gain_pct == null || !p.opened || (r.params?.since && p.opened < r.params.since)) continue;
      const isin = isinOf.get(`${p.portfolio_id}|${p.symbol}`);
      if (exclude.has(p.symbol) || (isin && exclude.has(isin))) continue;
      const g = p.gain_pct * 100;
      const name = p.name ?? p.symbol;
      const url = `/#/s/${encodeURIComponent(p.symbol)}`;
      const key = `${r.kind}:${p.portfolio_id}:${p.symbol}:${p.opened}`;
      if (r.kind === "finanzplan_gain" && g >= thr && p.opened >= since) {
        const weeks = r.params?.weeks ?? 4, opened = p.opened;
        const text: Text = (L) => {
          const { pct, num, date } = fmt(L);
          return { title: TEXTS[L].gainTitle(name, pct(g)), body: TEXTS[L].gainBody(num(thr), weeks, date(opened)) };
        };
        const { title, body } = text(lang);
        events.push({ user_id: r.user_id, rule_id: r.id, kind: r.kind, symbol: p.symbol, title, body, dedupe_key: key, push: { text, url, tag: key } });
      } else if (r.kind === "finanzplan_stop" && g <= -thr) {
        const text: Text = (L) => {
          const { pct, num } = fmt(L);
          return { title: TEXTS[L].stopTitle(name, pct(g)), body: TEXTS[L].stopBody(num(thr)) };
        };
        const { title, body } = text(lang);
        events.push({ user_id: r.user_id, rule_id: r.id, kind: r.kind, symbol: p.symbol, title, body, dedupe_key: key, push: { text, url, tag: key } });
      }
    }
  }
  return { events, oneShot };
}
