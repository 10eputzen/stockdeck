// Stockdeck alerts: prüft Alarmregeln und schickt Web-Push.
// POST { action: "run" } mit Header x-cron-secret (pg_cron, alle 15 Minuten zur Handelszeit)
//    | { action: "test" } mit Nutzer-Token: Testnachricht an die eigenen Geräte
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { getQuotes } from "../_shared/finnhub.ts";
import { getFx } from "../_shared/portfolio.ts";
import { holdings, valuate, type Tx } from "../_shared/positions.ts";
import { isAllowedOrigin } from "../_shared/cors.ts";
import { asLang, fmt, TEXTS, type Lang } from "./texts.ts";


type Rule = {
  id: string;
  user_id: string;
  kind: "price_above" | "price_below" | "change_pct_day" | "finanzplan_gain" | "finanzplan_stop";
  symbol: string | null;
  threshold: number;
  params: { weeks?: number; exclude?: string[]; since?: string };
};
/** Text je Sprache: jedes Gerät bekommt den Push in seiner Sprache. */
type Text = (lang: Lang) => { title: string; body: string };
type Push = { text: Text; url: string; tag?: string };
type NewEvent = { user_id: string; rule_id: string; kind: string; symbol: string; title: string; body: string; dedupe_key: string };

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);


/** Berliner Datum und ob gerade gehandelt wird (Mo–Fr 8:00–22:15, deckt Xetra und US-Börsen ab). */
function berlinNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const open = !["Sat", "Sun"].includes(parts.weekday) && minutes >= 8 * 60 && minutes <= 22 * 60 + 15;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, open };
}

async function sendToUser(admin: SupabaseClient, userId: string, msg: Push): Promise<number> {
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, lang").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...msg.text(asLang(s.lang)), url: msg.url, tag: msg.tag }), { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // Abo abgelaufen oder vom Gerät entfernt
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push", status, (e as Error).message);
    }
  }
  return sent;
}

async function run(admin: SupabaseClient) {
  const { date: today } = berlinNow();
  const { data: rules, error } = await admin.from("alert_rules").select("id, user_id, kind, symbol, threshold, params").eq("active", true);
  if (error) throw error;
  if (!rules?.length) return { rules: 0, fired: 0 };
  const all = rules as Rule[];

  // Positionen nur für Nutzer mit Finanzplan-Regeln
  const fpUsers = [...new Set(all.filter((r) => r.kind.startsWith("finanzplan")).map((r) => r.user_id))];
  const txByUser = new Map<string, (Tx & { isin: string | null })[]>();
  if (fpUsers.length) {
    const { data: txs, error: txErr } = await admin
      .from("transactions")
      .select("user_id, portfolio_id, symbol, isin, name, type, date, quantity, price, currency, fees, taxes, fx_rate, created_at")
      .in("user_id", fpUsers)
      .limit(50000);
    if (txErr) throw txErr;
    for (const t of txs ?? []) {
      const list = txByUser.get(t.user_id) ?? [];
      list.push(t as Tx & { isin: string | null });
      txByUser.set(t.user_id, list);
    }
  }
  const fx = txByUser.size ? (await getFx()).rates : {};
  const userHoldings = new Map([...txByUser].map(([u, txs]) => [u, { hs: holdings(txs, fx), txs }]));

  const symbols = new Set<string>();
  for (const r of all) if (r.symbol) symbols.add(r.symbol);
  for (const { hs } of userHoldings.values()) for (const h of hs) if (h.quantity > 1e-6) symbols.add(h.symbol);
  const quotes: Record<string, { price: number; change: number; change_pct: number; currency?: string | null }> = {};
  const list = [...symbols];
  for (const q of await getQuotes(admin, list)) quotes[q.symbol] = q;

  // Sprache des Verlaufs je Nutzer: die des zuletzt angemeldeten Geräts (Pushes gehen je Gerät in dessen Sprache)
  const langOf = new Map<string, Lang>();
  const { data: subLangs } = await admin.from("push_subscriptions").select("user_id, lang").order("created_at", { ascending: true });
  for (const s of subLangs ?? []) langOf.set(s.user_id, asLang(s.lang));

  const events: (NewEvent & { push: Push })[] = [];
  const oneShot: string[] = [];
  for (const r of all) {
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

  let fired = 0;
  for (const e of events) {
    const { push, ...row } = e;
    const { data: inserted } = await admin
      .from("alert_events")
      .upsert(row, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (!inserted?.length) continue;
    fired++;
    const sent = await sendToUser(admin, e.user_id, push);
    await admin.from("alert_events").update({ pushed: sent }).eq("id", inserted[0].id);
  }
  if (oneShot.length) await admin.from("alert_rules").update({ active: false }).in("id", oneShot);
  return { rules: all.length, symbols: list.length, fired };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  const cors: Record<string, string> = {
    ...(isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));

  const cronSecret = Deno.env.get("ALERTS_CRON_SECRET");
  if (body.action === "run") {
    if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "forbidden" }, 403);
    if (!berlinNow().open && body.force !== true) return json({ skipped: "closed" });
    try {
      return json(await run(admin));
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  }

  if (body.action === "test") {
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: allowed } = await userClient.rpc("is_allowed");
    const { data: user } = await userClient.auth.getUser();
    if (allowed !== true || !user.user) return json({ error: "forbidden" }, 403);
    const sent = await sendToUser(admin, user.user.id, {
      text: (L) => ({ title: TEXTS[L].testTitle, body: TEXTS[L].testBody }),
      url: "/#/konto",
      tag: "test",
    });
    return json({ sent });
  }
  return json({ error: "action" }, 400);
});
