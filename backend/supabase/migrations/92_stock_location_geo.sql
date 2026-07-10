-- ============================================================
-- 92) Stock location geo — map pins + delivery distances
-- ============================================================
-- Boss brief: put stock locations on a map (factory = fixed pin, van = home
-- base) and show how far each van's upcoming deliveries/jobs are. Free
-- OpenStreetMap stack — no API key: addresses geocode via Nominatim in the
-- browser and results are cached here so repeat lookups cost nothing.
-- Distances are straight-line (haversine) v1, computed client-side.
--
-- Additive + idempotent. Depends: 87 (stock_locations), 00 (is_manager_or_above).
-- ============================================================

alter table public.stock_locations
  add column if not exists address text,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

comment on column public.stock_locations.address is
  'Human-readable base address (factory site / van home base). Pin = lat/lng.';

-- Shared geocode cache: any address string → coordinates. Keyed on the
-- normalised (lowercased, squished) address so jobs/deliveries reuse lookups.
create table if not exists public.geocoded_addresses (
  address_key text primary key,
  address     text not null,
  lat         double precision not null,
  lng         double precision not null,
  geocoded_at timestamptz not null default now()
);

comment on table public.geocoded_addresses is
  'Nominatim results cache (free OSM geocoding). address_key = lower/trimmed address.';

alter table public.geocoded_addresses enable row level security;

-- Managers read/write (geocoding happens from manager screens); workers read
-- (a future My Van screen may show distances too).
drop policy if exists geocoded_addresses_mgr_all on public.geocoded_addresses;
create policy geocoded_addresses_mgr_all on public.geocoded_addresses
  for all using (is_manager_or_above()) with check (is_manager_or_above());

drop policy if exists geocoded_addresses_authed_select on public.geocoded_addresses;
create policy geocoded_addresses_authed_select on public.geocoded_addresses
  for select using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
