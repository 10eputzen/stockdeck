import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id')
  const [state, setState] = useState<State>(
    authorizationId ? { kind: 'loading' } : { kind: 'error', message: t('common.consentIncomplete') },
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
        setState({ kind: 'error', message: t('common.consentNotAllowed') })
        return
      }
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (cancelled) return
      if (error || !data) {
        setState({ kind: 'error', message: t('common.consentExpired') })
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
  }, [authorizationId, t])

  const decide = async (approve: boolean) => {
    if (!authorizationId) return
    setBusy(true)
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
    if (error || !data) {
      setBusy(false)
      setState({ kind: 'error', message: t('common.consentFailed') })
      return
    }
    setState({ kind: 'redirecting' })
    window.location.assign(data.redirect_url)
  }

  if (state.kind === 'loading') return null
  if (state.kind === 'redirecting') {
    return (
      <section className="login">
        <p className="muted">{t('common.redirecting')}</p>
      </section>
    )
  }
  if (state.kind === 'error') {
    return (
      <section className="login">
        <h1>{t('common.consentErrorTitle')}</h1>
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
      <h1>{t('common.consentTitle')}</h1>
      <p>
        <Trans
          i18nKey="common.consentBody"
          values={{ client: client.name || t('common.consentDefaultClient') }}
          components={{ strong: <strong /> }}
        />
      </p>
      <p className="muted">
        {t('common.consentReturnTo', { host })}
        {email ? ` · ${t('common.consentSignedInAs', { email })}` : ''}
      </p>
      <p>
        <button className="primary" disabled={busy} onClick={() => decide(true)}>
          {t('common.allow')}
        </button>{' '}
        <button className="ghost" disabled={busy} onClick={() => decide(false)}>
          {t('common.deny')}
        </button>
      </p>
    </section>
  )
}
