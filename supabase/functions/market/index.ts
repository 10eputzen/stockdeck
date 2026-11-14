// Stockdeck market function: Kurse (mit 60-s-Cache, auf Wunsch `swr` sofort aus dem Cache) und Symbolsuche über Finnhub.
// POST { action: "quotes" | "profiles", symbols: string[] } | { action: "search", q: string }
//    | { action: "chart", symbol, range, before? } | { action: "news", symbol, offset? }
//    | { action: "events" | "signals", symbols: string[] } | { action: "metrics", symbol }
//    | { action: "fx" } | { action: "resolve", isins: string[] }
import { createClient } from "npm:@supabase/supabase-js@2";
import { getProfiles, getQuotes, searchSymbols, SYMBOL_RE } from "../_shared/finnhub.ts";
import { getChart, getNewsPage, isRange, NEWS_PAGE } from "../_shared/history.ts";
import { getEvents, getMetrics } from "../_shared/fundamentals.ts";
import { getFx, resolveIsins } from "../_shared/portfolio.ts";
import { getSignals } from "../_shared/signals.ts";
import { isAllowedOrigin } from "../_shared/cors.ts";

// Nur die eigene App darf aus dem Browser zugreifen (App-Domain inkl. Vorschau-Subdomains, lokal).
const MAX_SYMBOLS = 200;

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    ...(isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // Vorabfrage (Preflight) 2 h merken statt vor jedem Aufruf zu wiederholen (Chrome deckelt bei 2 h)
    "Access-Control-Max-Age": "7200",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: allowed, error: authError } = await userClient.rpc("is_allowed");
  if (authError || allowed !== true) return json({ error: "forbidden" }, 403);

  let body: { action?: string; symbols?: unknown; swr?: unknown; q?: unknown; symbol?: unknown; range?: unknown; before?: unknown; offset?: unknown; isins?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  try {
    if (body.action === "search") {
      const q = String(body.q ?? "").slice(0, 50);
      return json({ results: await searchSymbols(q) });
    }
    if (body.action === "quotes" || body.action === "profiles") {
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const symbols = Array.isArray(body.symbols) ? body.symbols.slice(0, MAX_SYMBOLS) : [];
      return body.action === "quotes"
        ? json({ quotes: await getQuotes(admin, symbols, { swr: body.swr === true }) })
        : json({ profiles: await getProfiles(admin, symbols) });
    }
    if (body.action === "events") {
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const symbols = Array.isArray(body.symbols) ? body.symbols.slice(0, MAX_SYMBOLS) : [];
      return json({ events: await getEvents(admin, symbols) });
    }
    if (body.action === "signals") {
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const symbols = Array.isArray(body.symbols) ? body.symbols.slice(0, MAX_SYMBOLS) : [];
      return json({ signals: await getSignals(admin, symbols) });
    }
    if (body.action === "fx") return json(await getFx().then(({ date, rates }) => ({ date, rates })));
    if (body.action === "resolve") {
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      return json({ results: await resolveIsins(admin, Array.isArray(body.isins) ? body.isins : []) });
    }
    if (body.action === "metrics") {
      const symbol = String(body.symbol ?? "").trim().toUpperCase();
      if (!SYMBOL_RE.test(symbol)) return json({ error: "symbol" }, 400);
      return json({ metrics: await getMetrics(symbol) });
    }
    if (body.action === "chart" || body.action === "news") {
      const symbol = String(body.symbol ?? "").trim().toUpperCase();
      if (!SYMBOL_RE.test(symbol)) return json({ error: "symbol" }, 400);
      if (body.action === "news") {
        const offset = Math.min(1000, Math.max(0, Math.floor(Number(body.offset ?? 0)) || 0));
        return json(await getNewsPage(symbol, offset, NEWS_PAGE));
      }
      if (!isRange(body.range)) return json({ error: "range" }, 400);
      const before = body.before == null ? undefined : Number(body.before);
      if (before !== undefined && !(Number.isInteger(before) && before > 0 && before < 4e9)) {
        return json({ error: "before" }, 400);
      }
      return json(await getChart(symbol, body.range, before));
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "upstream" }, 502);
  }
});
