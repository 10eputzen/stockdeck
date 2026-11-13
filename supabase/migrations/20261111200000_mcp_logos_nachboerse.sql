-- API-Keys für den MCP-Server (KI-Zugriff auf die Watchlist).
-- Gespeichert wird nur der SHA-256-Hash; der Klartext liegt beim Nutzer bzw. im Secret Manager.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  label text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_user_idx on public.api_keys (user_id);
alter table public.api_keys enable row level security;
-- keine Policies: nur Service-Role und SQL-Editor sehen die Tabelle

-- Löst einen Key-Hash in die Nutzer-ID auf, wenn der Key aktiv und der Nutzer
-- auf der Zugangsliste ist. Merkt sich die letzte Nutzung.
create or replace function public.api_key_user(p_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  update public.api_keys k
     set last_used_at = now()
    from auth.users u
   where k.key_hash = p_hash
     and k.revoked_at is null
     and u.id = k.user_id
     and exists (
       select 1 from public.allowed_emails a where lower(a.email) = lower(u.email)
     )
  returning k.user_id into v_user;
  return v_user;
end;
$$;
revoke all on function public.api_key_user(text) from public, anon, authenticated;
grant execute on function public.api_key_user(text) to service_role;

-- Firmenprofil je Symbol (Logo, Name), Cache aus Finnhub /stock/profile2.
-- Geschrieben nur von Edge Functions (Service-Role).
create table public.symbol_profiles (
  symbol text primary key,
  name text,
  logo_url text,
  fetched_at timestamptz not null default now()
);
alter table public.symbol_profiles enable row level security;
create policy "Profile lesen" on public.symbol_profiles
  for select to authenticated
  using ((select public.is_allowed()));

-- Vor- und nachbörslicher Kurs (Yahoo-Chartdaten) im Kurs-Cache.
alter table public.quotes
  add column ext_session text check (ext_session in ('pre', 'post')),
  add column ext_price numeric,
  add column ext_change_pct numeric,
  add column ext_time timestamptz;
