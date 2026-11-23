// Push-Texte je Sprache; die Sprache kommt aus dem Abo des Geräts (push_subscriptions.lang)
export type Lang = "de" | "en";
export const asLang = (v: unknown): Lang => (v === "en" ? "en" : "de");

/** Finnhub: bmo = vor Eröffnung, amc = nach Schluss, dmh = während des Handels. */
export type Hour = "bmo" | "amc" | "dmh" | null;

const LOCALE: Record<Lang, string> = { de: "de-DE", en: "en-US" };

export function fmt(lang: Lang) {
  const loc = LOCALE[lang];
  const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString(loc, { maximumFractionDigits: 1 })} %`;
  const num = (n: number, cur?: string | null) =>
    `${n.toLocaleString(loc, { maximumFractionDigits: n < 10 ? 3 : 2 })}${cur ? ` ${cur}` : ""}`;
  /** ISO-Datum (YYYY-MM-DD) als Kurzdatum der Sprache. */
  const date = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  /** "morgen"/"tomorrow", sonst Wochentag (Freitag für Montag). */
  const day = (iso: string, tomorrow: boolean) =>
    tomorrow
      ? lang === "de" ? "morgen" : "tomorrow"
      : `${lang === "de" ? "am" : "on"} ${new Date(`${iso}T12:00:00Z`).toLocaleDateString(loc, { weekday: "long", timeZone: "UTC" })}`;
  return { pct, num, date, day };
}

export const TEXTS = {
  de: {
    priceTitle: (sym: string, above: boolean, thr: string) => `${sym} ${above ? "über" : "unter"} ${thr}`,
    priceBody: (price: string, chg: string) => `Kurs jetzt ${price} (${chg} heute).`,
    dayTitle: (sym: string, chg: string) => `${sym} ${chg} heute`,
    dayBody: (price: string, thr: string) => `Kurs ${price}, Alarm ab ±${thr} %.`,
    gainTitle: (name: string, g: string) => `${name} ${g} seit Kauf – Hälfte verkaufen?`,
    gainBody: (thr: string, weeks: number, opened: string) =>
      `Finanzplan: +${thr} % binnen ${weeks} Wochen erreicht (gekauft ${opened}). Nur ein Hinweis.`,
    stopTitle: (name: string, g: string) => `${name}: Stop erreicht (${g})`,
    stopBody: (thr: string) => `Finanzplan: −${thr} % unter Einstand. Nur ein Hinweis, es wird nichts verkauft.`,
    earningsTitle: (sym: string, day: string) => `${sym} meldet ${day} Quartalszahlen`,
    earningsBody: (hour: Hour) =>
      hour === "bmo" ? "Vor Börseneröffnung (US)." : hour === "amc" ? "Nach Börsenschluss (US)." : "Uhrzeit noch offen.",
    testTitle: "Stockdeck-Test",
    testBody: "Push funktioniert. Alarme kommen auch, wenn die App zu ist.",
  },
  en: {
    priceTitle: (sym: string, above: boolean, thr: string) => `${sym} ${above ? "above" : "below"} ${thr}`,
    priceBody: (price: string, chg: string) => `Price now ${price} (${chg} today).`,
    dayTitle: (sym: string, chg: string) => `${sym} ${chg} today`,
    dayBody: (price: string, thr: string) => `Price ${price}, alert at ±${thr} %.`,
    gainTitle: (name: string, g: string) => `${name} ${g} since purchase – sell half?`,
    gainBody: (thr: string, weeks: number, opened: string) =>
      `Financial plan: +${thr} % within ${weeks} weeks reached (bought ${opened}). Just a heads-up.`,
    stopTitle: (name: string, g: string) => `${name}: stop reached (${g})`,
    stopBody: (thr: string) => `Financial plan: −${thr} % below cost. Just a heads-up, nothing is sold.`,
    earningsTitle: (sym: string, day: string) => `${sym} reports earnings ${day}`,
    earningsBody: (hour: Hour) =>
      hour === "bmo" ? "Before the US market opens." : hour === "amc" ? "After the US market closes." : "Time not announced yet.",
    testTitle: "Stockdeck test",
    testBody: "Push works. Alerts arrive even when the app is closed.",
  },
} satisfies Record<Lang, Record<string, unknown>>;
