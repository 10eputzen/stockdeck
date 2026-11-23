-- Zugangsliste in der App verwalten (#2): Admins sehen, vergeben und entziehen Zugänge.
-- Die Tabelle bleibt ohne Policies (niemand liest sie direkt); alles läuft über diese Funktionen,
-- die zuerst is_admin() prüfen. Ein Admin kann sich selbst weder entfernen noch herabstufen,
-- so bleibt immer mindestens ein Admin. Entziehen löscht weder Konto noch Daten.

alter table public.allowed_emails
  add column if not exists created_at timestamptz not null default now();

create or replace function public.admin_list_access()
returns table (email text, is_admin boolean, invited boolean, has_account boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins' using errcode = '42501';
  end if;
  -- Ältere Einträge können sich nur in der Schreibweise unterscheiden: je Adresse eine Zeile
  return query
    select lower(a.email), bool_or(a.is_admin), bool_and(a.invited_by is not null),
           exists (select 1 from auth.users u where lower(u.email) = lower(min(a.email))),
           min(a.created_at)
      from public.allowed_emails a
     group by lower(a.email)
     order by 2 desc, 1;
end;
$$;

create or replace function public.admin_grant_access(p_email text, p_admin boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Ungültige E-Mail-Adresse' using errcode = '22023';
  end if;
  -- Nur per Einladung freigegeben: jetzt dauerhaft (sonst fiele der Zugang mit der letzten Liste weg)
  update public.allowed_emails set invited_by = null where lower(email) = v_email and invited_by is not null;
  if found then
    return;
  end if;
  if exists (select 1 from public.allowed_emails where lower(email) = v_email) then
    raise exception 'Hat schon Zugang' using errcode = '23505';
  end if;
  insert into public.allowed_emails (email, is_admin) values (v_email, coalesce(p_admin, false));
end;
$$;

create or replace function public.admin_set_admin(p_email text, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- Zwei Admins, die sich gleichzeitig gegenseitig entfernen, sollen nicht null Admins hinterlassen
  lock table public.allowed_emails in share row exclusive mode;
  if not public.is_admin() then
    raise exception 'Nur für Admins' using errcode = '42501';
  end if;
  if v_email = public.jwt_email() then
    raise exception 'Die eigene Rolle lässt sich nicht ändern' using errcode = '22023';
  end if;
  update public.allowed_emails set is_admin = coalesce(p_admin, false) where lower(email) = v_email;
  if not found then
    raise exception 'Kein Eintrag' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_revoke_access(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- Zwei Admins, die sich gleichzeitig gegenseitig entfernen, sollen nicht null Admins hinterlassen
  lock table public.allowed_emails in share row exclusive mode;
  if not public.is_admin() then
    raise exception 'Nur für Admins' using errcode = '42501';
  end if;
  if v_email = public.jwt_email() then
    raise exception 'Den eigenen Zugang kann man nicht entziehen' using errcode = '22023';
  end if;
  delete from public.allowed_emails where lower(email) = v_email;
  if not found then
    raise exception 'Kein Eintrag' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_list_access() from public, anon;
revoke all on function public.admin_grant_access(text, boolean) from public, anon;
revoke all on function public.admin_set_admin(text, boolean) from public, anon;
revoke all on function public.admin_revoke_access(text) from public, anon;
grant execute on function public.admin_list_access() to authenticated;
grant execute on function public.admin_grant_access(text, boolean) to authenticated;
grant execute on function public.admin_set_admin(text, boolean) to authenticated;
grant execute on function public.admin_revoke_access(text) to authenticated;
