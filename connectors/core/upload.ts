import { toStockdeck, type StockdeckTx } from './toStockdeck.ts'
import type { NormalizedTx } from './types.ts'

const BATCH = 500

export type UploadTarget = {
  /** MCP endpoint of the user's own instance, e.g. https://<project>.supabase.co/functions/v1/mcp */
  url: string
  /** API key from the account page of the user's own instance. */
  apiKey: string
  /** Portfolio name in stockdeck; created if missing. */
  portfolio: string
}

export type UploadResult = { inserted: number; duplicates: number; errors: number; messages: string[] }

/** Only the importable rows, mapped to stockdeck's shape. */
export function importable(rows: NormalizedTx[]): StockdeckTx[] {
  return rows.flatMap((r) => {
    const m = toStockdeck(r)
    return m.tx ? [m.tx] : []
  })
}

export function assertTarget(t: UploadTarget) {
  let u: URL
  try {
    u = new URL(t.url)
  } catch {
    throw new Error('STOCKDECK_MCP_URL is not a valid URL')
  }
  if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
    throw new Error('STOCKDECK_MCP_URL must use https')
  }
  if (!t.apiKey.startsWith('sdk_')) throw new Error('STOCKDECK_API_KEY must be an API key from the account page (sdk_…)')
  if (!t.portfolio.trim()) throw new Error('portfolio name missing')
}

/**
 * Sends the rows to the add_transactions tool of the user's own stockdeck instance, in batches.
 * Only the whitelisted, mapped fields are sent. Duplicate ids are skipped by the server.
 */
export async function upload(rows: NormalizedTx[], target: UploadTarget, fetchImpl: typeof fetch = fetch): Promise<UploadResult> {
  assertTarget(target)
  const txs = importable(rows)
  const result: UploadResult = { inserted: 0, duplicates: 0, errors: 0, messages: [] }
  for (let i = 0; i < txs.length; i += BATCH) {
    const res = await fetchImpl(target.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${target.apiKey}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: i / BATCH + 1,
        method: 'tools/call',
        params: { name: 'add_transactions', arguments: { portfolio: target.portfolio, transactions: txs.slice(i, i + BATCH) } },
      }),
    })
    if (!res.ok) throw new Error(`upload failed: HTTP ${res.status}`)
    const body = (await res.json()) as {
      error?: { message?: string }
      result?: { isError?: boolean; content?: { text?: string }[]; structuredContent?: { inserted?: number; skipped_duplicates?: number; errors?: { error?: string }[] } }
    }
    if (body.error) throw new Error(`upload failed: ${body.error.message ?? 'unknown error'}`)
    if (body.result?.isError) throw new Error(`upload failed: ${body.result.content?.[0]?.text ?? 'unknown error'}`)
    const s = body.result?.structuredContent ?? {}
    result.inserted += s.inserted ?? 0
    result.duplicates += s.skipped_duplicates ?? 0
    result.errors += s.errors?.length ?? 0
    // Server messages name at most an ISIN or a field, never personal data
    for (const e of s.errors ?? []) if (e.error && !result.messages.includes(e.error)) result.messages.push(e.error)
  }
  return result
}
