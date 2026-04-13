alter table sites
  add column if not exists internal_reference text null,
  add column if not exists description text null,
  add column if not exists house_number text null,
  add column if not exists site_type text null,
  add column if not exists contact_person text null,
  add column if not exists contact_phone text null,
  add column if not exists notes text null;

alter table devices
  add column if not exists is_active boolean not null default true,
  add column if not exists mac_address text null,
  add column if not exists external_device_id text null,
  add column if not exists linked_nvr_device_id text null references devices(id) on delete set null,
  add column if not exists channel_number integer null,
  add column if not exists zone text null,
  add column if not exists viewing_direction text null,
  add column if not exists mount_location text null,
  add column if not exists analytics_name text null,
  add column if not exists rule_name text null,
  add column if not exists storage_label text null,
  add column if not exists wan_ip text null,
  add column if not exists lan_ip text null,
  add column if not exists vpn_type text null,
  add column if not exists provider text null,
  add column if not exists sim_identifier text null,
  add column if not exists audio_zone text null,
  add column if not exists supports_paging boolean null;

alter table devices
  drop constraint if exists devices_channel_number_positive;

alter table devices
  add constraint devices_channel_number_positive check (channel_number is null or channel_number > 0);

create index if not exists idx_devices_external_device_id on devices(external_device_id) where external_device_id is not null;
create index if not exists idx_devices_serial_number on devices(serial_number) where serial_number is not null;
create index if not exists idx_devices_network_address on devices(network_address) where network_address is not null;
