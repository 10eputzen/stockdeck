import { lang, t } from '../i18n'
import { supabase } from './supabase'

/** Öffentlicher VAPID-Schlüssel (der private liegt nur in den Supabase-Secrets). */
const VAPID_PUBLIC: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

export type AlertKind = 'price_above' | 'price_below' | 'change_pct_day' | 'finanzplan_gain' | 'finanzplan_stop' | 'earnings_tomorrow'

export type AlertRule = {
  id: string
  kind: AlertKind
  symbol: string | null
  threshold: number
  params: { weeks?: number; exclude?: string[]; since?: string }
  active: boolean
  note: string | null
  created_at: string
}

export type AlertEvent = { id: string; kind: AlertKind; symbol: string; title: string; body: string; pushed: number; created_at: string }

export const KIND_LABEL: Record<AlertKind, string> = {
  price_above: t('common.alertPriceAbove'),
  price_below: t('common.alertPriceBelow'),
  change_pct_day: t('common.alertChangePctDay'),
  finanzplan_gain: t('common.alertFinanzplanGain'),
  finanzplan_stop: t('common.alertFinanzplanStop'),
  earnings_tomorrow: t('common.alertEarnings'),
}

export const RULE_COLS = 'id, kind, symbol, threshold, params, active, note, created_at'

export type PushState = 'unsupported' | 'ios-browser' | 'denied' | 'off' | 'on'

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/** Ist Push auf diesem Gerät eingeschaltet? */
export async function pushState(): Promise<PushState> {
  if (isIos() && !standalone()) return 'ios-browser'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

function keyBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/** Erlaubnis holen, Gerät abonnieren und das Abo in der Datenbank ablegen. */
export async function enablePush(): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error(t('common.notificationsNotAllowed'))
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }))
  const j = sub.toJSON()
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  const { error } = await supabase.from('push_subscriptions').insert({
    endpoint: sub.endpoint,
    p256dh: j.keys?.p256dh,
    auth: j.keys?.auth,
    device: navigator.userAgent.slice(0, 200),
    lang,
  })
  if (error) throw new Error(error.message)
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Testnachricht an alle eigenen Geräte; liefert die Zahl der erreichten Geräte. */
export async function sendTestPush(): Promise<number> {
  const { data, error } = await supabase.functions.invoke('alerts', { body: { action: 'test', lang } })
  if (error) throw error
  return (data as { sent: number }).sent
}

/** Nach einem Sprachwechsel: Push-Texte dieses Geräts in der neuen Sprache. */
export async function syncPushLang(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').update({ lang }).eq('endpoint', sub.endpoint).neq('lang', lang)
}
