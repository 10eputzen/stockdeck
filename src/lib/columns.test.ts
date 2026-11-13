import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { cleanWidths, cleanOrder, DEFAULT_COLUMNS, DEFAULT_ORDER, gridTemplate } = await import('./columns')

describe('Spaltenreihenfolge', () => {
  it('ergänzt Fehlendes und verwirft Unbekanntes', () => {
    expect(cleanOrder(['price', 'quatsch', 'symbol', 'price'])).toEqual(['price', 'symbol', ...DEFAULT_ORDER.filter((k) => k !== 'price' && k !== 'symbol')])
    expect(cleanOrder(undefined)).toEqual(DEFAULT_ORDER)
  })
  it('Grid folgt der Reihenfolge am Desktop, am Handy bleibt sie fest', () => {
    const cols = { ...DEFAULT_COLUMNS, order: cleanOrder(['earnings', 'analyst']) }
    expect(gridTemplate(cols, false)).toMatch(/^28px minmax\(48px, 112px\)/)
    expect(gridTemplate(cols, true)).toBe(gridTemplate(DEFAULT_COLUMNS, true))
  })
  it('Breiten: begrenzt und nur am Desktop, als Obergrenze', () => {
    expect(cleanWidths({ price: 5, range: 9999, quatsch: 100, name: 'x' })).toEqual({ price: 48, range: 640 })
    const cols = { ...DEFAULT_COLUMNS, widths: { price: 200 } }
    expect(gridTemplate(cols, false).split(' ').join(' ')).toContain('minmax(48px, 200px)')
    expect(gridTemplate(cols, true)).toBe(gridTemplate(DEFAULT_COLUMNS, true))
  })
  it('Name füllt den Rest, bis er selbst eine Breite hat; dann füllt die letzte Spalte', () => {
    expect(gridTemplate(DEFAULT_COLUMNS, false)).toContain('minmax(64px, 1fr)')
    expect(gridTemplate(DEFAULT_COLUMNS, false).endsWith(' 32px')).toBe(true)
    const t = gridTemplate({ ...DEFAULT_COLUMNS, widths: { name: 300 } }, false)
    expect(t).toContain('minmax(48px, 300px)')
    expect(t.endsWith('minmax(32px, 1fr)')).toBe(true)
  })
})
