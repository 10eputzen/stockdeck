import { LOCALE } from './i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { isoDate } from './lib/format'
import { supabase } from './lib/supabase'

const fmt = (n: number) => n.toLocaleString(LOCALE, { maximumFractionDigits: 4 })
const when = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function ruleText(r: AlertRule) {
  if (r.kind === 'earnings_tomorrow') return KIND_LABEL[r.kind]
  if (r.kind === 'change_pct_day') return `${KIND_LABEL[r.kind]}${fmt(r.threshold)} %`
  return `${KIND_LABEL[r.kind]} ${fmt(r.threshold)}`
}

/** Push-Schalter, Finanzplan-Regeln, Alarmliste und letzte Auslösungen (Konto-Seite). */
export function AlertsSection({ onToast, onOpen }: { onToast: (t: string) => void; onOpen: (symbol: string) => void }) {
  const { t } = useTranslation()
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
      onToast(e instanceof Error ? e.message : t('detail.pushEnableError'))
    }
    setBusy(false)
  }

  async function test() {
    setBusy(true)
    try {
      const n = await sendTestPush()
      onToast(n ? t('detail.testPushSent', { count: n }) : t('detail.noDeviceSubscribed'))
    } catch {
      onToast(t('detail.testPushFailed'))
    }
    setBusy(false)
  }

  async function update(r: AlertRule, patch: Partial<AlertRule>) {
    const { error } = await supabase.from('alert_rules').update(patch).eq('id', r.id)
    if (error) onToast(t('detail.saveFailed'))
    load()
  }

  async function remove(r: AlertRule) {
    await supabase.from('alert_rules').delete().eq('id', r.id)
    load()
  }

  const fp = rules.filter((r) => r.kind.startsWith('finanzplan'))
  const earningsAll = rules.find((r) => r.kind === 'earnings_tomorrow' && !r.symbol)

  async function toggleEarnings(on: boolean) {
    const { error } = on
      ? await supabase.from('alert_rules').insert({ kind: 'earnings_tomorrow', symbol: null, threshold: 1 })
      : await supabase.from('alert_rules').delete().eq('id', earningsAll?.id ?? '')
    if (error) onToast(t('detail.saveFailed'))
    load()
  }
  const own = rules.filter((r) => r.symbol)

  return (
    <>
      <h2 className="mh2">{t('detail.notifications')}</h2>
      <div className="mcard">
        {push === 'ios-browser' ? (
          <p className="mnote">
            {t('detail.pushIosHint')}
          </p>
        ) : push === 'unsupported' ? (
          <p className="mnote">{t('detail.pushUnsupported')}</p>
        ) : push === 'denied' ? (
          <p className="mnote">{t('detail.pushDenied')}</p>
        ) : (
          <>
            <button className="mitem" onClick={toggle} disabled={busy || push == null}>
              {push === 'on' ? t('detail.pushDisableDevice') : t('detail.pushEnableDevice')}
            </button>
            {push === 'on' && (
              <button className="mitem" onClick={test} disabled={busy}>
                {t('detail.sendTestNotification')}
              </button>
            )}
          </>
        )}
      </div>

      <h2 className="mh2">{t('detail.earningsAlerts')}</h2>
      <div className="mcard">
        <div className="mitem alrow">
          <label className="alcheck">
            <input type="checkbox" checked={Boolean(earningsAll)} onChange={(e) => toggleEarnings(e.target.checked)} />
            {t('detail.earningsWatchlist')}
          </label>
        </div>
        <p className="mnote">{t('detail.earningsNote')}</p>
      </div>

      {fp.length > 0 && (
        <>
          <h2 className="mh2">{t('detail.planRules')}</h2>
          <div className="mcard">
            {fp.map((r) => (
              <div className="mitem alrow" key={r.id}>
                <label className="alcheck">
                  <input type="checkbox" checked={r.active} onChange={(e) => update(r, { active: e.target.checked })} />
                  {r.kind === 'finanzplan_gain' ? t('detail.planGainFrom') : t('detail.planStopAt')}
                </label>
                <NumField value={r.threshold} onSave={(v) => update(r, { threshold: v })} suffix="%" />
                {r.kind === 'finanzplan_gain' && (
                  <>
                    <span>{t('detail.within')}</span>
                    <NumField value={r.params.weeks ?? 4} onSave={(v) => update(r, { params: { ...r.params, weeks: Math.round(v) } })} suffix={t('detail.weeksShort')} />
                  </>
                )}
              </div>
            ))}
            <p className="mnote">
              {t('detail.planRulesNote', {
                since: fp[0]?.params.since ? isoDate(fp[0].params.since) : t('detail.immediately'),
                excluded: fp[0]?.params.exclude?.join(', ') || t('detail.nothingExcluded'),
              })}
            </p>
          </div>
        </>
      )}

      <h2 className="mh2">{t('detail.priceAlerts')}</h2>
      <div className="mcard">
        {own.length === 0 && <p className="mnote">{t('detail.noPriceAlerts')}</p>}
        {own.map((r) => (
          <div className="mitem alrow" key={r.id}>
            <button className="linkbtn" onClick={() => onOpen(r.symbol!)}>
              {r.symbol}
            </button>
            <span className={r.active ? '' : 'muted'}>
              {ruleText(r)}
              {!r.active && ` · ${t('detail.triggered')}`}
            </span>
            <button className="ghost icon" onClick={() => remove(r)} aria-label={t('detail.deleteSymbolAlert', { symbol: r.symbol ?? '' })} title={t('detail.delete')}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <h2 className="mh2">{t('detail.recentlyTriggered')}</h2>
      <div className="mcard">
        {events.length === 0 && <p className="mnote">{t('detail.nothingTriggeredYet')}</p>}
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
  const { t } = useTranslation()
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
    const n = kind === 'earnings_tomorrow' ? 1 : parseNum(value)
    if (!Number.isFinite(n) || n <= 0) return setError(t('detail.enterPositiveValue'))
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
      <h2 id="al-title">{t('detail.alertsForSymbol', { symbol })}</h2>
      {price != null && (
        <p className="muted small">
          {t('detail.currentPriceNote', { price: fmt(price), currency: currency ?? '' })}
        </p>
      )}
      {rules.length > 0 && (
        <ul className="allist">
          {rules.map((r) => (
            <li key={r.id}>
              <span className={r.active ? '' : 'muted'}>
                {ruleText(r)} {r.kind !== 'change_pct_day' && r.kind !== 'earnings_tomorrow' && (currency ?? '')}
                {!r.active && ` · ${t('detail.triggered')}`}
              </span>
              <button className="ghost icon" onClick={() => remove(r)} aria-label={t('detail.deleteAlert')} title={t('detail.delete')}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="fgrid">
        <label>
          {t('detail.alertType')}
          <select value={kind} onChange={(e) => pick(e.target.value as AlertKind)}>
            <option value="price_above">{t('detail.kindPriceAbove')}</option>
            <option value="price_below">{t('detail.kindPriceBelow')}</option>
            <option value="change_pct_day">{t('detail.kindChangePctDay')}</option>
            <option value="earnings_tomorrow">{t('detail.kindEarnings')}</option>
          </select>
        </label>
        <label className={kind === 'earnings_tomorrow' ? 'hidden-keep' : undefined}>
          {kind === 'change_pct_day' ? t('detail.percent') : t('detail.priceWithCurrency', { currency: currency ?? t('detail.quoteCurrency') })}
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        </label>
      </div>
      {push && push !== 'on' && <p className="muted small">{t('detail.pushOffHint')}</p>}
      {error && <p className="error small">{error}</p>}
      <div className="dialog-actions">
        <button className="ghost" onClick={() => dialog.current?.close()}>
          {t('detail.close')}
        </button>
        <button className="primary" onClick={add}>
          {t('detail.createAlert')}
        </button>
      </div>
    </dialog>
  )
}
