-- API-Keys für den MCP-Server in der App anlegen, auflisten und widerrufen.
-- Die Tabelle bleibt ohne Policies; die App greift nur über diese Funktionen zu.
-- Den Klartext erzeugt der Browser, hier kommt nur der SHA-256-Hash an.

create or replace function public.list_api_keys()
returns table (id uuid, label text, created_at timestamptz, last_used_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.label, k.created_at, k.last_used_at
    from public.api_keys k
   where k.user_id = auth.uid()
     and k.revoked_at is null
   order by k.created_at;
$$;

create or replace function public.create_api_key(p_label text, p_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  if auth.uid() is null or not public.is_allowed() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(v_label) not between 1 and 60 then
    raise exception 'label must be 1 to 60 characters' using errcode = '22023';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid key hash' using errcode = '22023';
  end if;
  if (select count(*) from public.api_keys k where k.user_id = auth.uid() and k.revoked_at is null) >= 20 then
    raise exception 'too many active keys' using errcode = '54000';
  end if;
  insert into public.api_keys (user_id, key_hash, label)
  values (auth.uid(), p_hash, v_label)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.revoke_api_key(p_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with r as (
    update public.api_keys k
       set revoked_at = now()
     where k.id = p_id
       and k.user_id = auth.uid()
       and k.revoked_at is null
    returning 1
  )
  select exists (select 1 from r);
$$;

revoke all on function public.list_api_keys() from public, anon;
revoke all on function public.create_api_key(text, text) from public, anon;
revoke all on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.list_api_keys() to authenticated;
grant execute on function public.create_api_key(text, text) to authenticated;
grant execute on function public.revoke_api_key(uuid) to authenticated;
