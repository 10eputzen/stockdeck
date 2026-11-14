// All data in this file is made up.
import { describe, expect, it, vi } from 'vitest'
import { normalize } from './normalize.ts'
import { upload } from './upload.ts'

const { rows } = normalize('demo-bank', [
  { date: '2026-01-11', type: 'buy', isin: 'US0000000001', quantity: 2, amount: 200, fees: 1, iban: 'DE00123456780000000000' },
  { date: '2026-03-01', type: 'dividend', isin: 'US0000000001', amount: 3, taxes: 0.75 },
  { date: '2026-01-10', type: 'deposit', amount: 1000 },
])
const target = { url: 'https://demo.invalid/functions/v1/mcp', apiKey: 'sdk_demo', portfolio: 'Demo' }

function mockFetch(structuredContent: unknown) {
  return vi.fn(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { structuredContent } }), { status: 200 }))
}

describe('upload', () => {
  it('sends only importable rows with whitelisted fields to add_transactions', async () => {
    const f = mockFetch({ inserted: 2, skipped_duplicates: 0, errors: [] })
    const r = await upload(rows, target, f as unknown as typeof fetch)
    expect(r).toEqual({ inserted: 2, duplicates: 0, errors: 0, messages: [] })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(target.url)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sdk_demo')
    const body = JSON.parse(String(init.body))
    expect(body.params.name).toBe('add_transactions')
    expect(body.params.arguments.portfolio).toBe('Demo')
    const txs = body.params.arguments.transactions
    expect(txs).toEqual([
      { type: 'buy', date: '2026-01-11', isin: 'US0000000001', quantity: 2, price: 100, currency: 'EUR', fees: 1, taxes: 0, external_id: rows[0].id },
      { type: 'dividend', date: '2026-03-01', isin: 'US0000000001', quantity: 0, price: 3, currency: 'EUR', fees: 0, taxes: 0.75, external_id: rows[1].id },
    ])
    expect(String(init.body)).not.toContain('DE00123456780000000000')
  })

  it('refuses plain http and keys that are not API keys', async () => {
    const f = mockFetch({})
    await expect(upload(rows, { ...target, url: 'http://demo.invalid/mcp' }, f as unknown as typeof fetch)).rejects.toThrow('https')
    await expect(upload(rows, { ...target, apiKey: 'eyJhbGciOi' }, f as unknown as typeof fetch)).rejects.toThrow('API key')
    expect(f).not.toHaveBeenCalled()
  })

  it('reports tool errors', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { isError: true, content: [{ text: 'Rate limit' }] } })))
    await expect(upload(rows, target, f as unknown as typeof fetch)).rejects.toThrow('Rate limit')
  })
})
