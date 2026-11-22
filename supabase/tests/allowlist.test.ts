import { beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type Db } from './db'

const admin = { id: '00000000-0000-0000-0000-00000000000a', email: 'admin@example.com' }
const user = { id: '00000000-0000-0000-0000-00000000000b', email: 'user@example.com' }

let db: Db
beforeAll(async () => {
  db = await freshDb()
  await db.exec(`
    insert into auth.users (id, email) values ('${admin.id}', '${admin.email}'), ('${user.id}', '${user.email}');
    insert into public.allowed_emails (email, is_admin) values ('${admin.email}', true), ('${user.email}', false);
  `)
}, 60_000)

const code = async (p: Promise<unknown>) => {
  try {
    await p
    return 'ok'
  } catch (e) {
    return (e as { code?: string }).code
  }
}

describe('Zugangsliste (#2)', () => {
  it('Nicht-Admins können die Liste weder lesen noch ändern', async () => {
    expect(await db.as(user, 'select * from public.allowed_emails')).toEqual([])
    expect(await code(db.as(user, 'select * from public.admin_list_access()'))).toBe('42501')
    expect(await code(db.as(user, "select public.admin_grant_access('x@example.com')"))).toBe('42501')
    expect(await code(db.as(user, `select public.admin_set_admin('${user.email}', true)`))).toBe('42501')
    expect(await code(db.as(user, `select public.admin_revoke_access('${admin.email}')`))).toBe('42501')
    expect(await code(db.as(user, "insert into public.allowed_emails (email) values ('y@example.com')"))).not.toBe('ok')
  })

  it('Admins vergeben, ändern und entziehen Zugänge', async () => {
    await db.as(admin, "select public.admin_grant_access('  New@Example.com ')")
    let rows = await db.as<{ email: string; is_admin: boolean; has_account: boolean }>(admin, 'select * from public.admin_list_access()')
    expect(rows.map((r) => [r.email, r.is_admin, r.has_account])).toEqual([
      [admin.email, true, true],
      ['new@example.com', false, false],
      [user.email, false, true],
    ])
    await db.as(admin, "select public.admin_set_admin('new@example.com', true)")
    await db.as(admin, "select public.admin_revoke_access('NEW@example.com')")
    rows = await db.as(admin, 'select * from public.admin_list_access()')
    expect(rows.map((r) => r.email)).toEqual([admin.email, user.email])
  })

  it('prüft Eingaben und schützt den eigenen Zugang', async () => {
    expect(await code(db.as(admin, "select public.admin_grant_access('kein-mail')"))).toBe('22023')
    expect(await code(db.as(admin, `select public.admin_grant_access('${user.email}')`))).toBe('23505')
    expect(await code(db.as(admin, `select public.admin_revoke_access('${admin.email}')`))).toBe('22023')
    expect(await code(db.as(admin, `select public.admin_set_admin('${admin.email}', false)`))).toBe('22023')
    expect(await code(db.as(admin, "select public.admin_revoke_access('weg@example.com')"))).toBe('P0002')
  })

  it('macht Einladungs-Zugänge dauerhaft und zeigt Schreibvarianten nur einmal', async () => {
    await db.exec(`insert into public.allowed_emails (email, invited_by) values ('guest@example.com', '${admin.id}'), ('Guest@Example.com', '${admin.id}')`)
    let rows = await db.as<{ email: string; invited: boolean }>(admin, 'select * from public.admin_list_access()')
    expect(rows.filter((r) => r.email === 'guest@example.com')).toEqual([expect.objectContaining({ invited: true })])
    await db.as(admin, "select public.admin_grant_access('guest@example.com')")
    rows = await db.as(admin, 'select * from public.admin_list_access()')
    expect(rows.find((r) => r.email === 'guest@example.com')?.invited).toBe(false)
  })

  it('Entzug sperrt die App, das Konto bleibt', async () => {
    await db.as(admin, `select public.admin_revoke_access('${user.email}')`)
    expect((await db.as<{ ok: boolean }>(user, 'select public.is_allowed() as ok'))[0].ok).toBe(false)
    expect((await db.query('select count(*)::int as n from auth.users')).rows).toEqual([{ n: 2 }])
  })
})
