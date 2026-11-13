// Kleiner Zwischenspeicher im Browser: Die App zeigt beim Start sofort den letzten Stand
// und aktualisiert im Hintergrund (stale-while-revalidate). Schlüssel je Nutzer, damit
// ein Kontowechsel keine fremde Liste zeigt.
const PREFIX = 'stockdeck:v1:'

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Speicher voll oder gesperrt: dann eben ohne Cache
  }
}

export function clearCache() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k)
  } catch {
    // egal
  }
}
