import { useEffect, useState } from 'react'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

/** Pfad, auf den Supabase Auth (OAuth-Server) zur Zustimmung umleitet, z. B. für den claude.ai-Connector. */
export const CONSENT_PATH = '/oauth/consent'

type State =
  | { kind: 'loading' }
  | { kind: 'ask'; details: OAuthAuthorizationDetails }
  | { kind: 'redirecting' }
  | { kind: 'error'; message: string }

/** Zustimmungsseite: zeigt, welche Anwendung Zugriff auf Watchlist und Portfolio möchte. */
export function OAuthConsent({ email }: { email?: string }) {
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id')
  const [state, setState] = useState<State>(
    authorizationId ? { kind: 'loading' } : { kind: 'error', message: 'Die Anfrage ist unvollständig.' },
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!authorizationId) return
    let cancelled = false
    ;(async () => {
      // Nur freigeschaltete Konten dürfen Zugriff vergeben
      const { data: allowed } = await supabase.rpc('is_allowed')
      if (cancelled) return
      if (allowed !== true) {
        setState({ kind: 'error', message: 'Dieses Konto ist für stockdeck nicht freigeschaltet.' })
        return
      }
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (cancelled) return
      if (error || !data) {
        setState({ kind: 'error', message: 'Die Anfrage ist abgelaufen oder ungültig. Bitte in der Anwendung neu verbinden.' })
      } else if ('authorization_id' in data) {
        setState({ kind: 'ask', details: data })
      } else {
        setState({ kind: 'redirecting' })
        window.location.assign(data.redirect_url)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authorizationId])

  const decide = async (approve: boolean) => {
    if (!authorizationId) return
    setBusy(true)
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
    if (error || !data) {
      setBusy(false)
      setState({ kind: 'error', message: 'Das hat nicht geklappt. Bitte in der Anwendung neu verbinden.' })
      return
    }
    setState({ kind: 'redirecting' })
    window.location.assign(data.redirect_url)
  }

  if (state.kind === 'loading') return null
  if (state.kind === 'redirecting') {
    return (
      <section className="login">
        <p className="muted">Weiterleitung …</p>
      </section>
    )
  }
  if (state.kind === 'error') {
    return (
      <section className="login">
        <h1>Zugriff nicht möglich</h1>
        <p className="muted">{state.message}</p>
      </section>
    )
  }

  const { client, redirect_uri } = state.details
  let host = redirect_uri
  try {
    host = new URL(redirect_uri).host
  } catch {
    // unverändert anzeigen
  }
  return (
    <section className="login">
      <h1>Zugriff erlauben?</h1>
      <p>
        <strong>{client.name || 'Eine Anwendung'}</strong> möchte auf deine Watchlist und dein Portfolio zugreifen
        und dort Werte und Transaktionen anlegen können. Geld bewegt sie nicht.
      </p>
      <p className="muted">
        Rückkehr zu {host}
        {email ? ` · angemeldet als ${email}` : ''}
      </p>
      <p>
        <button className="primary" disabled={busy} onClick={() => decide(true)}>
          Erlauben
        </button>{' '}
        <button className="ghost" disabled={busy} onClick={() => decide(false)}>
          Ablehnen
        </button>
      </p>
    </section>
  )
}
