import { describe, expect, it } from 'vitest'
import { parseTradingView } from './tradingview'

describe('parseTradingView', () => {
  it('liest Gruppen, schneidet Börsenpräfix ab und behält die Reihenfolge', () => {
    const r = parseTradingView('###Tech,NASDAQ:NVDA,NASDAQ:MSFT,###China,NASDAQ:BIDU,NYSE:BABA')
    expect(r.groups).toEqual([
      { name: 'Tech', symbols: ['NVDA', 'MSFT'] },
      { name: 'China', symbols: ['BIDU', 'BABA'] },
    ])
    expect(r.unsupported).toEqual([])
  })

  it('ordnet Werte vor dem ersten Abschnitt keiner Gruppe zu', () => {
    const r = parseTradingView('NASDAQ:AAPL,###Halbleiter,NASDAQ:AMD')
    expect(r.groups).toEqual([
      { name: null, symbols: ['AAPL'] },
      { name: 'Halbleiter', symbols: ['AMD'] },
    ])
  })

  it('überspringt Duplikate und meldet Nicht-US-Börsen', () => {
    const r = parseTradingView('NASDAQ:NVDA,XETR:SAP,NASDAQ:NVDA,NYSE:BRK.B')
    expect(r.groups).toEqual([{ name: null, symbols: ['NVDA', 'BRK.B'] }])
    expect(r.unsupported.map((u) => u.raw)).toEqual(['XETR:SAP'])
  })

  it('übernimmt Kryptopaare als Yahoo-Paare, Coin-gegen-Coin nicht', () => {
    const r = parseTradingView('BINANCE:BTCUSDT,COINBASE:BTCUSD,KRAKEN:ETHEUR,BINANCE:ETHBTC')
    expect(r.groups).toEqual([{ name: null, symbols: ['BTC-USD', 'ETH-EUR'] }])
    expect(r.unsupported.map((u) => u.raw)).toEqual(['BINANCE:ETHBTC'])
  })

  it('verträgt Zeilenumbrüche, Leerzeichen, BOM und leere Abschnitte', () => {
    const r = parseTradingView('﻿###A\n NASDAQ:TSLA ,\r\n###B,,###A,nyse:pypl\n')
    expect(r.groups).toEqual([{ name: 'A', symbols: ['TSLA', 'PYPL'] }])
  })

  it('liefert bei leerer Eingabe nichts', () => {
    expect(parseTradingView('')).toEqual({ groups: [], unsupported: [] })
  })
})
