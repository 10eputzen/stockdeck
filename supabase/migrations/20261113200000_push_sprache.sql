-- Sprache je Gerät: Push-Texte kommen in der Sprache, die in der App gewählt ist
alter table public.push_subscriptions
  add column lang text not null default 'de' check (lang in ('de', 'en'));

-- Nach einem Sprachwechsel aktualisiert die App nur die Sprache ihres eigenen Abos
create policy "eigene Abos ändern" on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));
revoke update on public.push_subscriptions from authenticated;
grant update (lang) on public.push_subscriptions to authenticated;
