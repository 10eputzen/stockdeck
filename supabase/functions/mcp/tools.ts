import { RANGES } from "../_shared/history.ts";

/** Tool-Beschreibungen für tools/list (Schema nach MCP-Spezifikation). */
export const TOOLS = [
  {
    name: "list_watchlist",
    description:
      "Listet alle Aktien auf der Watchlist (in Anzeigereihenfolge, mit Gruppe) mit aktuellem Kurs (in der Währung des Werts, max. 60 s alt), Tagesveränderung, ggf. vor-/nachbörslichem Kurs (extended) und Datum der Aufnahme.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Watchlist anzeigen", readOnlyHint: true },
  },
  {
    name: "search_stock",
    description:
      "Sucht Aktien, ETFs und Kryptowerte nach Name oder Ticker (z. B. 'nvidia', 'SAP', 'bitcoin'). Liefert Ticker und Name; Krypto kommt als Euro- und Dollar-Paar (BTC-EUR, BTC-USD); 'btc-usdt' findet das Dollar-Paar. Vor add_stock nutzen, wenn der Ticker unklar ist.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Firmenname oder Ticker" } },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { title: "Aktie suchen", readOnlyHint: true },
  },
  {
    name: "add_stock",
    description:
      "Fügt eine Aktie per Ticker zur Watchlist hinzu (z. B. 'NVDA', 'SAP.DE', 'BTC-EUR'). Der Ticker wird gegen die Suche geprüft; ist er unbekannt, kommen Vorschläge zurück. Bereits vorhandene Ticker werden nicht doppelt angelegt.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker, z. B. NVDA" },
        name: { type: "string", description: "Optional: Anzeigename, sonst der Name von Finnhub" },
        group: { type: "string", description: "Optional: Gruppe, wird angelegt, falls neu. Leer = Ohne Gruppe." },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    annotations: { title: "Aktie hinzufügen", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "remove_stock",
    description: "Entfernt eine Aktie per Ticker von der Watchlist.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Ticker, z. B. INTC" } },
      required: ["symbol"],
      additionalProperties: false,
    },
    annotations: { title: "Aktie entfernen", readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  {
    name: "list_groups",
    description: "Listet die Gruppen der Watchlist in Anzeigereihenfolge mit Anzahl der Werte, inkl. 'Ohne Gruppe' (name null).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Gruppen anzeigen", readOnlyHint: true },
  },
  {
    name: "move_stock",
    description:
      "Verschiebt eine Aktie der Watchlist ans Ende einer Gruppe. Gruppenname ohne Groß/Klein-Unterschied; fehlt die Gruppe, wird sie angelegt (create_group=false verhindert das). Leerer Name = Ohne Gruppe.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker, z. B. NVDA" },
        group: { type: "string", description: "Zielgruppe, z. B. 'Halbleiter'; leer = Ohne Gruppe" },
        create_group: { type: "boolean", description: "Gruppe anlegen, falls es sie nicht gibt (Standard true)" },
      },
      required: ["symbol", "group"],
      additionalProperties: false,
    },
    annotations: { title: "Aktie verschieben", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_quotes",
    description: "Aktuelle Kurse (in der Währung des Werts, Feld currency) für bis zu 50 Ticker, auch wenn sie nicht auf der Watchlist stehen.",
    inputSchema: {
      type: "object",
      properties: {
        symbols: { type: "array", items: { type: "string" }, maxItems: 50, description: "Ticker, z. B. ['AAPL','MSFT']" },
      },
      required: ["symbols"],
      additionalProperties: false,
    },
    annotations: { title: "Kurse abrufen", readOnlyHint: true },
  },
  {
    name: "get_chart",
    description:
      "Kursverlauf eines Tickers als Kurzfassung: Start-, End-, Hoch- und Tiefkurs, Veränderung in % und " +
      "bis zu 60 Schlusskurse (ausgedünnt). Zeiträume: 1d, 5d, 1mo, 6mo, ytd, 1y, 5y, max.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker, z. B. AAPL" },
        range: { type: "string", enum: [...RANGES], description: "Zeitraum, Standard 1mo" },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    annotations: { title: "Kursverlauf", readOnlyHint: true },
  },
  {
    name: "get_signals",
    description:
      "Signale für bis zu 10 Ticker: Analysten-Konsens (Anzahl Kaufen/Halten/Verkaufen) und mittleres Kursziel, " +
      "Gewinnüberraschung der letzten 4 Quartale, Insider-Käufe/-Verkäufe (6 Monate, nur US), Leerverkaufsquote " +
      "sowie Technik (Abstand 52-Wochen-Hoch, 200-Tage-Schnitt, RSI 14). Information, keine Empfehlung.",
    inputSchema: {
      type: "object",
      properties: {
        symbols: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10, description: "Ticker, z. B. ['NVDA','SAP.DE']" },
      },
      required: ["symbols"],
      additionalProperties: false,
    },
    annotations: { title: "Signale", readOnlyHint: true },
  },
  {
    name: "get_news",
    description: "Aktuelle Nachrichten zu einem Ticker (letzte 7 Tage, neueste zuerst): Überschrift, Quelle, Datum, Link.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker, z. B. AAPL" },
        limit: { type: "integer", minimum: 1, maximum: 30, description: "Anzahl, Standard 10" },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    annotations: { title: "News", readOnlyHint: true },
  },
];
