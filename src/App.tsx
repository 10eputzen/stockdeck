import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { Watchlist } from './Watchlist'
import { clearCache } from './lib/cache'
import { disablePush } from './lib/alerts'
import { CONSENT_PATH, OAuthConsent } from './OAuthConsent'

// Zustimmung für OAuth-Clients (claude.ai-Connector); nach dem Login wieder hierher zurück
const consent = window.location.pathname === CONSENT_PATH

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const login = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: consent ? window.location.origin + CONSENT_PATH + window.location.search : window.location.origin,
      },
    })

  const logout = async () => {
    // Push-Abo zuerst entfernen, solange die Anmeldung noch gilt, sonst gehen Alarme weiter an dieses Gerät
    await disablePush().catch(() => {})
    clearCache()
    window.history.replaceState(null, '', '/')
    await supabase.auth.signOut()
  }

  return (
    <div className={`shell ${session ? 'authed' : ''}`}>
      <header className="topbar">
        <span className="brand">Stockdeck</span>
        {session && (
          <span className="user">
            <span className="muted">{session.user.email}</span>
            <button className="ghost" onClick={logout}>
              Abmelden
            </button>
          </span>
        )}
      </header>
      <main>
        {!ready ? null : session && consent ? (
          <OAuthConsent email={session.user.email} />
        ) : session ? (
          <Watchlist userId={session.user.id} email={session.user.email} onSignOut={logout} />
        ) : (
          <section className="login">
            <h1>{consent ? 'Anmelden, um Zugriff zu erlauben' : 'Deine Watchlist'}</h1>
            <p className="muted">
              {consent ? 'Eine Anwendung möchte sich mit stockdeck verbinden.' : 'Kurse deiner Aktien auf einen Blick.'}
            </p>
            <button className="primary" onClick={login}>
              Mit Google anmelden
            </button>
          </section>
        )}
      </main>
    </div>
  )
}
