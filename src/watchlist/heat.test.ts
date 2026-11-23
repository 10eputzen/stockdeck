import { describe, expect, it } from 'vitest'
import { breadth, heatLevel } from './heat'

describe('heat', () => {
  it('heatLevel skaliert bis 3 % und kappt darüber', () => {
    expect(heatLevel(null)).toBeNull()
    expect(heatLevel(NaN)).toBeNull()
    expect(heatLevel(0)).toBe(0)
    expect(heatLevel(-1.5)).toBe(0.5)
    expect(heatLevel(7)).toBe(1)
  })
  it('breadth zählt nur Werte mit Kurs', () => {
    expect(breadth([1, -2, 0, null, 3])).toEqual({ up: 2, down: 1, flat: 1, avg: 0.5 })
    expect(breadth([])).toEqual({ up: 0, down: 0, flat: 0, avg: null })
  })
})
