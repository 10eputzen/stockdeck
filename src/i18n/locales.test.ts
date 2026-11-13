import { describe, expect, it } from 'vitest'
import de from '../locales/de.json'
import en from '../locales/en.json'

const keys = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]))

describe('Übersetzungen', () => {
  it('de.json und en.json haben dieselben Schlüssel', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort())
  })
  it('keine leeren Texte', () => {
    for (const [name, d] of [['de', de], ['en', en]] as const)
      for (const k of keys(d)) expect(k.split('.').reduce<any>((o, s) => o[s], d), `${name}:${k}`).not.toBe('')
  })
})
