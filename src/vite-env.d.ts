/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** Öffentliche App-URL (Link in Einladungen); ohne Wert gilt die aktuelle Adresse. */
  readonly VITE_SITE_URL?: string
  /** Öffentlicher VAPID-Schlüssel für Web-Push. */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}
