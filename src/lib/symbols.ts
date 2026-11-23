/** US-Ticker (Kurse von Finnhub): Buchstaben, optional Aktienklasse (BRK.B). */
export const isUs = (s: string) => /^[A-Z]{1,6}(\.[AB])?$/.test(s)

/** Kryptopaar in Yahoo-Schreibweise (BTC-EUR); handelt rund um die Uhr. */
export const isCrypto = (s: string) => /^[A-Z0-9]{1,15}-(EUR|USD|GBP|CHF|CAD|JPY)$/.test(s)
