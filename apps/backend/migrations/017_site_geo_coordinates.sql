alter table sites
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6);

alter table sites
  drop constraint if exists sites_latitude_range,
  drop constraint if exists sites_longitude_range;

alter table sites
  add constraint sites_latitude_range check (latitude is null or latitude between -90 and 90),
  add constraint sites_longitude_range check (longitude is null or longitude between -180 and 180);

create index if not exists sites_geo_lookup_idx on sites(latitude, longitude) where latitude is not null and longitude is not null;
