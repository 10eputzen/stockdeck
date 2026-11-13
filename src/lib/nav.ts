import { useSyncExternalStore } from 'react'

/** Gleiche Grenze wie im CSS (@media max-width: 767px). */
const NARROW = '(max-width: 767px)'

export function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(NARROW)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(NARROW).matches,
  )
}

/** Bereiche der Navigation (Handy unten, Desktop oben: Watchlist und Portfolio). */
export type Route = 'liste' | 'suche' | 'portfolio' | 'konto'
const ROUTES: Route[] = ['liste', 'suche', 'portfolio', 'konto']
const SYMBOL_RE = /^[A-Z0-9.\-:]{1,20}$/

export type Loc = { route: Route; symbol: string | null }

function parse(hash: string): Loc {
  const h = hash.replace(/^#\/?/, '')
  if (h.startsWith('s/')) {
    const sym = decodeURIComponent(h.slice(2)).toUpperCase()
    return { route: 'liste', symbol: SYMBOL_RE.test(sym) ? sym : null }
  }
  return { route: ROUTES.includes(h as Route) ? (h as Route) : 'liste', symbol: null }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

function toList() {
  window.history.replaceState(null, '', '#/')
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

function push(hash: string) {
  window.history.pushState({ stockdeckInApp: true, from: window.location.hash }, '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/**
 * Einfaches Hash-Routing: #/ (Liste), #/suche, #/konto, #/s/AAPL (Detailseite).
 * Jeder Wechsel ist ein Verlaufseintrag, die Zurück-Taste funktioniert.
 */
export function useLocation() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  const loc = parse(hash)
  /** Zurück, wenn wir innerhalb der App hierher kamen; sonst (Direktlink) ohne Verlauf zur Liste. */
  const back = () => {
    if (window.history.state?.stockdeckInApp) return window.history.back()
    toList()
  }
  const go = (r: Route) => {
    if (r === loc.route && !loc.symbol) return
    // Zur Liste: über den Verlauf, wenn wir direkt von dort kamen, sonst ohne neuen Eintrag
    if (r === 'liste') return ['', '#', '#/'].includes(window.history.state?.from ?? '?') ? window.history.back() : toList()
    push(`#/${r}`)
  }
  const open = (symbol: string) => push(`#/s/${encodeURIComponent(symbol)}`)
  return { loc, go, open, back }
}
