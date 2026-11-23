import { describe, expect, it } from 'vitest'
import { isCrypto, isUs } from './symbols'
import { price } from './format'

describe('symbols', () => {
  it('erkennt Kryptopaare', () => {
    expect(['BTC-EUR', 'ETH-USD', 'SHIB-EUR'].every(isCrypto)).toBe(true)
    expect(['AAPL', 'SAP.DE', 'BRK.B', 'BRK-B', 'EURUSD=X'].some(isCrypto)).toBe(false)
  })
  it('erkennt US-Ticker', () => {
    expect(isUs('AAPL') && isUs('BRK.B')).toBe(true)
    expect(isUs('BTC-EUR') || isUs('SAP.DE')).toBe(false)
  })
})

describe('price', () => {
  const digits = (s: string) => s.replace(/[^\d,.]/g, '').split(/[,.]/).pop()!.length
  it('zeigt kleine Kurse mit vier gültigen Ziffern', () => {
    expect(digits(price('EUR').format(0.00001234))).toBe(8)
    expect(digits(price('EUR').format(0.5))).toBe(2)
    expect(digits(price('EUR').format(0.1234))).toBe(4)
  })
  it('lässt normale Kurse wie bisher', () => {
    expect(digits(price('EUR').format(57817.02))).toBe(2)
  })
})
