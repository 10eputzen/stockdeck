import { t } from '../i18n'
import type { TxType } from './supabase'

export const TX_LABEL: Record<TxType, string> = {
  buy: t('common.txBuy'),
  sell: t('common.txSell'),
  dividend: t('common.txDividend'),
  fee: t('common.txFee'),
  split: t('common.txSplit'),
  transfer_in: t('common.txTransferIn'),
  transfer_out: t('common.txTransferOut'),
}
