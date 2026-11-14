// Shared types for bank and broker connectors.
//
// PRIVACY: a connector hands the core loose candidate objects. The core copies only the
// whitelisted fields below into fresh objects (see normalize.ts). Nothing else can leave.

/** Transaction kinds of the normalized format. Cash kinds are kept for the summary but not imported. */
export const KINDS = ['buy', 'sell', 'dividend', 'fee', 'deposit', 'withdrawal', 'interest', 'tax', 'tax_refund'] as const
export type Kind = (typeof KINDS)[number]

/** Kinds stockdeck can store (it has no cash account). */
export const IMPORTABLE: readonly Kind[] = ['buy', 'sell', 'dividend', 'fee']

/**
 * The whitelist. These are the only fields that ever leave a connector:
 * date, kind, ISIN, quantity, amount, currency, fees, taxes, plus the connector id and a hash id.
 */
export type NormalizedTx = {
  bank: string
  date: string // YYYY-MM-DD
  type: Kind
  isin: string | null
  quantity: number // always >= 0, direction comes from `type`
  amount: number // gross amount before fees and taxes, always >= 0
  currency: string // ISO 4217
  fees: number // >= 0
  taxes: number // paid taxes > 0, refunds < 0
  id: string // stable hash of the fields above, for duplicate detection
}

/** What a connector's parser returns per row. Extra properties are allowed but always dropped. */
export type Candidate = {
  date?: unknown
  type?: unknown
  isin?: unknown
  quantity?: unknown
  amount?: unknown
  currency?: unknown
  fees?: unknown
  taxes?: unknown
  [other: string]: unknown
}

export type ParseOutput = {
  rows: Candidate[]
  /** Rows the connector skipped on purpose, e.g. pending orders. Reason text must not contain row data. */
  skipped: { reason: string }[]
  /** Optional local cross-check, e.g. holdings per ISIN from the bank. Never exported. */
  holdings?: Map<string, number>
}

export type FetchOptions = {
  /** Fetch only the last N days (delta import). Undefined = full history. */
  sinceDays?: number
}

export type Connector = {
  /** Short id, used on the command line and in the output, e.g. "trade-republic". */
  id: string
  aliases?: string[]
  name: string
  /** External programs the user installs, e.g. ["pytr"]. */
  requires: string[]
  /** One line on how the user logs in. Shown before fetch starts. */
  loginHint: string
  /** Optional local checks before fetch, e.g. "stored credentials found". Printed as warnings. */
  preflight?(): Promise<string[]>
  /**
   * Runs the bank tool on the user's machine and writes raw files into `tmpDir`.
   * The user types credentials straight into the bank tool (inherited terminal);
   * a connector never reads, stores or logs them. `tmpDir` is deleted afterwards.
   */
  fetch(tmpDir: string, opts?: FetchOptions): Promise<void>
  /** Turns the raw files in `tmpDir` into candidates. Pure, no network. */
  parse(tmpDir: string): Promise<ParseOutput>
}
