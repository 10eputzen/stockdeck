-- Security-Check 12.11.2026: Konten nur für freigegebene Adressen.
-- Bisher konnte sich jedes Google-Konto registrieren (sah dank RLS nichts, bekam aber einen
-- Eintrag in auth.users). Der Auth-Hook "before_user_created" lehnt jetzt alle Adressen ab,
-- die nicht in allowed_emails stehen. Bestehende Konten sind nicht betroffen.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if v_email <> '' and exists (select 1 from public.allowed_emails where lower(email) = v_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'Kein Zugang zu stockdeck.')
  );
end;
$$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- Aufräumen: Trigger- und Hilfsfunktionen braucht niemand anonym per REST.
revoke execute on function public.alert_rules_limit() from public, anon, authenticated;
revoke execute on function public.owns_group(uuid) from public, anon;
grant execute on function public.owns_group(uuid) to authenticated;
