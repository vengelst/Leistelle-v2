alter table alarm_events drop constraint if exists alarm_events_event_kind_check;

alter table alarm_events
  add constraint alarm_events_event_kind_check
  check (event_kind in (
    'case_created',
    'payload_updated',
    'status_changed',
    'assessment_changed',
    'technical_state_changed',
    'media_attached',
    'assignment_changed',
    'comment_added',
    'action_documented'
  ));
