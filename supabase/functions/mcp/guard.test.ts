import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  allowedOrigins,
  claims,
  extractKey,
  isOAuthClientToken,
  JWT_RE,
  negotiateVersion,
  originAllowed,
  PROTOCOL_VERSIONS,
  retryAfter,
  versionSupported,
} from './guard.ts'

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const jwt = (payload: unknown) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`

describe('caller resolution', () => {
  it('takes the key from a bearer header or x-api-key', () => {
    expect(extractKey(new Headers({ authorization: 'Bearer  abc ' }))).toBe('abc')
    expect(extractKey(new Headers({ authorization: 'bearer abc' }))).toBe('abc')
    expect(extractKey(new Headers({ 'x-api-key': 'k1' }))).toBe('k1')
  })

  it('returns null without a usable key', () => {
    expect(extractKey(new Headers())).toBeNull()
    expect(extractKey(new Headers({ authorization: 'Bearer ' }))).toBeNull()
    expect(extractKey(new Headers({ authorization: 'Basic abc' }))).toBeNull()
    expect(extractKey(new Headers({ 'x-api-key': '  ' }))).toBeNull()
  })

  it('tells JWTs (OAuth) apart from API keys', () => {
    expect(JWT_RE.test(jwt({ sub: 'u' }))).toBe(true)
    expect(JWT_RE.test('sd_0123456789abcdef')).toBe(false)
  })

  it('accepts only OAuth client tokens, not app login tokens', () => {
    expect(isOAuthClientToken(jwt({ sub: 'u', client_id: 'c' }))).toBe(true)
    expect(isOAuthClientToken(jwt({ sub: 'u' }))).toBe(false)
    expect(isOAuthClientToken(jwt({ sub: 'u', client_id: 42 }))).toBe(false)
    expect(isOAuthClientToken('not.a.jwt')).toBe(false)
  })

  it('decodes base64url claims with any padding', () => {
    for (const sub of ['a', 'ab', 'abc', 'ü?>']) expect(claims(jwt({ sub }))?.sub).toBe(sub)
  })
})

describe('origin check', () => {
  const allowed = allowedOrigins('https://app.example.org/path', ' https://dev.example.org , not a url,')
  it('allows the app, claude.ai and extra origins', () => {
    expect([...allowed].sort()).toEqual(['https://app.example.org', 'https://claude.ai', 'https://claude.com', 'https://dev.example.org'])
  })
  it('allows requests without Origin (server clients) and rejects foreign browsers', () => {
    expect(originAllowed(null, allowed)).toBe(true)
    expect(originAllowed('https://app.example.org', allowed)).toBe(true)
    expect(originAllowed('https://evil.example', allowed)).toBe(false)
    expect(originAllowed('https://app.example.org.evil.example', allowed)).toBe(false)
  })
  it('ignores an empty site URL', () => {
    expect(allowedOrigins('', '').size).toBe(2)
  })
})

describe('protocol version', () => {
  it('accepts a missing or known header and rejects unknown versions', () => {
    expect(versionSupported(null)).toBe(true)
    expect(versionSupported('2025-06-18')).toBe(true)
    expect(versionSupported('2099-01-01')).toBe(false)
  })
  it('negotiates the requested version or falls back to the newest', () => {
    expect(negotiateVersion('2024-11-05')).toBe('2024-11-05')
    expect(negotiateVersion('1999-01-01')).toBe(PROTOCOL_VERSIONS[0])
    expect(negotiateVersion(undefined)).toBe(PROTOCOL_VERSIONS[0])
  })
})

describe('rate limit', () => {
  it('asks to retry at the start of the next minute', () => {
    expect(retryAfter(new Date('2026-01-01T10:00:15Z'))).toBe('45')
    expect(retryAfter(new Date('2026-01-01T10:00:00Z'))).toBe('60')
  })
  it('is checked before every tool call', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    const route = src.slice(src.indexOf('async function route'))
    expect(route.indexOf('mcp_take_call')).toBeGreaterThan(-1)
    expect(route.indexOf('mcp_take_call')).toBeLessThan(route.indexOf('await handle('))
  })
})

// API-Key-Aufrufe laufen mit dem Service-Role-Schlüssel ohne RLS: jede Abfrage einer Nutzertabelle
// muss deshalb selbst nach user_id filtern (oder sie beim Schreiben setzen).
describe('user scoping', () => {
  const USER_TABLES = ['watchlist_items', 'watchlist_groups', 'transactions', 'portfolios', 'alert_rules', 'api_keys', 'push_subscriptions', 'stock_notes']
  for (const file of ['index.ts', 'portfolio.ts', 'notes.ts', '../_shared/portfolio.ts']) {
    it(`every user-table query in ${file} is scoped to the user`, () => {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8')
      const found: string[] = []
      for (const m of src.matchAll(/\.from\("(\w+)"\)/g)) {
        if (!USER_TABLES.includes(m[1])) continue
        const start = src.lastIndexOf('\n', m.index)
        const end = src.indexOf(';', m.index)
        const stmt = src.slice(start, end)
        found.push(m[1])
        expect(stmt, `${file}: ${stmt.trim()}`).toMatch(/user_id/)
      }
      expect(found.length).toBeGreaterThan(0)
    })
  }
})

describe('Notizen', () => {
  it('append hängt mit Datum an', async () => {
    const { appendNote } = await import('./noteText.ts')
    expect(appendNote(null, ' Kauf ', '2026-11-22')).toBe('2026-11-22: Kauf')
    expect(appendNote('Alt\n', 'Neu', '2026-11-23')).toBe('Alt\n\n2026-11-23: Neu')
  })
})
