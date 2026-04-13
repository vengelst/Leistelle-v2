alter table monitoring_disturbance_events
  drop constraint monitoring_disturbance_events_event_kind_check;

alter table monitoring_disturbance_events
  add constraint monitoring_disturbance_events_event_kind_check
  check (event_kind in ('disturbance_opened', 'observation_updated', 'status_changed', 'note_added', 'service_case_created'));
