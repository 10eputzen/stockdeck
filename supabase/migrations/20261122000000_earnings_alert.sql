-- Push am Handelstag vor Quartalszahlen (#3): Regelart earnings_tomorrow, je Aktie (symbol gesetzt)
-- oder für die ganze Watchlist (symbol null, höchstens eine je Nutzer). threshold wird nicht genutzt (1).

-- Bisherige Prüfungen für kind und das Paar kind/symbol ersetzen (Namen vergibt Postgres, daher per Definition suchen)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.alert_rules'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%kind = ANY%' or pg_get_constraintdef(oid) like '%finanzplan%')
  loop
    execute format('alter table public.alert_rules drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.alert_rules add constraint alert_rules_kind_check check (
  kind in ('price_above', 'price_below', 'change_pct_day', 'finanzplan_gain', 'finanzplan_stop', 'earnings_tomorrow')
);
-- Kursregeln brauchen ein Symbol, Finanzplan-Regeln gelten für alle Positionen, Quartalszahlen für beides
alter table public.alert_rules add constraint alert_rules_kind_symbol_check check (
  case
    when kind like 'finanzplan%' then symbol is null
    when kind = 'earnings_tomorrow' then true
    else symbol is not null
  end
);

create unique index alert_rules_earnings_all_idx on public.alert_rules (user_id)
  where kind = 'earnings_tomorrow' and symbol is null;
create unique index alert_rules_earnings_symbol_idx on public.alert_rules (user_id, symbol)
  where kind = 'earnings_tomorrow' and symbol is not null;
