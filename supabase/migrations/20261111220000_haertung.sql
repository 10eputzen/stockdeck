-- Härtung nach Security-Advisor (11.11.2026)
-- Trigger-Funktionen braucht niemand per REST; EXECUTE wird nur beim Anlegen des Triggers geprüft.
revoke execute on function public.seed_watchlist() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_proc where oid = 'public.rls_auto_enable'::regproc) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
exception when undefined_function then null;
end $$;
-- is_allowed bleibt für eingeloggte Nutzer (RLS, App-Check), aber nicht für anonyme Aufrufe.
revoke execute on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;
