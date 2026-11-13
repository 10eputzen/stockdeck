-- Nächster Quartalstermin je Symbol (Finnhub /calendar/earnings), 24-h-Cache.
-- Geschrieben nur von Edge Functions (Service-Role); auch Symbole ohne Termin werden
-- gespeichert (next_date null), damit sie nicht bei jedem Aufruf erneut abgefragt werden.
create table public.symbol_events (
  symbol text primary key,
  next_date date,
  hour text check (hour in ('bmo', 'amc', 'dmh')),
  quarter smallint,
  fiscal_year smallint,
  eps_estimate numeric,
  revenue_estimate numeric,
  fetched_at timestamptz not null default now()
);
alter table public.symbol_events enable row level security;
create policy "Termine lesen" on public.symbol_events
  for select to authenticated
  using ((select public.is_allowed()));
