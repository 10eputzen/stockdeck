// Stockdeck alerts: prüft Alarmregeln und schickt Web-Push.
// POST { action: "run" } mit Header x-cron-secret (pg_cron, alle 15 Minuten zur Handelszeit)
//    | { action: "test" } mit Nutzer-Token: Testnachricht an die eigenen Geräte
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { getQuotes } from "../_shared/finnhub.ts";
import { getFx } from "../_shared/portfolio.ts";
import { holdings, type Tx } from "../_shared/positions.ts";
import { isAllowedOrigin } from "../_shared/cors.ts";
import { berlinNow, evaluateRules, type Push, type Quote, type Rule } from "./evaluate.ts";
import { asLang, TEXTS, type Lang } from "./texts.ts";


webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);


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
  const quotes: Record<string, Quote> = {};
  const list = [...symbols];
  for (const q of await getQuotes(admin, list)) quotes[q.symbol] = q;

  // Sprache des Verlaufs je Nutzer: die des zuletzt angemeldeten Geräts (Pushes gehen je Gerät in dessen Sprache)
  const langOf = new Map<string, Lang>();
  const { data: subLangs } = await admin.from("push_subscriptions").select("user_id, lang").order("created_at", { ascending: true });
  for (const s of subLangs ?? []) langOf.set(s.user_id, asLang(s.lang));

  const { events, oneShot } = evaluateRules({ rules: all, quotes, userHoldings, fx, today, langOf });

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
