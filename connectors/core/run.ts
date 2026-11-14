import { rmSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalize, quantities } from './normalize.ts'
import type { Connector, NormalizedTx } from './types.ts'

export type RunResult = {
  rows: NormalizedTx[]
  /** Reason → count. Reasons never contain row data. */
  skipped: Record<string, number>
  /** Holdings check against the bank, if the connector provided holdings. */
  mismatches?: { isin: string; computed: number; bank: number }[]
}

function tally(reasons: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of reasons) out[r] = (out[r] ?? 0) + 1
  return out
}

/**
 * Runs a connector in a fresh temporary folder and returns only normalized rows.
 * The folder with the bank tool's raw output is always deleted, also on errors.
 */
export async function runConnector(c: Connector): Promise<RunResult> {
  const dir = await mkdtemp(join(tmpdir(), 'stockdeck-connect-'))
  // Ctrl+C during the bank login skips `finally`, so remove the raw data here as well
  const abort = () => {
    rmSync(dir, { recursive: true, force: true })
    process.exit(130)
  }
  process.once('SIGINT', abort)
  process.once('SIGTERM', abort)
  try {
    await c.fetch(dir)
    const parsed = await c.parse(dir)
    const { rows, rejected } = normalize(c.id, parsed.rows)
    const result: RunResult = {
      rows,
      skipped: tally([...parsed.skipped.map((s) => s.reason), ...rejected.map((r) => r.reason)]),
    }
    if (parsed.holdings) {
      const computed = quantities(rows)
      const isins = new Set([...computed.keys(), ...parsed.holdings.keys()])
      result.mismatches = [...isins]
        .map((isin) => ({ isin, computed: computed.get(isin) ?? 0, bank: parsed.holdings!.get(isin) ?? 0 }))
        .filter((m) => Math.abs(m.computed - m.bank) > 1e-6)
    }
    return result
  } finally {
    process.off('SIGINT', abort)
    process.off('SIGTERM', abort)
    await rm(dir, { recursive: true, force: true })
  }
}
