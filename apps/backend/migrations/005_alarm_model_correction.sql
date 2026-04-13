alter table alarm_cases drop constraint if exists alarm_cases_alarm_type_check;
alter table alarm_cases drop constraint if exists alarm_cases_lifecycle_status_check;
alter table alarm_cases drop constraint if exists alarm_cases_assessment_status_check;
alter table alarm_cases drop constraint if exists alarm_cases_technical_state_check;

update alarm_cases
set alarm_type = case alarm_type
  when 'intrusion' then 'motion'
  when 'tamper' then 'sabotage'
  when 'video_loss' then 'video_loss'
  when 'offline' then 'technical'
  when 'audio_detection' then 'other_disturbance'
  when 'manual' then 'other_disturbance'
  when 'unknown' then 'other_disturbance'
  else alarm_type
end;

update alarm_cases
set lifecycle_status = case lifecycle_status
  when 'triaged' then 'queued'
  when 'assigned' then 'reserved'
  when 'resolved' then 'resolved'
  when 'closed' then 'resolved'
  when 'cancelled' then 'archived'
  else lifecycle_status
end;

update alarm_cases
set assessment_status = case assessment_status
  when 'technical_issue' then 'pending'
  when 'duplicate' then 'pending'
  else assessment_status
end;

update alarm_cases
set technical_state = case technical_state
  when 'complete' then 'complete'
  else 'incomplete'
end;

alter table alarm_cases
  add constraint alarm_cases_alarm_type_check
  check (alarm_type in (
    'motion',
    'line_crossing',
    'area_entry',
    'sabotage',
    'video_loss',
    'camera_offline',
    'nvr_offline',
    'router_offline',
    'technical',
    'other_disturbance'
  ));

alter table alarm_cases
  add constraint alarm_cases_lifecycle_status_check
  check (lifecycle_status in ('received', 'queued', 'reserved', 'in_progress', 'resolved', 'archived'));

alter table alarm_cases
  add constraint alarm_cases_assessment_status_check
  check (assessment_status in ('pending', 'confirmed_incident', 'false_positive'));

alter table alarm_cases
  add constraint alarm_cases_technical_state_check
  check (technical_state in ('complete', 'incomplete'));

alter table alarm_assignments drop constraint if exists alarm_assignments_assignment_kind_check;
alter table alarm_assignments drop constraint if exists alarm_assignments_assignment_status_check;

update alarm_assignments
set assignment_status = case assignment_status
  when 'active' then 'active'
  else 'released'
end;

update alarm_assignments
set assignment_kind = 'owner'
where assignment_kind <> 'owner';

alter table alarm_assignments
  add constraint alarm_assignments_assignment_kind_check
  check (assignment_kind in ('owner'));

alter table alarm_assignments
  add constraint alarm_assignments_assignment_status_check
  check (assignment_status in ('active', 'released'));

drop index if exists alarm_cases_open_idx;

create index if not exists alarm_cases_open_idx
  on alarm_cases(lifecycle_status, priority_rank desc, received_at desc)
  where lifecycle_status in ('received', 'queued', 'reserved', 'in_progress');
