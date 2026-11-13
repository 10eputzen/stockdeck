// MCP-Werkzeuge fürs Portfolio: Übersicht, Transaktionen lesen und gebündelt anlegen.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SYMBOL_RE } from "../_shared/finnhub.ts";
import { ISIN_RE, portfolioOverview, resolveIsins, TX_COLS } from "../_shared/portfolio.ts";

export class PortfolioError extends Error {}

const TYPES = ["buy", "sell", "dividend", "fee", "split", "transfer_in", "transfer_out"] as const;
const MAX_BATCH = 500;

export const PORTFOLIO_TOOLS = [
  {
    name: "list_portfolio",
    description:
      "Depots mit offenen Positionen, bewertet in EUR (Durchschnittskosten wie Parqet, EZB-Tageskurse): Stück, Einstand, Kurs, Wert, Gewinn/Verlust absolut und in %, Tagesänderung, Anteil, Kaufdatum (opened). Prozentwerte als Prozent (12.3 = 12,3 %).",
    inputSchema: {
      type: "object",
      properties: { portfolio: { type: "string", description: "Depot-Name oder -ID; leer = alle Depots" } },
      additionalProperties: false,
    },
    annotations: { title: "Portfolio", readOnlyHint: true },
  },
  {
    name: "list_transactions",
    description: "Transaktionen (neueste zuerst), optional gefiltert nach Depot und Ticker.",
    inputSchema: {
      type: "object",
      properties: {
        portfolio: { type: "string", description: "Depot-Name oder -ID" },
        symbol: { type: "string", description: "Ticker, z. B. AAPL oder SAP.DE" },
        limit: { type: "integer", minimum: 1, maximum: 1000, description: "Anzahl, Standard 100" },
      },
      additionalProperties: false,
    },
    annotations: { title: "Transaktionen", readOnlyHint: true },
  },
  {
    name: "add_transactions",
    description:
      "Legt bis zu 500 Transaktionen in einem Depot an (fehlt das Depot, wird es angelegt). Doppelte external_id werden übersprungen, also gefahrlos wiederholbar. Ticker: US-Werte ohne Endung (AAPL), sonst Yahoo-Schreibweise (SAP.DE, BTC-EUR); ohne symbol wird die ISIN aufgelöst. Beträge in `currency`. Nur Aufzeichnung, es wird nichts gehandelt.",
    inputSchema: {
      type: "object",
      properties: {
        portfolio: { type: "string", description: "Depot-Name (z. B. DKB, Trade Republic, eToro) oder -ID" },
        source: { type: "string", enum: ["mcp", "parqet"], description: "Herkunft, Standard mcp" },
        transactions: {
          type: "array",
          minItems: 1,
          maxItems: MAX_BATCH,
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: TYPES, description: "buy, sell, dividend, fee, split, transfer_in (Einbuchung mit Einstandskurs), transfer_out (Ausbuchung ohne realisierten Gewinn)" },
              date: { type: "string", description: "YYYY-MM-DD" },
              symbol: { type: "string", description: "Ticker; leer = aus isin auflösen" },
              isin: { type: "string", description: "ISIN, z. B. US0378331005" },
              name: { type: "string" },
              quantity: { type: "number", minimum: 0, description: "Stück; bei split das Verhältnis (4 = 1:4)" },
              price: { type: "number", minimum: 0, description: "Kurs je Stück; bei dividend/fee ohne quantity der Gesamtbetrag" },
              currency: { type: "string", description: "ISO-Code, Standard EUR" },
              fees: { type: "number", minimum: 0 },
              taxes: { type: "number" },
              fx_rate: { type: "number", exclusiveMinimum: 0, description: "Fremdwährung je 1 EUR (EZB-Schreibweise, z. B. 1.08 für USD); leer = aktueller EZB-Kurs" },
              note: { type: "string" },
              external_id: { type: "string", description: "Eindeutige ID aus der Quelle (z. B. Parqet-Activity-ID) für die Dublettenprüfung" },
            },
            required: ["type", "date"],
            additionalProperties: false,
          },
        },
      },
      required: ["portfolio", "transactions"],
      additionalProperties: false,
    },
    annotations: { title: "Transaktionen anlegen", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
];

async function findPortfolio(db: SupabaseClient, userId: string, raw: unknown, create: boolean) {
  const key = String(raw ?? "").trim();
  if (!key) throw new PortfolioError("Depot fehlt.");
  if (key.length > 60) throw new PortfolioError("Depotname ist zu lang (max. 60 Zeichen).");
  const { data, error } = await db.from("portfolios").select("id, name, position").eq("user_id", userId);
  if (error) throw error;
  const hit = data.find((p) => p.id === key || p.name.toLowerCase() === key.toLowerCase());
  if (hit) return { id: hit.id as string, name: hit.name as string, created: false };
  if (!create) throw new PortfolioError(`Depot "${key}" gibt es nicht.`);
  const position = data.reduce((m, p) => Math.max(m, p.position + 1), 0);
  const ins = await db.from("portfolios").insert({ user_id: userId, name: key, position }).select("id, name").single();
  if (ins.error) throw ins.error;
  return { id: ins.data.id as string, name: ins.data.name as string, created: true };
}

const num = (v: unknown, def = 0) => (v == null || v === "" ? def : Number(v));

export async function callPortfolioTool(db: SupabaseClient, userId: string, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_portfolio": {
      const filter = typeof args.portfolio === "string" && args.portfolio.trim() ? args.portfolio.trim() : undefined;
      const res = await portfolioOverview(db, userId, filter);
      if (filter && res.portfolios.length === 0) throw new PortfolioError(`Depot "${filter}" gibt es nicht.`);
      return res;
    }
    case "list_transactions": {
      const limit = Math.min(1000, Math.max(1, Math.floor(num(args.limit, 100))));
      let q = db.from("transactions").select(TX_COLS).eq("user_id", userId);
      if (args.portfolio) q = q.eq("portfolio_id", (await findPortfolio(db, userId, args.portfolio, false)).id);
      if (args.symbol) q = q.eq("symbol", String(args.symbol).trim().toUpperCase());
      const { data, error } = await q.order("date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return { count: data.length, transactions: data };
    }
    case "add_transactions": {
      const list = Array.isArray(args.transactions) ? (args.transactions as Record<string, unknown>[]) : [];
      if (list.length === 0) throw new PortfolioError("Keine Transaktionen übergeben.");
      if (list.length > MAX_BATCH) throw new PortfolioError(`Höchstens ${MAX_BATCH} Transaktionen je Aufruf.`);
      const pf = await findPortfolio(db, userId, args.portfolio, true);
      // ISINs ohne Ticker vorab auflösen
      const isins = list.filter((t) => !t.symbol && t.isin).map((t) => String(t.isin).trim().toUpperCase());
      const resolved = new Map((await resolveIsins(db, isins)).map((r) => [r.isin, r]));
      const errors: { index: number; error: string }[] = [];
      const rows: Record<string, unknown>[] = [];
      list.forEach((t, index) => {
        const err = (error: string) => errors.push({ index, error });
        const type = String(t.type ?? "");
        if (!(TYPES as readonly string[]).includes(type)) return err(`Unbekannter Typ "${type}"`);
        const date = String(t.date ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return err("Datum muss YYYY-MM-DD sein");
        const isin = t.isin ? String(t.isin).trim().toUpperCase() : null;
        if (isin && !ISIN_RE.test(isin)) return err(`Ungültige ISIN "${isin}"`);
        const r = isin ? resolved.get(isin) : undefined;
        const symbol = t.symbol ? String(t.symbol).trim().toUpperCase() : r?.symbol ?? null;
        if (!symbol) return err(isin ? `ISIN ${isin} ließ sich keinem Ticker zuordnen; bitte symbol angeben` : "symbol oder isin fehlt");
        if (!SYMBOL_RE.test(symbol)) return err(`Ungültiger Ticker "${symbol}"`);
        const currency = String(t.currency ?? "EUR").trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) return err(`Ungültige Währung "${currency}"`);
        const [quantity, price, fees, taxes] = [num(t.quantity), num(t.price), num(t.fees), num(t.taxes)];
        if ([quantity, price, fees, taxes].some((v) => !Number.isFinite(v)) || quantity < 0 || price < 0 || fees < 0) {
          return err("Zahlen ungültig (Stück, Kurs und Gebühren ≥ 0)");
        }
        if (["buy", "sell", "split", "transfer_in", "transfer_out"].includes(type) && quantity <= 0) return err("quantity fehlt");
        const fx = t.fx_rate == null ? null : Number(t.fx_rate);
        if (fx != null && !(fx > 0)) return err("fx_rate muss > 0 sein");
        rows.push({
          user_id: userId,
          portfolio_id: pf.id,
          symbol,
          isin,
          name: t.name ? String(t.name).slice(0, 200) : r?.name ?? null,
          type,
          date,
          quantity,
          price,
          currency,
          fees,
          taxes,
          fx_rate: fx,
          note: t.note ? String(t.note).slice(0, 500) : null,
          source: args.source === "parqet" ? "parqet" : "mcp",
          external_id: t.external_id ? String(t.external_id).slice(0, 200) : null,
        });
      });
      let inserted = 0;
      if (rows.length) {
        const { data, error } = await db
          .from("transactions")
          .upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        inserted = data.length;
      }
      return {
        portfolio: pf.name,
        portfolio_created: pf.created,
        received: list.length,
        inserted,
        skipped_duplicates: rows.length - inserted,
        errors,
      };
    }
  }
  return undefined;
}
