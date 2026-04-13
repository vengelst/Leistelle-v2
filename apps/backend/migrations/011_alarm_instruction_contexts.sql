alter table alarm_workflow_profiles
  add column if not exists time_context text not null default 'normal';

alter table alarm_workflow_profiles
  add column if not exists special_context_label text;

alter table alarm_workflow_profiles
  drop constraint if exists alarm_workflow_profiles_time_context_check;

alter table alarm_workflow_profiles
  add constraint alarm_workflow_profiles_time_context_check
  check (time_context in ('normal', 'weekend', 'special'));

create index if not exists alarm_workflow_profiles_site_context_idx
  on alarm_workflow_profiles(site_id, time_context, is_active, sort_order asc);
