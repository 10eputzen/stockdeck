// MCP-Werkzeuge für Notizen je Aktie: lesen, setzen, ergänzen.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SYMBOL_RE } from "../_shared/finnhub.ts";
import { appendNote } from "./noteText.ts";

export class NoteError extends Error {}

export const MAX_NOTE = 10000;

export const NOTE_TOOLS = [
  {
    name: "get_notes",
    description:
      "Liest die eigenen Notizen zu Aktien (Investment-These, Kaufgründe, Beobachtungen). Mit symbol die Notiz zu einem Wert, ohne symbol alle Notizen (neueste zuerst).",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Ticker, z. B. AAPL; leer = alle" } },
      additionalProperties: false,
    },
    annotations: { title: "Notizen lesen", readOnlyHint: true },
  },
  {
    name: "set_note",
    description: `Schreibt die Notiz zu einer Aktie (max. ${MAX_NOTE} Zeichen). mode "replace" ersetzt sie (leerer Text löscht sie), "append" hängt den Text mit Datum als neuen Absatz an.`,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker, z. B. AAPL oder SAP.DE" },
        text: { type: "string", description: "Inhalt der Notiz" },
        mode: { type: "string", enum: ["replace", "append"], description: "Standard replace" },
      },
      required: ["symbol", "text"],
      additionalProperties: false,
    },
    annotations: { title: "Notiz schreiben", readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
];

export const NOTE_TOOL_NAMES = new Set(NOTE_TOOLS.map((t) => t.name));

function symbolOf(raw: unknown) {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!SYMBOL_RE.test(s)) throw new NoteError(`Ungültiger Ticker: ${s || "(leer)"}`);
  return s;
}

export async function callNoteTool(db: SupabaseClient, userId: string, name: string, args: Record<string, unknown>) {
  if (name === "get_notes") {
    let q = db.from("stock_notes").select("symbol, body, updated_at").eq("user_id", userId);
    if (args.symbol) q = q.eq("symbol", symbolOf(args.symbol));
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(500);
    if (error) throw error;
    return { count: data.length, notes: data };
  }
  // set_note
  const symbol = symbolOf(args.symbol);
  const text = String(args.text ?? "");
  const mode = args.mode === "append" ? "append" : "replace";
  if (mode === "replace" && !text.trim()) {
    const { error } = await db.from("stock_notes").delete().eq("user_id", userId).eq("symbol", symbol);
    if (error) throw error;
    return { symbol, deleted: true };
  }
  if (!text.trim()) throw new NoteError("Leerer Text.");
  let body = text;
  if (mode === "append") {
    const { data, error } = await db.from("stock_notes").select("body").eq("user_id", userId).eq("symbol", symbol).maybeSingle();
    if (error) throw error;
    body = appendNote(data?.body ?? null, text, new Date().toISOString().slice(0, 10));
  }
  if (body.length > MAX_NOTE) throw new NoteError(`Notiz zu lang (max. ${MAX_NOTE} Zeichen).`);
  const { error } = await db
    .from("stock_notes")
    .upsert({ user_id: userId, symbol, body, updated_at: new Date().toISOString() }, { onConflict: "user_id,symbol" });
  if (error) throw error;
  return { symbol, length: body.length, mode };
}
