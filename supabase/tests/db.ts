// Test-Datenbank: alle Migrationen in PGlite (Postgres als WASM, ohne Docker) auf einem
// minimalen Nachbau der Supabase-Schemas (auth, storage, cron, net, vault).
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create schema cron;
create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
create schema net;
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language sql as $$ select 1::bigint $$;
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`

const DIR = join(import.meta.dirname, '..', 'migrations')

export type Db = PGlite & {
  /** SQL als angemeldeter Nutzer (Rolle authenticated, JWT mit sub und email); Rollback-frei, Zustand bleibt. */
  as: <T = Record<string, unknown>>(user: { id: string; email: string }, sql: string, params?: unknown[]) => Promise<T[]>
}

export async function freshDb(): Promise<Db> {
  const db = new PGlite() as Db
  await db.exec(STUB)
  for (const f of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    // Erweiterungen gibt es in PGlite nicht; ihre Schemas sind oben nachgebaut
    const sql = readFileSync(join(DIR, f), 'utf8').replace(/^create extension[^;]*;/gim, '')
    try {
      await db.exec(sql)
    } catch (e) {
      throw new Error(`${f}: ${(e as Error).message}`)
    }
  }
  db.as = async (user, sql, params = []) => {
    await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' }).replace(/'/g, "''")}', false); set role authenticated;`)
    try {
      return (await db.query(sql, params)).rows as never
    } finally {
      await db.exec('reset role;')
    }
  }
  return db
}
