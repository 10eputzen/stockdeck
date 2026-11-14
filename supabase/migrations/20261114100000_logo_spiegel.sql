-- Firmenlogos als eigene Kopie: Finnhubs Logo-Server antwortet ohne Cache und gelegentlich mit Fehlern,
-- die dann in der Browser-Konsole landen. Die Edge Function legt jedes Logo einmal hier ab.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 262144, array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
on conflict (id) do nothing;
