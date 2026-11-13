// Stockdeck MCP-Server (Streamable HTTP, zustandslos, JSON-Antworten).
// Gibt einer KI Lese- und Schreibzugriff auf die eigene Watchlist und das Portfolio.
//
// Auth, geprüft hier (verify_jwt ist für diese Function aus, config.toml):
//   OAuth 2.1 über Supabase Auth (claude.ai-Connector): Authorization: Bearer <Supabase-JWT>.
//     Ohne Anmeldung antwortet die Function mit 401 und verweist per WWW-Authenticate auf
//     …/mcp/.well-known/oauth-protected-resource; Zustimmung auf <SITE_URL>/oauth/consent.
//   API-Key (Tabelle api_keys, nur Hash gespeichert): Authorization: Bearer <key> oder x-api-key
//     (Claude Code, .mcp.json). Als Pfad …/mcp/<key> nicht mehr (abgeschaltet 12.11.2026).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getProfiles, getQuotes, searchSymbols, SYMBOL_RE } from "../_shared/finnhub.ts";
import { getChart, getNewsPage, isRange } from "../_shared/history.ts";
import { getSignals } from "../_shared/signals.ts";
import { callPortfolioTool, PORTFOLIO_TOOLS, PortfolioError } from "./portfolio.ts";
import { TOOLS } from "./tools.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "";

const SERVER = { name: "stockdeck", version: "1.4.0" };
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_ITEMS = 200;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version, mcp-session-id, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Öffentliche Adresse der Function (SUPABASE_URL ist in der Edge Runtime die öffentliche Projekt-URL)
const RESOURCE = `${SUPABASE_URL}/functions/v1/mcp`;
const RESOURCE_METADATA = `${RESOURCE}/.well-known/oauth-protected-resource`;
// Supabase-JWTs (Header.Payload.Signatur, base64url) von API-Keys unterscheiden
const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc: "2.0"; id?: JsonRpcId; method: string; params?: Record<string, unknown> };

class ToolError extends Error {}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", ...extra },
  });
}

const ok = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: JsonRpcId, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const header = req.headers.get("x-api-key");
  if (header) return header.trim();
  // Schlüssel in der URL (…/mcp/<key>) gibt es seit der OAuth-Umstellung nicht mehr
  return null;
}

/** Nutzer-ID aus einem Supabase-Access-Token (OAuth), nur für freigeschaltete Konten. */
async function oauthUser(token: string): Promise<string | null> {
  const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: allowed } = await db.rpc("is_allowed");
  return allowed === true ? data.user.id : null;
}

function unauthorized() {
  return json(fail(null, -32001, "Unauthorized"), 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${RESOURCE_METADATA}"`,
  });
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Tools (Beschreibungen in tools.ts) ----------


function normSymbol(raw: unknown) {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!SYMBOL_RE.test(s)) throw new ToolError(`Ungültiger Ticker: "${raw}"`);
  return s;
}

type GroupRow = { id: string; name: string; position: number; collapsed: boolean };

async function loadGroups(db: SupabaseClient, userId: string): Promise<GroupRow[]> {
  const { data, error } = await db
    .from("watchlist_groups")
    .select("id, name, position, collapsed")
    .eq("user_id", userId)
    .order("position");
  if (error) throw error;
  return data;
}

/** Gruppe per Name (ohne Groß/Klein); leer = Ohne Gruppe (null). undefined = fehlt und wurde nicht angelegt. */
async function resolveGroup(db: SupabaseClient, userId: string, raw: unknown, create: boolean) {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name || name.toLowerCase() === "ohne gruppe") return null;
  if (name.length > 60) throw new ToolError("Gruppenname ist zu lang (max. 60 Zeichen).");
  const groups = await loadGroups(db, userId);
  const hit = groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
  if (hit) return { id: hit.id, name: hit.name, created: false };
  if (!create) return undefined;
  if (groups.length >= 50) throw new ToolError("Maximal 50 Gruppen.");
  const position = groups.reduce((m, g) => Math.max(m, g.position + 1), 0);
  const { data, error } = await db
    .from("watchlist_groups")
    .insert({ user_id: userId, name, position })
    .select("id, name")
    .single();
  if (error) throw error;
  return { id: data.id as string, name: data.name as string, created: true };
}

async function nextPosition(db: SupabaseClient, userId: string, groupId: string | null) {
  let q = db.from("watchlist_items").select("position").eq("user_id", userId);
  q = groupId ? q.eq("group_id", groupId) : q.is("group_id", null);
  const { data, error } = await q.order("position", { ascending: false }).limit(1);
  if (error) throw error;
  return (data[0]?.position ?? -1) + 1;
}

async function callTool(db: SupabaseClient, userId: string, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_watchlist": {
      const [items, groups] = await Promise.all([
        db
          .from("watchlist_items")
          .select("symbol, name, created_at, group_id, position")
          .eq("user_id", userId)
          .limit(MAX_ITEMS),
        loadGroups(db, userId),
      ]);
      if (items.error) throw items.error;
      const byId = new Map(groups.map((g) => [g.id, g]));
      const rank = (gid: string | null) => (gid ? byId.get(gid)?.position ?? 0 : -1);
      const sorted = [...items.data].sort((a, b) => rank(a.group_id) - rank(b.group_id) || a.position - b.position);
      const syms = sorted.map((i) => i.symbol);
      const [quoteList, profileList] = await Promise.all([getQuotes(db, syms), getProfiles(db, syms)]);
      const quotes = new Map(quoteList.map((q) => [q.symbol, q]));
      const names = new Map(profileList.map((p) => [p.symbol, p.name]));
      return {
        items: sorted.map((i) => {
          const q = quotes.get(i.symbol);
          return {
            symbol: i.symbol,
            name: names.get(i.symbol) || i.name,
            group: i.group_id ? byId.get(i.group_id)?.name ?? null : null,
            added: i.created_at,
            price_usd: q?.price ?? null,
            change_pct: q?.change_pct ?? null,
            quote_time: q?.quote_time ?? null,
            extended: q?.ext_session
              ? { session: q.ext_session, price_usd: q.ext_price, change_pct: q.ext_change_pct, time: q.ext_time }
              : null,
          };
        }),
      };
    }

    case "list_groups": {
      const groups = await loadGroups(db, userId);
      const { data, error } = await db.from("watchlist_items").select("group_id").eq("user_id", userId).limit(MAX_ITEMS);
      if (error) throw error;
      const count = (id: string | null) => data.filter((i) => i.group_id === id).length;
      return {
        groups: [
          { name: null, label: "Ohne Gruppe", count: count(null) },
          ...groups.map((g) => ({ name: g.name, count: count(g.id), collapsed: g.collapsed })),
        ],
      };
    }

    case "move_stock": {
      const symbol = normSymbol(args.symbol);
      const target = await resolveGroup(db, userId, args.group, args.create_group !== false);
      if (target === undefined) {
        return { moved: false, symbol, reason: `Gruppe "${args.group}" gibt es nicht (create_group=false).` };
      }
      const position = await nextPosition(db, userId, target?.id ?? null);
      const { data, error } = await db
        .from("watchlist_items")
        .update({ group_id: target?.id ?? null, position })
        .eq("user_id", userId)
        .eq("symbol", symbol)
        .select("symbol");
      if (error) throw error;
      if (!data.length) return { moved: false, symbol, reason: "Steht nicht auf der Watchlist." };
      return { moved: true, symbol, group: target?.name ?? null, group_created: target?.created ?? false };
    }

    case "search_stock":
      return { results: await searchSymbols(String(args.query ?? "")) };

    case "add_stock": {
      const symbol = normSymbol(args.symbol);
      const matches = await searchSymbols(symbol);
      const hit = matches.find((m) => m.symbol === symbol);
      if (!hit) {
        return { added: false, reason: `Ticker ${symbol} an US-Börsen nicht gefunden.`, suggestions: matches };
      }
      const profile = (await getProfiles(db, [symbol]))[0];
      const name =
        typeof args.name === "string" && args.name.trim() ? args.name.trim().slice(0, 100) : profile?.name || hit.name;
      const target = await resolveGroup(db, userId, args.group, true);
      const group_id = target?.id ?? null;
      const position = await nextPosition(db, userId, group_id);
      const { data, error } = await db
        .from("watchlist_items")
        .upsert({ user_id: userId, symbol, name, group_id, position }, { onConflict: "user_id,symbol", ignoreDuplicates: true })
        .select("symbol");
      if (error) throw error;
      return data.length
        ? { added: true, symbol, name, group: target?.name ?? null }
        : { added: false, symbol, reason: "Steht schon auf der Watchlist." };
    }

    case "remove_stock": {
      const symbol = normSymbol(args.symbol);
      const { data, error } = await db
        .from("watchlist_items")
        .delete()
        .eq("user_id", userId)
        .eq("symbol", symbol)
        .select("symbol");
      if (error) throw error;
      return data.length ? { removed: true, symbol } : { removed: false, symbol, reason: "Stand nicht auf der Watchlist." };
    }

    case "get_quotes": {
      const symbols = Array.isArray(args.symbols) ? args.symbols.map(normSymbol) : [];
      if (symbols.length === 0) throw new ToolError("symbols ist leer.");
      return { quotes: await getQuotes(db, symbols) };
    }

    case "get_signals": {
      const symbols = Array.isArray(args.symbols) ? args.symbols.slice(0, 10).map(normSymbol) : [];
      if (symbols.length === 0) throw new ToolError("symbols ist leer.");
      return { signals: await getSignals(db, symbols) };
    }

    case "get_chart": {
      const symbol = normSymbol(args.symbol);
      const range = args.range ?? "1mo";
      if (!isRange(range)) throw new ToolError(`Ungültiger Zeitraum: "${range}"`);
      const c = await getChart(symbol, range);
      if (c.bars.length === 0) return { symbol, range, bars: 0, note: "Keine Kursdaten gefunden." };
      const closes = c.bars.map((b) => b.c);
      const first = c.bars[0];
      const last = c.bars[c.bars.length - 1];
      const step = Math.max(1, Math.ceil(c.bars.length / 60));
      const iso = (t: number) => new Date(t * 1000).toISOString();
      return {
        symbol,
        range,
        interval: c.interval,
        from: iso(first.t),
        to: iso(last.t),
        open: first.o,
        close: last.c,
        high: Math.max(...c.bars.map((b) => b.h)),
        low: Math.min(...c.bars.map((b) => b.l)),
        change_pct: Math.round(((last.c - first.o) / first.o) * 10000) / 100,
        closes: c.bars.filter((_, i) => i % step === 0 || i === c.bars.length - 1).map((b) => [iso(b.t), b.c]),
        bars: closes.length,
      };
    }

    case "get_news": {
      const symbol = normSymbol(args.symbol);
      const limit = Math.min(30, Math.max(1, Number(args.limit ?? 10) || 10));
      const { news, total } = await getNewsPage(symbol, 0, limit);
      return {
        symbol,
        total,
        news: news.map((n) => ({ time: n.time, source: n.source, headline: n.headline, url: n.url, image: n.image })),
      };
    }

    default: {
      const res = await callPortfolioTool(db, userId, name, args);
      if (res === undefined) throw new ToolError(`Unbekanntes Tool: ${name}`);
      return res;
    }
  }
}

// ---------- JSON-RPC ----------

async function handle(msg: JsonRpcRequest, db: SupabaseClient, userId: string) {
  const id = msg.id ?? null;
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions:
          `Watchlist der App stockdeck${SITE_URL ? ` (${SITE_URL})` : ""}. Nur US-Ticker. Kurse in USD von Finnhub.`,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: [...TOOLS, ...PORTFOLIO_TOOLS] });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await callTool(db, userId, name, args);
        return ok(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (e) {
        const known = e instanceof ToolError || e instanceof PortfolioError;
        if (!known) console.error(name, e);
        const text = known ? e.message : "Interner Fehler, bitte später erneut versuchen.";
        return ok(id, { content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${msg.method}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // OAuth Protected Resource Metadata (RFC 9728): verweist auf Supabase Auth als Autorisierungsserver
  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/.well-known/oauth-protected-resource")) {
    return json({
      resource: RESOURCE,
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "stockdeck",
    });
  }
  // Kein SSE-Stream und keine Sessions: GET/DELETE gibt es nicht.
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST, OPTIONS" });

  const key = extractKey(req);
  if (!key) return unauthorized();
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const userId = JWT_RE.test(key)
    ? await oauthUser(key)
    : (await admin.rpc("api_key_user", { p_hash: await sha256(key) })).data;
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(fail(null, -32700, "Parse error"), 400);
  }

  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as JsonRpcRequest[];
  if (messages.length === 0 || messages.some((m) => !m || typeof m.method !== "string")) {
    // Antworten des Clients (ohne method) brauchen wir nicht
    if (messages.every((m) => m && typeof m === "object" && !("method" in m))) return json(null, 202);
    return json(fail(null, -32600, "Invalid Request"), 400);
  }

  const responses = [];
  for (const m of messages) {
    // Notifications (ohne id) bekommen keine Antwort
    if (m.id === undefined) continue;
    responses.push(await handle(m, admin, userId));
  }
  if (responses.length === 0) return json(null, 202);
  return json(batch ? responses : responses[0]);
});
