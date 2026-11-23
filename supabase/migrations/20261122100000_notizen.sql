-- Notizen je Aktie (Investment-These, Kaufgründe, Beobachtungen): privat je Nutzer, auch per MCP.
create table public.stock_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-:]{1,20}$'),
  body text not null check (char_length(body) between 1 and 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
alter table public.stock_notes enable row level security;

create policy "eigene Notizen lesen" on public.stock_notes
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Notizen anlegen" on public.stock_notes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Notizen ändern" on public.stock_notes
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Notizen löschen" on public.stock_notes
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));

grant select, insert, update, delete on public.stock_notes to authenticated;
