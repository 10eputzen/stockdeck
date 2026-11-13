-- Signale je Wert (Analysten, Kursziel, Insider, Quartalszahlen, Leerverkauf, Technik), 12 h Cache.
-- Schreiben nur über die market-Function (Service-Role).
create table public.symbol_signals (
  symbol text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.symbol_signals enable row level security;
create policy "Signale lesen" on public.symbol_signals
  for select to authenticated
  using ((select public.is_allowed()));
