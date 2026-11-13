-- Review 11.11.2026: Push-Abos nur bei bekannten Push-Diensten, Obergrenze für Alarmregeln,
-- fehlende Indizes auf Fremdschlüsseln.

-- Die Edge Function schickt an den gespeicherten Endpoint. Ohne Prüfung könnte ein Nutzer
-- beliebige URLs eintragen und den Server Anfragen dorthin schicken lassen.
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_host check (
    endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
  );

-- Höchstens 100 Alarmregeln je Nutzer (jede Regel kostet Kursabfragen im 15-Minuten-Lauf).
create or replace function public.alert_rules_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.alert_rules where user_id = new.user_id) >= 100 then
    raise exception 'Höchstens 100 Alarme je Nutzer.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger alert_rules_limit
  before insert on public.alert_rules
  for each row execute function public.alert_rules_limit();

create index if not exists alert_events_rule_idx on public.alert_events (rule_id);
create index if not exists transactions_portfolio_idx on public.transactions (portfolio_id);
