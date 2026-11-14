import { IMPORTABLE, type NormalizedTx } from './types.ts'

/** A transaction as stockdeck stores it (without symbol: the ISIN is resolved on import). */
export type StockdeckTx = {
  type: 'buy' | 'sell' | 'dividend' | 'fee'
  date: string
  isin: string
  quantity: number
  price: number
  currency: string
  fees: number
  taxes: number
  external_id: string
}

export type Mapped = { tx: StockdeckTx; skip?: undefined } | { tx?: undefined; skip: 'cash' | 'no_isin' }

/**
 * Maps one normalized row to stockdeck's transaction shape. Used by the direct upload and by
 * the CSV import in the app, so both produce the same rows and the same duplicate ids.
 */
export function toStockdeck(r: NormalizedTx): Mapped {
  if (!IMPORTABLE.includes(r.type)) return { skip: 'cash' }
  if (!r.isin) return { skip: 'no_isin' }
  const type = r.type as StockdeckTx['type']
  // Dividends and fees are stored as a total amount without quantity, like the other importers
  const perUnit = (type === 'buy' || type === 'sell') && r.quantity > 0
  return {
    tx: {
      type,
      date: r.date,
      isin: r.isin,
      quantity: perUnit ? r.quantity : 0,
      price: perUnit ? r.amount / r.quantity : r.amount,
      currency: r.currency,
      fees: r.fees,
      taxes: r.taxes,
      external_id: r.id,
    },
  }
}
