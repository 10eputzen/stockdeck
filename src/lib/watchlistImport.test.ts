import { describe, expect, it } from 'vitest'
import { parseWatchlist } from './watchlistImport'

describe('parseWatchlist', () => {
  it('reads tickers separated by comma, space, semicolon and new line', () => {
    const r = parseWatchlist('aapl, MSFT NVDA;AMD\n\tTSLA\r\nnasdaq:goog')
    expect(r.groups).toEqual([{ name: null, symbols: ['AAPL', 'MSFT', 'NVDA', 'AMD', 'TSLA', 'GOOG'] }])
    expect(r.unsupported).toEqual([])
  })

  it('takes 20 pasted symbols in one go and ignores duplicates', () => {
    const syms = Array.from({ length: 20 }, (_, i) => `S${i}`)
    const r = parseWatchlist([...syms, 'S1', 's2'].join(' '))
    expect(r.groups[0].symbols).toEqual(syms)
  })

  it('still reads TradingView exports, including group names with spaces', () => {
    const r = parseWatchlist('###Big Tech,NASDAQ:NVDA,NASDAQ:MSFT,###China ADR,NYSE:BABA,XETR:SAP')
    expect(r.groups).toEqual([
      { name: 'Big Tech', symbols: ['NVDA', 'MSFT'] },
      { name: 'China ADR', symbols: ['BABA'] },
    ])
    expect(r.unsupported.map((u) => u.raw)).toEqual(['XETR:SAP'])
  })

  it('flags invalid entries', () => {
    expect(parseWatchlist('AAPL $$$ MSFT').unsupported.map((u) => u.raw)).toEqual(['$$$'])
  })

  it('reads a CSV by its symbol column, with any separator', () => {
    expect(parseWatchlist('Name,Symbol,Price\nApple,AAPL,1\n"Microsoft, Inc",MSFT,2\n').groups).toEqual([
      { name: null, symbols: ['AAPL', 'MSFT'] },
    ])
    expect(parseWatchlist('﻿Ticker;Kurs\nAAPL;1,5\nNVDA;2').groups[0].symbols).toEqual(['AAPL', 'NVDA'])
    expect(parseWatchlist('symbol\tname\nAMD\tAMD Inc').groups[0].symbols).toEqual(['AMD'])
  })

  it('uses a group column when the CSV has one', () => {
    const r = parseWatchlist('Symbol,Group\nAAPL,Tech\nKO,\nMSFT,Tech\nXOM,Energy')
    expect(r.groups).toEqual([
      { name: null, symbols: ['KO'] },
      { name: 'Tech', symbols: ['AAPL', 'MSFT'] },
      { name: 'Energy', symbols: ['XOM'] },
    ])
  })

  it('treats a header-less list with commas as a plain ticker list', () => {
    expect(parseWatchlist('AAPL,MSFT\nNVDA').groups[0].symbols).toEqual(['AAPL', 'MSFT', 'NVDA'])
  })
})
