import { useEffect, useState } from 'react'
import { getThemePref, setThemePref, THEME_EVENT, type ThemePref } from './lib/theme'
import { lang, LANGS, setLang } from './i18n'

function useTheme() {
  const [pref, setPref] = useState<ThemePref>(getThemePref)
  useEffect(() => {
    const on = () => setPref(getThemePref())
    window.addEventListener(THEME_EVENT, on)
    return () => window.removeEventListener(THEME_EVENT, on)
  }, [])
  const choose = (p: ThemePref) => {
    setThemePref(p)
    setPref(p)
  }
  return { pref, choose }
}

/** Auswahl im Konto: System, Hell oder Dunkel. */
export function ThemeChoice() {
  const { pref, choose } = useTheme()
  const opts: [ThemePref, string][] = [
    ['system', 'System'],
    ['light', 'Hell'],
    ['dark', 'Dunkel'],
  ]
  return (
    <div className="mcard seg" role="radiogroup" aria-label="Darstellung">
      {opts.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={pref === v} className={pref === v ? 'active' : ''} onClick={() => choose(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

/** Sprachwahl im Konto; ein Wechsel lädt die Seite neu. */
export function LangChoice() {
  return (
    <div className="mcard seg" role="radiogroup" aria-label="Sprache">
      {LANGS.map(({ id, label }) => (
        <button key={id} role="radio" aria-checked={lang === id} className={lang === id ? 'active' : ''} onClick={() => setLang(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}
