import { describe, expect, it } from 'vitest'
import { isPaletteKey, rank, score } from './palette'

const e = (label: string, detail?: string, keywords?: string) => ({ id: label, label, detail, keywords })

describe('score/rank', () => {
  const list = [e('AAPL', 'Apple Inc'), e('MSFT', 'Microsoft Corp'), e('APP', 'AppLovin'), e('Portfolio', undefined, 'depot')]
  it('bevorzugt exakte Kürzel und Anfänge', () => {
    expect(rank(list, 'app').map((x) => x.id)).toEqual(['APP', 'AAPL'])
    expect(rank(list, 'aapl')[0].id).toBe('AAPL')
  })
  it('findet über Namen und Stichwörter, alle Wörter müssen passen', () => {
    expect(rank(list, 'micro').map((x) => x.id)).toEqual(['MSFT'])
    expect(rank(list, 'depot').map((x) => x.id)).toEqual(['Portfolio'])
    expect(score(e('AAPL', 'Apple Inc'), 'apple xyz')).toBe(0)
  })
  it('zeigt ohne Suche alles bis zum Limit und kommt mit Sonderzeichen klar', () => {
    expect(rank(list, '', 2)).toHaveLength(2)
    expect(rank([e('BRK.B', 'Berkshire (B)')], '(b')).toHaveLength(1)
  })
})

describe('isPaletteKey', () => {
  const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods })
  const div = { tagName: 'DIV' } as unknown as EventTarget
  const input = { tagName: 'INPUT' } as unknown as EventTarget
  it('Strg/Cmd+K immer, / nur außerhalb von Eingabefeldern', () => {
    expect(isPaletteKey(k('k', { ctrlKey: true }), input)).toBe(true)
    expect(isPaletteKey(k('K', { metaKey: true }), div)).toBe(true)
    expect(isPaletteKey(k('/'), div)).toBe(true)
    expect(isPaletteKey(k('/'), input)).toBe(false)
    expect(isPaletteKey(k('k'), div)).toBe(false)
  })
})
