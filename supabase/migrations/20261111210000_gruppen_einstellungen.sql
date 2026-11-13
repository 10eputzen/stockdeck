-- Gruppen in der Watchlist, Reihenfolge per Drag and Drop, Nutzereinstellungen (Spalten).

-- ---------- Gruppen ----------
create table public.watchlist_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position integer not null default 0,
  collapsed boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index watchlist_groups_user_name_idx on public.watchlist_groups (user_id, lower(name));
alter table public.watchlist_groups enable row level security;

create policy "eigene Gruppen lesen" on public.watchlist_groups
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Gruppen anlegen" on public.watchlist_groups
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Gruppen ändern" on public.watchlist_groups
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Gruppen löschen" on public.watchlist_groups
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));

-- ---------- Werte: Gruppe und Reihenfolge ----------
alter table public.watchlist_items
  add column group_id uuid references public.watchlist_groups (id) on delete set null,
  add column position integer not null default 0;
create index watchlist_items_group_idx on public.watchlist_items (group_id);

-- bisherige Reihenfolge (Aufnahmedatum) übernehmen
update public.watchlist_items w
   set position = r.rn
  from (
    select id, row_number() over (partition by user_id order by created_at) - 1 as rn
    from public.watchlist_items
  ) r
 where r.id = w.id;

-- Gruppe muss dem Nutzer selbst gehören
create or replace function public.owns_group(p_group uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_group is null or exists (
    select 1 from public.watchlist_groups g
    where g.id = p_group and g.user_id = (select auth.uid())
  );
$$;

drop policy "eigene Einträge anlegen" on public.watchlist_items;
create policy "eigene Einträge anlegen" on public.watchlist_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and (select public.is_allowed()) and public.owns_group(group_id)
  );
create policy "eigene Einträge ändern" on public.watchlist_items
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (
    user_id = (select auth.uid()) and (select public.is_allowed()) and public.owns_group(group_id)
  );

-- Reihenfolge in einem Rutsch setzen (RLS greift, da security invoker)
create or replace function public.reorder_items(p_group uuid, p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.watchlist_items w
     set group_id = p_group,
         position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where w.id = o.id
     and w.user_id = (select auth.uid());
$$;

create or replace function public.reorder_groups(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.watchlist_groups g
     set position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where g.id = o.id
     and g.user_id = (select auth.uid());
$$;

revoke all on function public.reorder_items(uuid, uuid[]) from public, anon;
revoke all on function public.reorder_groups(uuid[]) from public, anon;
grant execute on function public.reorder_items(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_groups(uuid[]) to authenticated;

-- ---------- Einstellungen je Nutzer ----------
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 8192),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;

create policy "eigene Einstellungen lesen" on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Einstellungen anlegen" on public.user_settings
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Einstellungen ändern" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
