/** Hell/Dunkel: Wahl je Gerät (localStorage), "system" folgt dem Betriebssystem. */
export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'stockdeck-theme'
export const THEME_EVENT = 'stockdeck-theme'
const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* privater Modus */
  }
  return 'system'
}

export function resolveTheme(p = getThemePref()): 'light' | 'dark' {
  return p === 'system' ? (mq().matches ? 'dark' : 'light') : p
}

export function applyTheme() {
  const t = resolveTheme()
  const root = document.documentElement
  if (root.dataset.theme !== t) {
    root.dataset.theme = t
    window.dispatchEvent(new Event(THEME_EVENT))
  }
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg))
}

export function setThemePref(p: ThemePref) {
  try {
    if (p === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, p)
  } catch {
    /* egal */
  }
  applyTheme()
}

/** Einmal beim Start: Systemwechsel mitnehmen, solange "system" gewählt ist. */
export function watchSystemTheme() {
  mq().addEventListener('change', () => getThemePref() === 'system' && applyTheme())
  applyTheme()
}
