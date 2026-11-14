import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { generateKey, sha256Hex } = await import('./apiKeys')

describe('API-Keys', () => {
  it('erzeugt zufällige Schlüssel ohne JWT-Form', () => {
    const a = generateKey()
    const b = generateKey()
    expect(a).toMatch(/^sdk_[\w-]{43}$/)
    expect(a).not.toBe(b)
    expect(a).not.toMatch(/^eyJ/)
  })
  it('hasht wie der MCP-Server (SHA-256, hex)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
