import 'i18next'
import type en from '../locales/en.json'

// Schlüssel sind typisiert: ein Tippfehler oder fehlender Schlüssel fällt beim Bauen auf
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}
