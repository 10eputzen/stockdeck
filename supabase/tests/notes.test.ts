import { beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type Db } from './db'

const a = { id: '00000000-0000-0000-0000-0000000000a1', email: 'a@example.com' }
const b = { id: '00000000-0000-0000-0000-0000000000b2', email: 'b@example.com' }
const out = { id: '00000000-0000-0000-0000-0000000000c3', email: 'out@example.com' }

let db: Db
beforeAll(async () => {
  db = await freshDb()
  await db.exec(`
    insert into auth.users (id, email) values ('${a.id}', '${a.email}'), ('${b.id}', '${b.email}'), ('${out.id}', '${out.email}');
    insert into public.allowed_emails (email) values ('${a.email}'), ('${b.email}');
  `)
}, 60_000)

const fails = async (p: Promise<unknown>) => p.then(() => false, () => true)

describe('Notizen je Aktie', () => {
  it('jeder sieht und ändert nur die eigenen Notizen', async () => {
    await db.as(a, "insert into public.stock_notes (symbol, body) values ('AAPL', 'These A')")
    await db.as(b, "insert into public.stock_notes (symbol, body) values ('AAPL', 'These B')")
    expect(await db.as(a, 'select symbol, body from public.stock_notes')).toEqual([{ symbol: 'AAPL', body: 'These A' }])
    await db.as(b, "update public.stock_notes set body = 'gehackt' where user_id = '" + a.id + "'")
    await db.as(b, "delete from public.stock_notes where user_id = '" + a.id + "'")
    expect(await db.as(a, 'select body from public.stock_notes')).toEqual([{ body: 'These A' }])
  })
  it('keine fremde user_id, kein Zugriff ohne Freigabe, Grenzen werden geprüft', async () => {
    expect(await fails(db.as(b, `insert into public.stock_notes (user_id, symbol, body) values ('${a.id}', 'MSFT', 'x')`))).toBe(true)
    expect(await fails(db.as(out, "insert into public.stock_notes (symbol, body) values ('MSFT', 'x')"))).toBe(true)
    expect(await db.as(out, 'select * from public.stock_notes')).toEqual([])
    expect(await fails(db.as(a, "insert into public.stock_notes (symbol, body) values ('bad symbol', 'x')"))).toBe(true)
    expect(await fails(db.as(a, "insert into public.stock_notes (symbol, body) values ('MSFT', '')"))).toBe(true)
  })
})
