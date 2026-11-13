import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import de from '../locales/de.json'
import en from '../locales/en.json'

/** Unterstützte Sprachen; neue Sprache = JSON unter `src/locales/` plus Eintrag hier. */
export type Lang = 'de' | 'en'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
]
const INTL: Record<Lang, string> = { de: 'de-DE', en: 'en-US' }
const STORAGE_KEY = 'stockdeck-lang'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { de: { translation: de }, en: { translation: en } },
    // Tests laufen fest auf Deutsch, damit Erwartungen nicht vom Rechner abhängen
    lng: import.meta.env?.MODE === 'test' ? 'de' : undefined,
    supportedLngs: ['de', 'en'],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    fallbackLng: 'en',
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: STORAGE_KEY, caches: ['localStorage'] },
    interpolation: { escapeValue: false }, // React escaped selbst
    initAsync: false,
    returnNull: false,
  })

/** Aktive Sprache; sie steht pro Seitenaufruf fest, ein Wechsel lädt die Seite neu. */
export const lang: Lang = i18n.resolvedLanguage === 'de' ? 'de' : 'en'
/** Locale für Intl-Formate (Zahlen, Währungen, Datum). */
export const LOCALE = INTL[lang]
if (typeof document !== 'undefined') document.documentElement.lang = lang

/** Übersetzen außerhalb von Komponenten; in Komponenten `useTranslation()` nehmen. */
export const t = i18n.t.bind(i18n)

export function setLang(l: Lang) {
  if (l === lang) return
  void i18n.changeLanguage(l).then(() => window.location.reload())
}

export default i18n
