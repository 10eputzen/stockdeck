-- Geteilte Watchlists: Der Admin macht aus einer eigenen Gruppe eine geteilte Liste
-- und lädt Personen per E-Mail ein. Alle Mitglieder dürfen Werte hinzufügen, entfernen und sortieren;
-- umbenennen, einladen, entfernen und Teilen beenden darf nur der Besitzer.
-- Eigene Tabellen: Die Policies der privaten Watchlist bleiben unverändert.
-- Doppelte: in einer geteilten Liste jedes Symbol einmal; zur eigenen Watchlist sind Doppelte erlaubt.

-- ---------- Zugang: Admin und Einladungen ----------
alter table public.allowed_emails
  add column is_admin boolean not null default false,
  add column invited_by uuid references auth.users (id) on delete set null;
-- Wer vor dieser Migration freigeschaltet war, wird Admin.
update public.allowed_emails set is_admin = true;

create or replace function public.jwt_email()
returns text
language sql
stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_emails
    where lower(email) = public.jwt_email() and is_admin
  );
$$;

-- Anzeigename aus dem Google-Profil (Vorname), sonst Teil vor dem @
create or replace function public.my_display_name()
returns text
language sql
stable
set search_path = ''
as $$
  select left(coalesce(
    nullif(split_part(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ' ', 1), ''),
    nullif(split_part(public.jwt_email(), '@', 1), ''),
    '?'
  ), 40);
$$;

-- ---------- Tabellen ----------
create table public.shared_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_name text not null default '',
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create index shared_lists_owner_idx on public.shared_lists (owner_id);

create table public.shared_list_members (
  list_id uuid not null references public.shared_lists (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  added_at timestamptz not null default now(),
  primary key (list_id, email)
);
create index shared_list_members_email_idx on public.shared_list_members (email);

create table public.shared_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shared_lists (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-:]{1,20}$'),
  name text check (name is null or char_length(name) <= 200),
  added_by uuid references auth.users (id) on delete set null,
  added_by_name text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (list_id, symbol)
);

-- ---------- Rechte-Helfer (security definer, damit sich die Policies nicht gegenseitig aufrufen) ----------
create or replace function public.can_access_list(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_allowed() and exists (
    select 1 from public.shared_lists l
    where l.id = p_list
      and (l.owner_id = auth.uid()
        or exists (select 1 from public.shared_list_members m where m.list_id = l.id and m.email = public.jwt_email()))
  );
$$;

create or replace function public.owns_list(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_allowed() and exists (
    select 1 from public.shared_lists l where l.id = p_list and l.owner_id = auth.uid()
  );
$$;

-- ---------- Felder, die der Client nicht fälschen darf ----------
create or replace function public.shared_lists_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner_id := auth.uid();
  new.owner_name := public.my_display_name();
  return new;
end;
$$;
create trigger shared_lists_stamp before insert on public.shared_lists
  for each row execute function public.shared_lists_stamp();

create or replace function public.shared_items_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.added_by := auth.uid();
  new.added_by_name := public.my_display_name();
  return new;
end;
$$;
create trigger shared_items_stamp before insert on public.shared_list_items
  for each row execute function public.shared_items_stamp();

-- Höchstens 200 Werte je geteilter Liste (wie MAX_SYMBOLS der market-Function)
create or replace function public.shared_items_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.shared_list_items where list_id = new.list_id) >= 200 then
    raise exception 'Höchstens 200 Werte je Liste' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger shared_items_limit before insert on public.shared_list_items
  for each row execute function public.shared_items_limit();

-- ---------- RLS ----------
alter table public.shared_lists enable row level security;
alter table public.shared_list_members enable row level security;
alter table public.shared_list_items enable row level security;

revoke all on public.shared_lists, public.shared_list_members, public.shared_list_items from anon;
-- Ändern nur der freigegebenen Spalten
revoke update on public.shared_lists, public.shared_list_items from authenticated;
grant update (name) on public.shared_lists to authenticated;
grant update (position) on public.shared_list_items to authenticated;
-- Mitglieder kommen nur über invite_to_list dazu
revoke insert, update on public.shared_list_members from authenticated;

create policy "geteilte Listen lesen" on public.shared_lists
  for select to authenticated using ((select public.can_access_list(id)));
create policy "geteilte Liste anlegen (Admin)" on public.shared_lists
  for insert to authenticated with check ((select public.is_admin()));
create policy "geteilte Liste umbenennen (Besitzer)" on public.shared_lists
  for update to authenticated using ((select public.owns_list(id))) with check ((select public.owns_list(id)));
create policy "geteilte Liste löschen (Besitzer)" on public.shared_lists
  for delete to authenticated using ((select public.owns_list(id)));

create policy "Mitglieder lesen" on public.shared_list_members
  for select to authenticated using ((select public.can_access_list(list_id)));
-- Besitzer entfernt Mitglieder, Mitglieder verlassen die Liste selbst
create policy "Mitglied entfernen oder verlassen" on public.shared_list_members
  for delete to authenticated
  using ((select public.owns_list(list_id)) or (email = (select public.jwt_email()) and (select public.is_allowed())));

create policy "Werte lesen" on public.shared_list_items
  for select to authenticated using ((select public.can_access_list(list_id)));
create policy "Werte hinzufügen" on public.shared_list_items
  for insert to authenticated with check ((select public.can_access_list(list_id)));
create policy "Werte sortieren" on public.shared_list_items
  for update to authenticated
  using ((select public.can_access_list(list_id))) with check ((select public.can_access_list(list_id)));
create policy "Werte entfernen" on public.shared_list_items
  for delete to authenticated using ((select public.can_access_list(list_id)));

-- ---------- Einladen ----------
create or replace function public.invite_to_list(p_list uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not (public.owns_list(p_list) and public.is_admin()) then
    raise exception 'Nur der Besitzer kann einladen' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Ungültige E-Mail-Adresse' using errcode = '22023';
  end if;
  if v_email = public.jwt_email() then
    raise exception 'Das bist du selbst' using errcode = '22023';
  end if;
  if (select count(*) from public.shared_list_members where list_id = p_list) >= 20 then
    raise exception 'Höchstens 20 Personen je Liste' using errcode = 'P0001';
  end if;
  insert into public.allowed_emails (email, invited_by) values (v_email, auth.uid())
    on conflict do nothing;
  insert into public.shared_list_members (list_id, email) values (p_list, v_email)
    on conflict do nothing;
end;
$$;
revoke all on function public.invite_to_list(uuid, text) from public, anon;
grant execute on function public.invite_to_list(uuid, text) to authenticated;

-- Wer nur per Einladung Zugang hatte und in keiner Liste mehr ist, verliert den Zugang zur App.
-- Greift auch, wenn eine Liste gelöscht wird (Cascade). Konto und eigene Daten bleiben.
create or replace function public.shared_members_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.allowed_emails a
   where lower(a.email) = old.email
     and a.invited_by is not null
     and not a.is_admin
     and not exists (select 1 from public.shared_list_members m where m.email = old.email);
  return null;
end;
$$;
create trigger shared_members_cleanup after delete on public.shared_list_members
  for each row execute function public.shared_members_cleanup();

-- ---------- Gruppe teilen / Teilen beenden ----------
-- Macht aus einer eigenen Gruppe eine geteilte Liste (Werte wandern mit, keine Doppelten).
create or replace function public.share_group(p_group uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text;
  v_list uuid;
begin
  select name into v_name from public.watchlist_groups where id = p_group and user_id = auth.uid();
  if v_name is null then
    raise exception 'Gruppe nicht gefunden' using errcode = 'P0002';
  end if;
  -- ohne RETURNING: die Lese-Policy sieht die neue Zeile im selben Befehl noch nicht
  v_list := gen_random_uuid();
  insert into public.shared_lists (id, name) values (v_list, v_name);
  insert into public.shared_list_items (list_id, symbol, name, position)
    select v_list, symbol, name, position from public.watchlist_items
     where group_id = p_group and user_id = auth.uid();
  delete from public.watchlist_items where group_id = p_group and user_id = auth.uid();
  delete from public.watchlist_groups where id = p_group and user_id = auth.uid();
  return v_list;
end;
$$;

-- Beendet das Teilen: Werte kommen als eigene Gruppe zurück, die Liste verschwindet für alle.
create or replace function public.unshare_list(p_list uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text;
  v_group uuid;
  v_pos integer;
begin
  if not public.owns_list(p_list) then
    raise exception 'Nur der Besitzer kann das Teilen beenden' using errcode = '42501';
  end if;
  select name into v_name from public.shared_lists where id = p_list;
  if exists (select 1 from public.watchlist_groups where user_id = auth.uid() and lower(name) = lower(v_name)) then
    v_name := left(v_name, 50) || ' (geteilt)';
  end if;
  select coalesce(max(position) + 1, 0) into v_pos from public.watchlist_groups where user_id = auth.uid();
  insert into public.watchlist_groups (name, position) values (v_name, v_pos)
    on conflict do nothing returning id into v_group;
  if v_group is null then
    raise exception 'Gruppenname schon vergeben' using errcode = '23505';
  end if;
  -- Was schon in der eigenen Watchlist steht, bleibt dort (keine Doppelten)
  insert into public.watchlist_items (symbol, name, group_id, position)
    select symbol, name, v_group, position from public.shared_list_items where list_id = p_list
    on conflict (user_id, symbol) do nothing;
  delete from public.shared_lists where id = p_list;
  return v_group;
end;
$$;

-- Reihenfolge in einem Rutsch (RLS greift, da security invoker)
create or replace function public.reorder_shared(p_list uuid, p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.shared_list_items s
     set position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where s.id = o.id and s.list_id = p_list;
$$;

revoke all on function public.share_group(uuid) from public, anon;
revoke all on function public.unshare_list(uuid) from public, anon;
revoke all on function public.reorder_shared(uuid, uuid[]) from public, anon;
grant execute on function public.share_group(uuid) to authenticated;
grant execute on function public.unshare_list(uuid) to authenticated;
grant execute on function public.reorder_shared(uuid, uuid[]) to authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.can_access_list(uuid) from public, anon;
revoke all on function public.owns_list(uuid) from public, anon;
grant execute on function public.can_access_list(uuid) to authenticated;
grant execute on function public.owns_list(uuid) to authenticated;
revoke execute on function public.shared_lists_stamp() from public, anon, authenticated;
revoke execute on function public.shared_items_stamp() from public, anon, authenticated;
revoke execute on function public.shared_items_limit() from public, anon, authenticated;
revoke execute on function public.shared_members_cleanup() from public, anon, authenticated;
