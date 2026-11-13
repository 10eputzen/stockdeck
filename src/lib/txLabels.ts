import type { TxType } from './supabase'

export const TX_LABEL: Record<TxType, string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Dividende',
  fee: 'Gebühr',
  split: 'Split',
  transfer_in: 'Einbuchung',
  transfer_out: 'Ausbuchung',
}
