import { useCallback, useEffect, useRef, useState } from 'react'
import { parseNum } from './lib/csv'
import {
  disablePush,
  enablePush,
  KIND_LABEL,
  pushState,
  RULE_COLS,
  sendTestPush,
  type AlertEvent,
  type AlertKind,
  type AlertRule,
  type PushState,
} from './lib/alerts'
import { supabase } from './lib/supabase'

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 4 })
const when = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function ruleText(r: AlertRule) {
  if (r.kind === 'change_pct_day') return `${KIND_LABEL[r.kind]}${fmt(r.threshold)} %`
  return `${KIND_LABEL[r.kind]} ${fmt(r.threshold)}`
}

/** Push-Schalter, Finanzplan-Regeln, Alarmliste und letzte Auslösungen (Konto-Seite). */
export function AlertsSection({ onToast, onOpen }: { onToast: (t: string) => void; onOpen: (symbol: string) => void }) {
  const [push, setPush] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState<AlertRule[]>([])
  const [events, setEvents] = useState<AlertEvent[]>([])

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([
      supabase.from('alert_rules').select(RULE_COLS).order('created_at'),
      supabase.from('alert_events').select('id, kind, symbol, title, body, pushed, created_at').order('created_at', { ascending: false }).limit(20),
    ])
    setRules((r.data ?? []) as AlertRule[])
    setEvents((e.data ?? []) as AlertEvent[])
  }, [])

  useEffect(() => {
    pushState().then(setPush).catch(() => setPush('unsupported'))
    load()
  }, [load])

  async function toggle() {
    setBusy(true)
    try {
      if (push === 'on') await disablePush()
      else await enablePush()
      setPush(await pushState())
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Push konnte nicht eingeschaltet werden.')
    }
    setBusy(false)
  }

  async function test() {
    setBusy(true)
    try {
      const n = await sendTestPush()
      onToast(n ? `Testnachricht an ${n} Gerät${n === 1 ? '' : 'e'} geschickt.` : 'Kein Gerät angemeldet.')
    } catch {
      onToast('Test fehlgeschlagen.')
    }
    setBusy(false)
  }

  async function update(r: AlertRule, patch: Partial<AlertRule>) {
    const { error } = await supabase.from('alert_rules').update(patch).eq('id', r.id)
    if (error) onToast('Speichern fehlgeschlagen.')
    load()
  }

  async function remove(r: AlertRule) {
    await supabase.from('alert_rules').delete().eq('id', r.id)
    load()
  }

  const fp = rules.filter((r) => r.kind.startsWith('finanzplan'))
  const own = rules.filter((r) => r.symbol)

  return (
    <>
      <h2 className="mh2">Benachrichtigungen</h2>
      <div className="mcard">
        {push === 'ios-browser' ? (
          <p className="mnote">
            Auf dem iPhone kommen Push-Nachrichten nur aus der App auf dem Home-Bildschirm: In Safari „Teilen“ → „Zum Home-Bildschirm“ wählen
            und Stockdeck von dort öffnen.
          </p>
        ) : push === 'unsupported' ? (
          <p className="mnote">Dieser Browser unterstützt keine Push-Nachrichten.</p>
        ) : push === 'denied' ? (
          <p className="mnote">Benachrichtigungen sind für Stockdeck blockiert. Bitte in den Browser-Einstellungen erlauben.</p>
        ) : (
          <>
            <button className="mitem" onClick={toggle} disabled={busy || push == null}>
              {push === 'on' ? 'Push auf diesem Gerät ausschalten' : 'Push auf diesem Gerät einschalten'}
            </button>
            {push === 'on' && (
              <button className="mitem" onClick={test} disabled={busy}>
                Testnachricht senden
              </button>
            )}
          </>
        )}
      </div>

      {fp.length > 0 && (
        <>
          <h2 className="mh2">Finanzplan-Regeln</h2>
          <div className="mcard">
            {fp.map((r) => (
              <div className="mitem alrow" key={r.id}>
                <label className="alcheck">
                  <input type="checkbox" checked={r.active} onChange={(e) => update(r, { active: e.target.checked })} />
                  {r.kind === 'finanzplan_gain' ? 'Gewinn ab' : 'Stop bei −'}
                </label>
                <NumField value={r.threshold} onSave={(v) => update(r, { threshold: v })} suffix="%" />
                {r.kind === 'finanzplan_gain' && (
                  <>
                    <span>binnen</span>
                    <NumField value={r.params.weeks ?? 4} onSave={(v) => update(r, { params: { ...r.params, weeks: Math.round(v) } })} suffix="Wo." />
                  </>
                )}
              </div>
            ))}
            <p className="mnote">
              Gilt für Käufe ab {fp[0]?.params.since ? fp[0].params.since.split('-').reverse().join('.') : 'sofort'}. Nur Hinweise, es wird nichts gehandelt. Ausgenommen: {fp[0]?.params.exclude?.join(', ') || 'nichts'}.
            </p>
          </div>
        </>
      )}

      <h2 className="mh2">Kurs-Alarme</h2>
      <div className="mcard">
        {own.length === 0 && <p className="mnote">Noch keine. Anlegen über die Glocke auf der Seite einer Aktie.</p>}
        {own.map((r) => (
          <div className="mitem alrow" key={r.id}>
            <button className="linkbtn" onClick={() => onOpen(r.symbol!)}>
              {r.symbol}
            </button>
            <span className={r.active ? '' : 'muted'}>
              {ruleText(r)}
              {!r.active && ' · ausgelöst'}
            </span>
            <button className="ghost icon" onClick={() => remove(r)} aria-label={`Alarm ${r.symbol} löschen`} title="Löschen">
              ✕
            </button>
          </div>
        ))}
      </div>

      <h2 className="mh2">Zuletzt ausgelöst</h2>
      <div className="mcard">
        {events.length === 0 && <p className="mnote">Noch nichts ausgelöst.</p>}
        {events.map((e) => (
          <button className="mitem alevent" key={e.id} onClick={() => onOpen(e.symbol)}>
            <span className="alwhen muted small">{when(e.created_at)}</span>
            <span>
              <strong>{e.title}</strong>
              <span className="muted small"> {e.body}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

function NumField({ value, onSave, suffix }: { value: number; onSave: (v: number) => void; suffix: string }) {
  const [v, setV] = useState(String(value).replace('.', ','))
  const save = () => {
    const n = parseNum(v)
    if (Number.isFinite(n) && n > 0 && n !== value) onSave(n)
    else setV(String(value).replace('.', ','))
  }
  return (
    <span className="alnum">
      <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label={suffix} />
      {suffix}
    </span>
  )
}

/** Alarme für eine Aktie anlegen und löschen (Detailseite). */
export function AlertDialog({
  symbol,
  price,
  currency,
  onClose,
}: {
  symbol: string
  price: number | null
  currency: string | null
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [rules, setRules] = useState<AlertRule[]>([])
  const [kind, setKind] = useState<AlertKind>('price_above')
  const [value, setValue] = useState(price ? String(Math.round(price * 1.1 * 100) / 100).replace('.', ',') : '')
  const [error, setError] = useState<string | null>(null)
  const [push, setPush] = useState<PushState | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('alert_rules').select(RULE_COLS).eq('symbol', symbol).order('created_at')
    setRules((data ?? []) as AlertRule[])
  }, [symbol])

  useEffect(() => {
    dialog.current?.showModal()
    load()
    pushState().then(setPush).catch(() => setPush('unsupported'))
  }, [load])

  function pick(k: AlertKind) {
    setKind(k)
    if (k === 'change_pct_day') setValue('5')
    else if (price) setValue(String(Math.round(price * (k === 'price_above' ? 1.1 : 0.9) * 100) / 100).replace('.', ','))
  }

  async function add() {
    setError(null)
    const n = parseNum(value)
    if (!Number.isFinite(n) || n <= 0) return setError('Bitte einen Wert über 0 eingeben.')
    const { error } = await supabase.from('alert_rules').insert({ symbol, kind, threshold: n })
    if (error) return setError(error.message)
    load()
  }

  async function remove(r: AlertRule) {
    await supabase.from('alert_rules').delete().eq('id', r.id)
    load()
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby="al-title">
      <h2 id="al-title">Alarme für {symbol}</h2>
      {price != null && (
        <p className="muted small">
          Kurs jetzt {fmt(price)} {currency ?? ''}. Geprüft wird alle 15 Minuten zur Handelszeit.
        </p>
      )}
      {rules.length > 0 && (
        <ul className="allist">
          {rules.map((r) => (
            <li key={r.id}>
              <span className={r.active ? '' : 'muted'}>
                {ruleText(r)} {r.kind !== 'change_pct_day' && (currency ?? '')}
                {!r.active && ' · ausgelöst'}
              </span>
              <button className="ghost icon" onClick={() => remove(r)} aria-label="Alarm löschen" title="Löschen">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="fgrid">
        <label>
          Art
          <select value={kind} onChange={(e) => pick(e.target.value as AlertKind)}>
            <option value="price_above">Kurs über</option>
            <option value="price_below">Kurs unter</option>
            <option value="change_pct_day">Tagesbewegung ab ± %</option>
          </select>
        </label>
        <label>
          {kind === 'change_pct_day' ? 'Prozent' : `Kurs (${currency ?? 'Kurswährung'})`}
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </label>
      </div>
      {push && push !== 'on' && <p className="muted small">Push ist auf diesem Gerät aus. Einschalten unter Konto.</p>}
      {error && <p className="error small">{error}</p>}
      <div className="dialog-actions">
        <button className="ghost" onClick={() => dialog.current?.close()}>
          Schließen
        </button>
        <button className="primary" onClick={add}>
          Alarm anlegen
        </button>
      </div>
    </dialog>
  )
}
