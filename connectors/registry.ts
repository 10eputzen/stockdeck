// All connectors. A new bank = a new folder next to trade-republic/ plus one line here.
import type { Connector } from './core/types.ts'
import { dkb } from './dkb/index.ts'
import { tradeRepublic } from './trade-republic/index.ts'

export type ConnectorOptions = { checkHoldings?: boolean; env?: Record<string, string | undefined> }

export const CONNECTORS: ((opts: ConnectorOptions) => Connector)[] = [tradeRepublic, dkb]

export function findConnector(name: string, opts: ConnectorOptions = {}): Connector | undefined {
  const n = name.toLowerCase()
  return CONNECTORS.map((make) => make(opts)).find((c) => c.id === n || c.aliases?.includes(n))
}
