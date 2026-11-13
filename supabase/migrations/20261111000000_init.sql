-- Stockdeck: Watchlist je Nutzer, Kurs-Cache, Zugangsliste.

-- Wer die App nutzen darf. Einträge werden nicht im Repo gepflegt,
-- sondern direkt in der Datenbank (keine Mail-Adressen im Code).
create table public.allowed_emails (
  email text primary key
);
alter table public.allowed_emails enable row level security;
-- keine Policies: nur Service-Role und SQL-Editor sehen die Tabelle

create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-:]{1,20}$'),
  name text,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);
create index watchlist_items_user_idx on public.watchlist_items (user_id);
alter table public.watchlist_items enable row level security;

create policy "eigene Einträge lesen" on public.watchlist_items
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Einträge anlegen" on public.watchlist_items
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Einträge löschen" on public.watchlist_items
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));

-- Kurs-Cache, geschrieben nur von der Edge Function (Service-Role).
create table public.quotes (
  symbol text primary key,
  price numeric,
  change numeric,
  change_pct numeric,
  prev_close numeric,
  day_high numeric,
  day_low numeric,
  quote_time timestamptz,
  fetched_at timestamptz not null default now()
);
alter table public.quotes enable row level security;
create policy "Kurse lesen" on public.quotes
  for select to authenticated
  using ((select public.is_allowed()));

-- Neue Nutzer starten mit Intel auf der Watchlist.
create or replace function public.seed_watchlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.watchlist_items (user_id, symbol, name)
  values (new.id, 'INTC', 'Intel Corp')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_watchlist();
