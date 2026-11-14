// All connectors. A new bank = a new folder next to trade-republic/ plus one line here.
import type { Connector } from './core/types.ts'
import { tradeRepublic } from './trade-republic/index.ts'

export type ConnectorOptions = { checkHoldings?: boolean }

export const CONNECTORS: ((opts: ConnectorOptions) => Connector)[] = [tradeRepublic]

export function findConnector(name: string, opts: ConnectorOptions = {}): Connector | undefined {
  const n = name.toLowerCase()
  return CONNECTORS.map((make) => make(opts)).find((c) => c.id === n || c.aliases?.includes(n))
}
