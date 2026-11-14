import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Supabase-URL für die CSP in public/_headers, aus VITE_SUPABASE_URL (.env oder Umgebung). */
let supabaseUrl = ''
const fillHeaders = (text: string) =>
  text.replaceAll('%SUPABASE_URL%', supabaseUrl).replaceAll('%SUPABASE_WSS%', supabaseUrl.replace(/^http/, 'ws'))

/** Header aus public/_headers (Block "/*"), damit CSP-Fehler schon lokal auffallen. */
function siteHeaders(dev: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  let inBlock = false
  for (const line of fillHeaders(readFileSync('public/_headers', 'utf8')).split(/\r?\n/)) {
    if (!line.trim()) continue
    if (!/^\s/.test(line)) {
      inBlock = line.trim() === '/*'
      continue
    }
    const i = line.indexOf(':')
    if (inBlock && i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  const csp = headers['Content-Security-Policy']
  if (dev && csp) {
    // Vite-Dev braucht Inline-Skripte (React Refresh) und den Websocket für Hot Reload
    headers['Content-Security-Policy'] = csp
      .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
      .replace("connect-src 'self'", "connect-src 'self' ws:")
      .replace('; upgrade-insecure-requests', '')
  }
  delete headers['Strict-Transport-Security']
  return headers
}

export default defineConfig(({ mode }) => {
  supabaseUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL ?? ''
  return {
    server: { headers: siteHeaders(true) },
    preview: { headers: siteHeaders(false) },
    plugins: [
      react(),
      {
        name: 'stockdeck-headers',
        apply: 'build',
        closeBundle() {
          if (!supabaseUrl)
            throw new Error('VITE_SUPABASE_URL fehlt (.env oder Umgebung) – CSP in _headers wäre unvollständig')
          writeFileSync('dist/_headers', fillHeaders(readFileSync('public/_headers', 'utf8')))
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Stockdeck',
          short_name: 'Stockdeck',
          description: 'Watchlist und Portfolio',
          lang: 'de',
          theme_color: '#0a0b0d',
          background_color: '#0a0b0d',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          importScripts: ['push-sw.js'],
          // Die Startseite nicht vorab speichern: Sie trägt die Sicherheits-Header (CSP),
          // und eine gespeicherte Kopie würde alte Header weiterreichen. Online immer frisch,
          // offline die letzte Kopie.
          globPatterns: ['**/*.{js,css,svg,png,ico,webmanifest}'],
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: { cacheName: 'pages', networkTimeoutSeconds: 4 },
            },
            {
              // Firmenlogos von Finnhub ändern sich praktisch nie
              urlPattern: ({ url }) => url.hostname.endsWith('finnhub.io') && url.pathname.includes('/stock_logo/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'logos',
                expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
  }
})
