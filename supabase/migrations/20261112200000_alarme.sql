-- Alarme: Regeln je Nutzer, ausgelöste Ereignisse und Push-Abos. Geprüft wird serverseitig
-- (Edge Function "alerts", alle 15 Minuten per pg_cron), damit Alarme auch ohne offene App kommen.

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('price_above', 'price_below', 'change_pct_day', 'finanzplan_gain', 'finanzplan_stop')),
  -- Kursregeln brauchen ein Symbol, Finanzplan-Regeln gelten für alle Positionen
  symbol text check (symbol ~ '^[A-Z0-9.\-:]{1,20}$'),
  threshold numeric not null check (threshold > 0),
  -- finanzplan_gain: { "weeks": 4 }; beide Finanzplan-Regeln optional: { "exclude": ["<ISIN>", …] }
  params jsonb not null default '{}'::jsonb check (pg_column_size(params) < 2048),
  active boolean not null default true,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  check ((kind like 'finanzplan%') = (symbol is null))
);
create index alert_rules_user_idx on public.alert_rules (user_id);
create unique index alert_rules_finanzplan_idx on public.alert_rules (user_id, kind) where kind like 'finanzplan%';
alter table public.alert_rules enable row level security;
create policy "eigene Alarme lesen" on public.alert_rules
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Alarme anlegen" on public.alert_rules
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Alarme ändern" on public.alert_rules
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Alarme löschen" on public.alert_rules
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));

-- Ausgelöste Alarme; dedupe_key verhindert, dass derselbe Anlass mehrfach meldet
create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_id uuid references public.alert_rules (id) on delete set null,
  kind text not null,
  symbol text not null,
  title text not null,
  body text not null,
  dedupe_key text not null,
  pushed integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index alert_events_user_idx on public.alert_events (user_id, created_at desc);
alter table public.alert_events enable row level security;
create policy "eigene Auslösungen lesen" on public.alert_events
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Auslösungen löschen" on public.alert_events
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) < 1000),
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  device text check (char_length(device) <= 200),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "eigene Abos lesen" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Abos anlegen" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
create policy "eigene Abos löschen" on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()));

-- Standard-Finanzplan-Regeln für alle freigeschalteten Nutzer (Gewinnmitnahme und Stop, im Konto anpassbar)
insert into public.alert_rules (user_id, kind, threshold, params)
select u.id, k.kind, k.threshold, k.params
from auth.users u
join public.allowed_emails a on lower(a.email) = lower(u.email)
cross join (values
  ('finanzplan_gain', 20::numeric, '{"weeks": 4}'::jsonb),
  ('finanzplan_stop', 15::numeric, '{}'::jsonb)
) as k (kind, threshold, params)
on conflict do nothing;

-- Prüflauf alle 15 Minuten an Werktagen (UTC 6–21 Uhr); die Function prüft die Handelszeit selbst.
-- Erwartet im Vault die Secrets project_url (https://<ref>.supabase.co) und alerts_cron_secret (siehe README).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'stockdeck-alerts',
  '*/15 6-21 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_secret')
    ),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
