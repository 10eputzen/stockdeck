-- Portfolio: Depots und Transaktionen je Nutzer, Positionen werden daraus berechnet
-- (Durchschnittskosten wie Parqet). Dazu ISIN→Symbol-Cache und Währung an den Kursen.

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  position integer not null default 0,
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.portfolios enable row level security;
create policy "eigene Depots lesen" on public.portfolios
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Depots anlegen" on public.portfolios
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Depots ändern" on public.portfolios
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Depots löschen" on public.portfolios
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));

-- Gehört das Depot dem angemeldeten Nutzer? (security definer, damit die Prüfung nicht an RLS hängt)
create or replace function public.owns_portfolio(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.portfolios where id = p and user_id = auth.uid());
$$;
revoke execute on function public.owns_portfolio(uuid) from public, anon;
grant execute on function public.owns_portfolio(uuid) to authenticated;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-:]{1,20}$'),
  isin text check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  name text check (char_length(name) <= 200),
  type text not null check (type in ('buy', 'sell', 'dividend', 'fee', 'split')),
  date date not null,
  -- Stück; bei split das Verhältnis (4 = aus einer Aktie werden vier)
  quantity numeric not null default 0 check (quantity >= 0),
  -- Kurs je Stück in `currency`; bei dividend/fee ohne Stück der Gesamtbetrag
  price numeric not null default 0 check (price >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  fees numeric not null default 0 check (fees >= 0),
  taxes numeric not null default 0,
  -- Fremdwährung je 1 EUR (EZB-Schreibweise, z. B. 1.08 für USD); leer = aktueller EZB-Kurs
  fx_rate numeric check (fx_rate > 0),
  note text check (char_length(note) <= 500),
  source text not null default 'manual' check (source in ('manual', 'csv', 'parqet', 'mcp')),
  external_id text check (char_length(external_id) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, external_id)
);
create index transactions_user_portfolio on public.transactions (user_id, portfolio_id, date);
create index transactions_user_symbol on public.transactions (user_id, symbol);
alter table public.transactions enable row level security;
create policy "eigene Transaktionen lesen" on public.transactions
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Transaktionen anlegen" on public.transactions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowed()) and public.owns_portfolio(portfolio_id));
create policy "eigene Transaktionen ändern" on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed()) and public.owns_portfolio(portfolio_id));
create policy "eigene Transaktionen löschen" on public.transactions
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));

-- ISIN → Kurssymbol (OpenFIGI/Yahoo), geschrieben nur von Edge Functions
create table public.isin_symbols (
  isin text primary key,
  symbol text,
  name text,
  fetched_at timestamptz not null default now()
);
alter table public.isin_symbols enable row level security;
create policy "ISIN-Zuordnung lesen" on public.isin_symbols
  for select to authenticated
  using ((select public.is_allowed()));

-- Kurse außerhalb der USA kommen von Yahoo in Landeswährung
alter table public.quotes add column currency text not null default 'USD';
