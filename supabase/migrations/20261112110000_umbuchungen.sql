-- Ein- und Ausbuchungen (Depotübertrag, Kapitalmaßnahme): Bestand und Einstand wandern mit,
-- ohne realisierten Gewinn oder Verlust.
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('buy', 'sell', 'dividend', 'fee', 'split', 'transfer_in', 'transfer_out'));
alter table public.transactions drop constraint transactions_source_check;
