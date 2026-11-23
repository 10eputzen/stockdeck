// Reine Textlogik der Notizen (ohne Deno-APIs, damit testbar).

/** Neuer Absatz mit Datum unter den bisherigen Text. */
export function appendNote(old: string | null, text: string, today: string) {
  const add = `${today}: ${text.trim()}`;
  return old ? `${old.trimEnd()}\n\n${add}` : add;
}
