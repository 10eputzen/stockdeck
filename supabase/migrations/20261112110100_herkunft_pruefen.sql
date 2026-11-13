-- Prüfregel für die Herkunft wiederherstellen (war in der vorigen Migration nur entfernt worden)
alter table public.transactions add constraint transactions_source_check
  check (source in ('manual', 'csv', 'parqet', 'mcp'));
