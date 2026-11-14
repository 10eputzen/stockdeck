import { useState } from 'react'

const LOGO_KEY = 'stockdeck:logos'
let seen: Set<string> | null = null
function loadSeen() {
  if (!seen) {
    try {
      seen = new Set(JSON.parse(localStorage.getItem(LOGO_KEY) ?? '[]') as string[])
    } catch {
      seen = new Set()
    }
  }
  return seen
}
const seenLogo = (url: string) => loadSeen().has(url)
function markLogo(url: string) {
  const s = loadSeen()
  if (s.has(url) || s.size > 500) return
  s.add(url)
  try {
    localStorage.setItem(LOGO_KEY, JSON.stringify([...s]))
  } catch {
    // ohne Speicher blendet das Logo eben jedes Mal ein
  }
}

/** Logo mit fester Größe: Der Buchstabe steht sofort da, das Bild blendet darüber ein. */
export function Logo({ symbol, url, size = 28 }: { symbol: string; url?: string | null; size?: number }) {
  // Schon einmal geladene Logos erscheinen sofort, ohne Buchstabe und Einblenden (kein Aufblitzen beim Neuladen)
  const known = !!url && seenLogo(url)
  const [state, setState] = useState<'loading' | 'ok' | 'broken'>(known ? 'ok' : 'loading')
  return (
    <span className={`logo fallback ${size > 28 ? 'lg' : ''} ${known ? 'known' : ''}`} aria-hidden="true">
      {state !== 'ok' && symbol.slice(0, 1)}
      {url && state !== 'broken' && (
        <img
          key={url}
          src={url}
          alt=""
          width={size}
          height={size}
          decoding="async"
          draggable={false}
          className={state === 'ok' ? 'shown' : ''}
          onLoad={() => {
            if (url) markLogo(url)
            setState('ok')
          }}
          onError={() => setState('broken')}
        />
      )}
    </span>
  )
}
