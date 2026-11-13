// Kursverlauf (Yahoo, inoffiziell, nur privat) und Firmen-News (Finnhub) mit kurzem In-Memory-Cache.
// Der Cache lebt pro Function-Instanz; das reicht, um Zeitraum-Wechsel und Mehrfachaufrufe abzufangen.
import { yahooSymbol } from "./yahoo.ts";

export const RANGES = ["1d", "5d", "1mo", "6mo", "ytd", "1y", "5y", "max"] as const;
export type Range = (typeof RANGES)[number];

/** Kerzen-Intervall je Zeitraum, Länge eines Nachlade-Blocks (Sekunden) und Cache-Dauer. */
const PLAN: Record<Range, { interval: string; chunk: number; ttl: number }> = {
  "1d": { interval: "5m", chunk: 5 * 86400, ttl: 60 },
  "5d": { interval: "15m", chunk: 10 * 86400, ttl: 300 },
  "1mo": { interval: "60m", chunk: 90 * 86400, ttl: 300 },
  "6mo": { interval: "1d", chunk: 2 * 365 * 86400, ttl: 3600 },
  ytd: { interval: "1d", chunk: 2 * 365 * 86400, ttl: 3600 },
  "1y": { interval: "1d", chunk: 2 * 365 * 86400, ttl: 3600 },
  "5y": { interval: "1wk", chunk: 10 * 365 * 86400, ttl: 3600 },
  max: { interval: "1mo", chunk: 0, ttl: 3600 },
};
const INTRADAY = new Set(["5m", "15m", "60m"]);

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
export type Chart = {
  symbol: string;
  range: Range;
  interval: string;
  /** Sekunden zur UTC-Zeit der Börse (New York), damit die Achse Ortszeit zeigt. */
  gmtoffset: number;
  prev_close: number | null;
  /** Gibt es ältere Daten, die man nachladen kann? */
  more: boolean;
  bars: Bar[];
};

export type NewsItem = {
  time: string;
  headline: string;
  source: string;
  summary: string;
  url: string;
  image: string | null;
};

const cache = new Map<string, { until: number; value: unknown }>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value as T;
  const value = await load();
  if (cache.size > 500) cache.clear();
  cache.set(key, { until: Date.now() + ttl * 1000, value });
  return value;
}

export function isRange(r: unknown): r is Range {
  return typeof r === "string" && (RANGES as readonly string[]).includes(r);
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Kerzen für einen Zeitraum. Mit `before` (Unix-Sekunden) kommt der Block davor, zum Nachladen
 * beim Zurückscrollen. Yahoo liefert Intraday-Daten nur begrenzt zurück; ist nichts mehr da, ist `more` false.
 */
export async function getChart(symbol: string, range: Range, before?: number): Promise<Chart> {
  const plan = PLAN[range];
  const key = `chart|${symbol}|${range}|${before ?? ""}`;
  return cached(key, before ? 86400 : plan.ttl, async () => {
    const yahoo = yahooSymbol(symbol);
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}`);
    url.searchParams.set("interval", plan.interval);
    if (INTRADAY.has(plan.interval)) url.searchParams.set("includePrePost", "true");
    if (before) {
      url.searchParams.set("period1", String(Math.max(0, before - plan.chunk)));
      url.searchParams.set("period2", String(before - 1));
    } else {
      url.searchParams.set("range", range);
    }
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (stockdeck)" } });
    // 422/400: Zeitraum liegt außerhalb dessen, was Yahoo in diesem Intervall liefert
    if (before && (res.status === 422 || res.status === 400)) {
      return { symbol, range, interval: plan.interval, gmtoffset: 0, prev_close: null, more: false, bars: [] };
    }
    if (!res.ok) throw new Error(`Yahoo chart ${res.status}`);
    const r = (await res.json())?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const q = r?.indicators?.quote?.[0] ?? {};
    const bars: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const [o, h, l, c] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
      if (o == null || h == null || l == null || c == null) continue;
      // Doppelte Zeitstempel (Yahoo hängt manchmal den Live-Wert an) überspringen
      if (bars.length && ts[i] <= bars[bars.length - 1].t) continue;
      bars.push({ t: ts[i], o: round(o), h: round(h), l: round(l), c: round(c), v: q.volume?.[i] ?? 0 });
    }
    const first = r?.meta?.firstTradeDate as number | undefined;
    const earliest = bars[0]?.t ?? before ?? 0;
    return {
      symbol,
      range,
      interval: plan.interval,
      gmtoffset: r?.meta?.gmtoffset ?? 0,
      prev_close: r?.meta?.chartPreviousClose ?? r?.meta?.previousClose ?? null,
      more: plan.chunk > 0 && bars.length > 0 && (!first || earliest > first + 86400),
      bars,
    };
  });
}

const GENERIC_IMAGE = [
  /^https:\/\/s\.yimg\.com\/rz\/stage\//,
  /yahoo_finance_[a-z-]+_h_p_finance/i,
  /yahoo-finance-default-logo/i,
  /\/social\/images\/[a-z-]*default/i,
  /yahoo_default_logo/i,
];
const isGeneric = (u: string) => GENERIC_IMAGE.some((re) => re.test(u));

/* ---------- Vorschaubild der Artikelseite (og:image) ---------- */

const PREVIEW_TIMEOUT_MS = 3000;
const PREVIEW_MAX_BYTES = 256 * 1024;
const PREVIEW_MAX_REDIRECTS = 3;
const PREVIEW_PARALLEL = 5;

/**
 * Eigener HTTP/1.1-Client: Yahoo schickt so große Antwort-Header, dass der HTTP/2-Abruf
 * der Edge mit „stream error“ abbricht. Ohne diese Option gibt es nur das generische Logo.
 */
const previewClient: Deno.HttpClient | undefined = (() => {
  try {
    // deno-lint-ignore no-explicit-any
    return (Deno as any).createHttpClient({ http1: true, http2: false });
  } catch {
    return undefined;
  }
})();

/** Nur öffentliche https-Ziele auf Port 443; keine IP-Adressen, kein localhost (Schutz vor SSRF). */
function safeUrl(raw: string, base?: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || (u.port && u.port !== "443") || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(h)) return null;
  return u;
}

/**
 * HTML bis zum Ende des <head> lesen, höchstens 256 KB.
 * Yahoo liefert über 100 KB Skripte vor den Meta-Tags; ein knapperes Limit schneidet sie ab.
 */
async function readHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const dec = new TextDecoder();
  let html = "";
  let size = 0;
  while (size < PREVIEW_MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    size += value.length;
    html += dec.decode(value, { stream: true });
    const end = html.indexOf("</head>", Math.max(0, html.length - value.length - 7));
    if (end >= 0) {
      html = html.slice(0, end);
      break;
    }
  }
  reader.cancel().catch(() => {});
  return html;
}

const clean = (v: string) => v.replace(/&amp;/g, "&").replace(/\\\//g, "/").trim();

/** Bildkandidaten in Rangfolge: og/twitter-Meta-Tags, danach das Bild aus den strukturierten Daten (JSON-LD). */
function imageCandidates(html: string): string[] {
  const out: string[] = [];
  for (const key of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    const a = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, "i").exec(html);
    const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, "i").exec(html);
    const v = (a ?? b)?.[1];
    if (v) out.push(clean(v));
  }
  for (const m of html.matchAll(/"image"\s*:\s*(?:\{[^}]*?"url"\s*:\s*"([^"]+)"|"([^"]+)"|\[\s*"([^"]+)")/g)) {
    const v = m[1] ?? m[2] ?? m[3];
    if (v) out.push(clean(v));
  }
  return out;
}

async function findPreview(articleUrl: string): Promise<string | null> {
  let url = safeUrl(articleUrl);
  const signal = AbortSignal.timeout(PREVIEW_TIMEOUT_MS);
  for (let hop = 0; url && hop <= PREVIEW_MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      ...(previewClient ? { client: previewClient } : {}),
      redirect: "manual",
      signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; stockdeck)", Accept: "text/html" },
    });
    if (res.status >= 300 && res.status < 400) {
      res.body?.cancel().catch(() => {});
      const next = res.headers.get("location");
      url = next ? safeUrl(next, url.href) : null;
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
      res.body?.cancel().catch(() => {});
      return null;
    }
    const base = url.href;
    for (const raw of imageCandidates(await readHead(res))) {
      const img = safeUrl(raw, base);
      if (img && !isGeneric(img.href)) return img.href;
    }
    return null;
  }
  return null;
}

/** Vorschaubild je Artikel, 24 h gemerkt; Fehlschläge 1 h, damit kaputte Seiten nicht ständig bremsen. */
async function previewFor(articleUrl: string): Promise<string | null> {
  const key = `img|${articleUrl}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value as string | null;
  let img: string | null = null;
  try {
    img = await findPreview(articleUrl);
  } catch {
    img = null;
  }
  cache.set(key, { until: Date.now() + (img ? 86400 : 3600) * 1000, value: img });
  return img;
}

/** Fehlende Bilder für diese Meldungen nachladen, höchstens fünf Seiten gleichzeitig. */
async function fillImages(items: NewsItem[]): Promise<NewsItem[]> {
  const out = items.map((n) => ({ ...n }));
  const todo = out.filter((n) => !n.image);
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const n = todo[i++];
      n.image = await previewFor(n.url);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREVIEW_PARALLEL, todo.length) }, worker));
  return out;
}

export const NEWS_PAGE = 10;

/** Eine Seite News mit Bildern: Liste aus dem Cache, Bilder nur für die ausgelieferten Meldungen. */
export async function getNewsPage(symbol: string, offset = 0, limit = NEWS_PAGE) {
  const all = await getNews(symbol);
  const page = await fillImages(all.slice(offset, offset + limit));
  return { news: page, total: all.length };
}

/** Firmen-News der letzten `days` Tage, neueste zuerst, höchstens 50 (die App zeigt sie in Zehnerschritten). */
export async function getNews(symbol: string, days = 7): Promise<NewsItem[]> {
  return cached(`news|${symbol}|${days}`, 900, async () => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    const url = new URL("https://finnhub.io/api/v1/company-news");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("from", from.toISOString().slice(0, 10));
    url.searchParams.set("to", to.toISOString().slice(0, 10));
    const res = await fetch(url, { headers: { "X-Finnhub-Token": Deno.env.get("FINNHUB_API_KEY") ?? "" } });
    if (!res.ok) throw new Error(`Finnhub news ${res.status}`);
    const data = (await res.json()) as {
      datetime: number;
      headline: string;
      source: string;
      summary: string;
      url: string;
      image: string;
    }[];
    const https = (u: string) => (typeof u === "string" && u.startsWith("https://") ? u : null);
    // Platzhalterbilder der Anbieter (z. B. Yahoos lila Logo) zählen als „kein Bild“:
    // bekannte Muster und jede Bild-URL, die bei drei oder mehr Meldungen gleich ist.
    const imageCount = new Map<string, number>();
    for (const n of Array.isArray(data) ? data : []) if (n.image) imageCount.set(n.image, (imageCount.get(n.image) ?? 0) + 1);
    const realImage = (u: string) => {
      const img = https(u);
      if (!img || isGeneric(img) || (imageCount.get(u) ?? 0) >= 3) return null;
      return img;
    };
    const seen = new Set<string>();
    return (Array.isArray(data) ? data : [])
      .filter((n) => {
        // Dubletten (gleiche Überschrift oder gleicher Link) nur einmal
        const h = n.headline?.trim().toLowerCase()
        if (!h || !https(n.url) || seen.has(h) || seen.has(n.url)) return false
        seen.add(h).add(n.url)
        return true
      })
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 50)
      .map((n) => ({
        time: new Date(n.datetime * 1000).toISOString(),
        headline: n.headline.slice(0, 300),
        source: String(n.source ?? "").slice(0, 60),
        summary: String(n.summary ?? "").slice(0, 400),
        url: n.url,
        image: realImage(n.image),
      }));
  });
}
