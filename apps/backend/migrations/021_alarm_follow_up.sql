alter table alarm_cases
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_note text;

create index if not exists alarm_cases_follow_up_at_idx
  on alarm_cases(follow_up_at asc)
  where follow_up_at is not null;

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
    'action_documented',
    'follow_up_updated',
    'follow_up_cleared'
  ));
