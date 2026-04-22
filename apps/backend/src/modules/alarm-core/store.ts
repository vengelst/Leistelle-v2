/**
 * Persistiert Alarmfaelle, Ereignisse, Aktionen und Archivdaten in PostgreSQL.
 */
import { randomUUID } from "node:crypto";

import type {
  AlarmActionCreateInput,
  AlarmActionRecord,
  AlarmActionStatusCatalogEntry,
  AlarmActionStatusCode,
  AlarmInstructionContext,
  AlarmInstructionTimeContext,
  AlarmActionTypeCatalogEntry,
  AlarmActionTypeCode,
  AlarmArchiveFilter,
  AlarmArchiveItem,
  AlarmAssignmentCreateInput,
  AlarmAssignmentRecord,
  AlarmAssessmentStatus,
  AlarmCaseCreateInput,
  AlarmCaseRecord,
  AlarmClosureReason,
  AlarmCommentCreateInput,
  AlarmCommentKind,
  AlarmCommentRecord,
  AlarmEventCreateInput,
  AlarmEventRecord,
  AlarmFalsePositiveReason,
  AlarmLifecycleStatus,
  AlarmMediaCreateInput,
  AlarmMediaRecord,
  AlarmPipelineFilter,
  AlarmPipelineItem,
  AlarmPriority,
  AlarmResponseDeadlineState,
  AlarmTechnicalState,
  AlarmType,
  AlarmWorkflowChecklistStep,
  AlarmWorkflowProfile,
  AlarmWorkflowProfileFilter,
  AlarmWorkflowProfileUpsertInput
} from "@leitstelle/contracts";
import { AppError } from "@leitstelle/observability";

import type { DatabaseClient } from "../../db/client.js";
import type {
  ActiveOwnerAssignment,
  AlarmActionEntity,
  AlarmAssignmentEntity,
  AlarmCaseEntity,
  AlarmCommentEntity,
  AlarmCoreStore,
  AlarmEventEntity,
  AlarmMediaEntity,
  AlarmPipelineEntity,
  AlarmSourceMappingResolution,
  VendorMediaInboxEntry
} from "./types.js";

type AlarmSourceMappingLookupRow = {
  id: string;
  site_id: string;
  component_id: string;
  nvr_component_id: string | null;
  vendor: string;
  source_type: string;
  external_source_key: string | null;
  external_device_id: string | null;
  external_recorder_id: string | null;
  channel_number: number | null;
  serial_number: string | null;
  analytics_name: string | null;
  event_namespace: string | null;
  media_bundle_profile_key: string | null;
  sort_order: number;
};

type VendorMediaInboxRow = {
  id: string;
  vendor: string;
  source_type: string;
  parser_key: string | null;
  media_bundle_profile_key: string | null;
  storage_key: string;
  original_filename: string | null;
  relative_path: string | null;
  mime_type: string | null;
  media_kind: AlarmMediaRecord["mediaKind"];
  sequence_no: number | null;
  source_id: string | null;
  channel_id: string | null;
  event_type: string | null;
  event_ts: string | null;
  vendor_event_id: string | null;
  correlation_key: string | null;
  site_id: string | null;
  component_id: string | null;
  nvr_component_id: string | null;
  alarm_case_id: string | null;
  attached_media_id: string | null;
  status: VendorMediaInboxEntry["status"];
  parse_error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type AlarmCaseRow = {
  id: string;
  site_id: string;
  primary_device_id: string | null;
  external_source_ref: string | null;
  alarm_type: AlarmType;
  priority: AlarmPriority;
  priority_rank: number;
  lifecycle_status: AlarmLifecycleStatus;
  assessment_status: AlarmAssessmentStatus;
  technical_state: AlarmTechnicalState;
  incomplete_reason: string | null;
  title: string;
  description: string | null;
  source_occurred_at: string | null;
  received_at: string;
  first_opened_at: string | null;
  resolved_at: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  closure_reason_id: string | null;
  closed_by_user_id: string | null;
  closure_comment: string | null;
  archived_at: string | null;
  archived_by_user_id: string | null;
  last_event_at: string;
  source_payload: Record<string, unknown> | null;
  technical_details: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type AlarmEventRow = {
  id: string;
  alarm_case_id: string;
  event_kind: AlarmEventRecord["eventKind"];
  actor_user_id: string | null;
  occurred_at: string;
  message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type AlarmMediaRow = {
  id: string;
  alarm_case_id: string;
  device_id: string | null;
  media_kind: AlarmMediaRecord["mediaKind"];
  storage_key: string;
  mime_type: string | null;
  captured_at: string | null;
  is_primary: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AlarmAssignmentRow = {
  id: string;
  alarm_case_id: string;
  user_id: string;
  assignment_kind: AlarmAssignmentRecord["assignmentKind"];
  assignment_status: AlarmAssignmentRecord["assignmentStatus"];
  assigned_at: string;
  released_at: string | null;
  release_reason: string | null;
  created_at: string;
  updated_at: string;
};

type AlarmCommentRow = {
  id: string;
  alarm_case_id: string;
  user_id: string;
  comment_kind: AlarmCommentKind;
  body: string;
  context: string | null;
  created_at: string;
  updated_at: string;
  user_display_name?: string;
};

type AlarmReasonRow = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type AlarmActionTypeRow = {
  id: string;
  code: AlarmActionTypeCode;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type AlarmActionStatusRow = {
  id: string;
  code: AlarmActionStatusCode;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type AlarmCaseActionRow = {
  id: string;
  alarm_case_id: string;
  action_type_id: string;
  action_type_code: AlarmActionTypeCode;
  action_type_label: string;
  status_id: string;
  status_code: AlarmActionStatusCode;
  status_label: string;
  user_id: string;
  user_display_name: string | null;
  comment: string;
  occurred_at: string;
  created_at: string;
  updated_at: string;
};

type AlarmWorkflowProfileRow = {
  id: string;
  site_id: string;
  site_name: string;
  code: string;
  label: string;
  description: string | null;
  time_context: AlarmInstructionTimeContext;
  special_context_label: string | null;
  is_active: boolean;
  sort_order: number;
  active_from_time: string | null;
  active_to_time: string | null;
};

type AlarmWorkflowStepRow = {
  id: string;
  profile_id: string;
  step_code: string;
  title: string;
  instruction: string | null;
  sort_order: number;
  is_required_by_default: boolean;
  action_type_id: string | null;
  action_type_code: AlarmActionTypeCode | null;
  action_type_label: string | null;
  active_from_time: string | null;
  active_to_time: string | null;
};

type AlarmPipelineRow = AlarmCaseRow & {
  site_name: string;
  customer_name: string;
  primary_device_name: string | null;
  media_count: string;
  event_count: string;
  assignment_user_id: string | null;
  assignment_display_name: string | null;
  assignment_status: AlarmAssignmentRecord["assignmentStatus"] | null;
  assignment_assigned_at: string | null;
};

type AlarmArchiveRow = AlarmCaseRow & {
  site_name: string;
  customer_name: string;
  primary_device_name: string | null;
  closure_reason_label: string | null;
  closed_by_display_name: string | null;
  archived_by_display_name: string | null;
  media_count: string;
  event_count: string;
};

type AlarmMediaAccessRow = AlarmMediaRow & {
  site_name: string;
  customer_name: string;
  device_name: string | null;
  lifecycle_status: AlarmLifecycleStatus;
};

const openStatuses: AlarmLifecycleStatus[] = ["received", "queued", "reserved", "in_progress"];

export function createAlarmCoreStore(database: DatabaseClient): AlarmCoreStore {
  return {
    async createCase(input) {
      await ensureSiteExists(database, input.siteId);

      if (input.primaryDeviceId) {
        await ensureDeviceExists(database, input.primaryDeviceId);
      }

      const id = input.id ?? randomUUID();
      const receivedAt = input.receivedAt ?? new Date().toISOString();
      const sourceOccurredAt = normalizeOptional(input.sourceOccurredAt);
      const firstOpenedAt = normalizeOptional(input.firstOpenedAt);
      const resolvedAt = normalizeOptional(input.resolvedAt);
      const incompleteReason = normalizeOptional(input.incompleteReason);
      const description = normalizeOptional(input.description);
      const externalSourceRef = normalizeOptional(input.externalSourceRef);

      const result = await database.query<AlarmCaseRow>(
        `
          insert into alarm_cases(
            id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
            lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
            source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
            closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
            source_payload, technical_details
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, null, null, null, null, null, null, null, $15, $18, $19)
          returning
            id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
            lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
            source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
            closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
            source_payload, technical_details,
            created_at, updated_at
        `,
        [
          id,
          input.siteId,
          input.primaryDeviceId ?? null,
          externalSourceRef ?? null,
          input.alarmType,
          input.priority,
          toPriorityRank(input.priority),
          input.lifecycleStatus,
          input.assessmentStatus,
          input.technicalState,
          incompleteReason ?? null,
          input.title.trim(),
          description ?? null,
          sourceOccurredAt ?? null,
          receivedAt,
          firstOpenedAt ?? null,
          resolvedAt ?? null,
          input.sourcePayload ?? null,
          input.technicalDetails ?? null
        ]
      );

      return toAlarmCaseRecord(result.rows[0]!);
    },
    async appendEvent(input) {
      await ensureAlarmCaseExists(database, input.alarmCaseId);

      if (input.actorUserId) {
        await ensureUserExists(database, input.actorUserId);
      }

      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const result = await database.withTransaction(async (client) => {
        const created = await client.query<AlarmEventRow>(
          `
            insert into alarm_events(id, alarm_case_id, event_kind, actor_user_id, occurred_at, message, payload)
            values ($1, $2, $3, $4, $5, $6, $7)
            returning id, alarm_case_id, event_kind, actor_user_id, occurred_at, message, payload, created_at
          `,
          [
            input.id ?? randomUUID(),
            input.alarmCaseId,
            input.eventKind,
            input.actorUserId ?? null,
            occurredAt,
            normalizeOptional(input.message) ?? null,
            input.payload ?? null
          ]
        );

        await client.query("update alarm_cases set last_event_at = $2, updated_at = now() where id = $1", [input.alarmCaseId, occurredAt]);
        return created.rows[0]!;
      });

      return toAlarmEventRecord(result);
    },
    async attachMedia(input) {
      await ensureAlarmCaseExists(database, input.alarmCaseId);

      if (input.deviceId) {
        await ensureDeviceExists(database, input.deviceId);
      }

      const result = await database.query<AlarmMediaRow>(
        `
          insert into alarm_media(id, alarm_case_id, device_id, media_kind, storage_key, mime_type, captured_at, is_primary, metadata)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          returning id, alarm_case_id, device_id, media_kind, storage_key, mime_type, captured_at, is_primary, metadata, created_at
        `,
        [
          input.id ?? randomUUID(),
          input.alarmCaseId,
          input.deviceId ?? null,
          input.mediaKind,
          input.storageKey.trim(),
          normalizeOptional(input.mimeType) ?? null,
          normalizeOptional(input.capturedAt) ?? null,
          input.isPrimary ?? false,
          input.metadata ?? null
        ]
      );

      return toAlarmMediaRecord(result.rows[0]!);
    },
    async createAssignment(input) {
      await ensureAlarmCaseExists(database, input.alarmCaseId);
      await ensureUserExists(database, input.userId);

      const assignedAt = input.assignedAt ?? new Date().toISOString();
      const result = await database.query<AlarmAssignmentRow>(
        `
          insert into alarm_assignments(
            id, alarm_case_id, user_id, assignment_kind, assignment_status, assigned_at, released_at, release_reason
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning
            id, alarm_case_id, user_id, assignment_kind, assignment_status, assigned_at, released_at, release_reason,
            created_at, updated_at
        `,
        [
          input.id ?? randomUUID(),
          input.alarmCaseId,
          input.userId,
          input.assignmentKind,
          input.assignmentStatus ?? "active",
          assignedAt,
          normalizeOptional(input.releasedAt) ?? null,
          normalizeOptional(input.releaseReason) ?? null
        ]
      );

      return toAlarmAssignmentRecord(result.rows[0]!);
    },
    async createComment(input) {
      await ensureAlarmCaseExists(database, input.alarmCaseId);
      await ensureUserExists(database, input.userId);

      const result = await database.query<AlarmCommentRow>(
        `
          insert into alarm_case_comments(id, alarm_case_id, user_id, comment_kind, body, context)
          values ($1, $2, $3, $4, $5, $6)
          returning id, alarm_case_id, user_id, comment_kind, body, context, created_at, updated_at
        `,
        [input.id ?? randomUUID(), input.alarmCaseId, input.userId, input.commentKind, input.body.trim(), normalizeOptional(input.context) ?? null]
      );

      return toAlarmCommentRecord(result.rows[0]!);
    },
    async createAction(input) {
      await ensureAlarmCaseExists(database, input.alarmCaseId);
      await ensureUserExists(database, input.userId);
      await ensureActionTypeExists(database, input.actionTypeId);
      await ensureActionStatusExists(database, input.statusId);

      const result = await database.query<AlarmCaseActionRow>(
        `
          insert into alarm_case_actions(
            id, alarm_case_id, action_type_id, status_id, user_id, comment, occurred_at
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          returning
            id,
            alarm_case_id,
            action_type_id,
            (select code from alarm_action_types where id = action_type_id) as action_type_code,
            (select label from alarm_action_types where id = action_type_id) as action_type_label,
            status_id,
            (select code from alarm_action_statuses where id = status_id) as status_code,
            (select label from alarm_action_statuses where id = status_id) as status_label,
            user_id,
            (select display_name from users where id = user_id) as user_display_name,
            comment,
            occurred_at,
            created_at,
            updated_at
        `,
        [
          input.id ?? randomUUID(),
          input.alarmCaseId,
          input.actionTypeId,
          input.statusId,
          input.userId,
          input.comment.trim(),
          input.occurredAt ?? new Date().toISOString()
        ]
      );

      return toAlarmActionRecord(result.rows[0]!);
    },
    async reserveCase(input) {
      return await this.createAssignment(input);
    },
    async getCaseById(id) {
      const result = await database.query<AlarmCaseRow>(
        `
          select
            id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
            lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
            source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
            closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
            source_payload, technical_details,
            created_at, updated_at
          from alarm_cases
          where id = $1
        `,
        [id]
      );

      return result.rows[0] ? toAlarmCaseRecord(result.rows[0]) : null;
    },
    async listEventsByCaseId(alarmCaseId) {
      const result = await database.query<AlarmEventRow>(
        `
          select id, alarm_case_id, event_kind, actor_user_id, occurred_at, message, payload, created_at
          from alarm_events
          where alarm_case_id = $1
          order by occurred_at asc, created_at asc
        `,
        [alarmCaseId]
      );
      return result.rows.map(toAlarmEventRecord);
    },
    async listMediaByCaseId(alarmCaseId) {
      const result = await database.query<AlarmMediaRow>(
        `
          select id, alarm_case_id, device_id, media_kind, storage_key, mime_type, captured_at, is_primary, metadata, created_at
          from alarm_media
          where alarm_case_id = $1
          order by created_at asc
        `,
        [alarmCaseId]
      );
      return result.rows.map(toAlarmMediaRecord);
    },
    async getMediaAccessContext(mediaId) {
      const result = await database.query<AlarmMediaAccessRow>(
        `
          select
            m.id, m.alarm_case_id, m.device_id, m.media_kind, m.storage_key, m.mime_type, m.captured_at, m.is_primary, m.metadata, m.created_at,
            s.site_name,
            c.name as customer_name,
            d.name as device_name,
            a.lifecycle_status
          from alarm_media m
          join alarm_cases a on a.id = m.alarm_case_id
          join sites s on s.id = a.site_id
          join customers c on c.id = s.customer_id
          left join devices d on d.id = m.device_id
          where m.id = $1
        `,
        [mediaId]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const alarmCase = await this.getCaseById(row.alarm_case_id);
      if (!alarmCase) {
        return null;
      }

      return {
        alarmCase,
        media: toAlarmMediaRecord(row),
        siteName: row.site_name,
        customerName: row.customer_name,
        ...(row.device_name ? { deviceName: row.device_name } : {})
      };
    },
    async listAssignmentsByCaseId(alarmCaseId) {
      const result = await database.query<AlarmAssignmentRow>(
        `
          select
            id, alarm_case_id, user_id, assignment_kind, assignment_status, assigned_at, released_at, release_reason,
            created_at, updated_at
          from alarm_assignments
          where alarm_case_id = $1
          order by assigned_at asc, created_at asc
        `,
        [alarmCaseId]
      );
      return result.rows.map(toAlarmAssignmentRecord);
    },
    async listCommentsByCaseId(alarmCaseId) {
      const result = await database.query<AlarmCommentRow>(
        `
          select
            c.id, c.alarm_case_id, c.user_id, c.comment_kind, c.body, c.context, c.created_at, c.updated_at,
            u.display_name as user_display_name
          from alarm_case_comments c
          join users u on u.id = c.user_id
          where c.alarm_case_id = $1
          order by c.created_at asc
        `,
        [alarmCaseId]
      );
      return result.rows.map(toAlarmCommentRecord);
    },
    async listActionsByCaseId(alarmCaseId) {
      const result = await database.query<AlarmCaseActionRow>(
        `
          select
            a.id,
            a.alarm_case_id,
            a.action_type_id,
            at.code as action_type_code,
            at.label as action_type_label,
            a.status_id,
            st.code as status_code,
            st.label as status_label,
            a.user_id,
            u.display_name as user_display_name,
            a.comment,
            a.occurred_at,
            a.created_at,
            a.updated_at
          from alarm_case_actions a
          join alarm_action_types at on at.id = a.action_type_id
          join alarm_action_statuses st on st.id = a.status_id
          join users u on u.id = a.user_id
          where a.alarm_case_id = $1
          order by a.occurred_at asc, a.created_at asc
        `,
        [alarmCaseId]
      );
      return result.rows.map(toAlarmActionRecord);
    },
    async getCaseDetail(alarmCaseId) {
      const alarmCase = await this.getCaseById(alarmCaseId);
      if (!alarmCase) {
        return null;
      }

      const [events, media, assignments, comments, actions, instructionContext, falsePositiveReasons, closureReason] = await Promise.all([
        this.listEventsByCaseId(alarmCaseId),
        this.listMediaByCaseId(alarmCaseId),
        this.listAssignmentsByCaseId(alarmCaseId),
        this.listCommentsByCaseId(alarmCaseId),
        this.listActionsByCaseId(alarmCaseId),
        this.resolveInstructionContextForCase(alarmCaseId),
        this.listFalsePositiveReasonsForCase(alarmCaseId),
        this.getClosureReasonForCase(alarmCaseId)
      ]);

      return {
        alarmCase,
        events,
        media,
        mediaBundles: buildAlarmMediaBundles(media),
        assignments,
        comments,
        actions,
        instructionContext: instructionContext ?? {
          siteId: alarmCase.siteId,
          timeContext: "normal",
          profiles: []
        },
        falsePositiveReasons,
        ...(closureReason ? { closureReason } : {}),
        isArchived: alarmCase.lifecycleStatus === "archived"
      };
    },
    async listOpenCases(filter = {}) {
      const safeLimit = Math.max(1, Math.min(filter.limit ?? 50, 200));
      const clauses = ["a.lifecycle_status = any($1)"];
      const values: unknown[] = [openStatuses];
      let parameterIndex = 2;

      if (filter.siteId) {
        clauses.push(`a.site_id = $${parameterIndex}`);
        values.push(filter.siteId);
        parameterIndex += 1;
      }

      if (filter.alarmType) {
        clauses.push(`a.alarm_type = $${parameterIndex}`);
        values.push(filter.alarmType);
        parameterIndex += 1;
      }

      if (filter.technicalState) {
        clauses.push(`a.technical_state = $${parameterIndex}`);
        values.push(filter.technicalState);
        parameterIndex += 1;
      }

      values.push(safeLimit);
      const result = await database.query<AlarmPipelineRow>(
        `
          select
            a.id, a.site_id, a.primary_device_id, a.external_source_ref, a.alarm_type, a.priority, a.priority_rank,
            a.lifecycle_status, a.assessment_status, a.technical_state, a.incomplete_reason, a.title, a.description,
            a.source_occurred_at, a.received_at, a.first_opened_at, a.resolved_at, a.follow_up_at, a.follow_up_note,
            a.closure_reason_id, a.closed_by_user_id, a.closure_comment, a.archived_at, a.archived_by_user_id, a.last_event_at,
            a.source_payload, a.technical_details,
            a.created_at, a.updated_at,
            s.site_name,
            c.name as customer_name,
            d.name as primary_device_name,
            count(distinct m.id)::text as media_count,
            count(distinct e.id)::text as event_count,
            aa.user_id as assignment_user_id,
            u.display_name as assignment_display_name,
            aa.assignment_status,
            aa.assigned_at as assignment_assigned_at
          from alarm_cases a
          join sites s on s.id = a.site_id
          join customers c on c.id = s.customer_id
          left join devices d on d.id = a.primary_device_id
          left join alarm_media m on m.alarm_case_id = a.id
          left join alarm_events e on e.alarm_case_id = a.id
          left join alarm_assignments aa on aa.alarm_case_id = a.id and aa.assignment_kind = 'owner' and aa.assignment_status = 'active'
          left join users u on u.id = aa.user_id
          where ${clauses.join(" and ")}
          group by a.id, s.site_name, c.name, d.name, aa.user_id, u.display_name, aa.assignment_status, aa.assigned_at
          order by a.priority_rank desc, a.received_at desc, a.last_event_at desc
          limit $${parameterIndex}
        `,
        values
      );

      return result.rows.map(toAlarmPipelineItem);
    },
    async listArchiveCases(filter) {
      const range = resolveArchiveRange(filter);
      const safeLimit = Math.max(1, Math.min(filter.limit ?? 100, 250));
      const clauses = ["a.lifecycle_status = any($1)"];
      const values: unknown[] = [toArchiveStatuses(filter.lifecycleScope)];
      let parameterIndex = 2;

      if (range.dateFrom) {
        clauses.push(`a.received_at >= $${parameterIndex}`);
        values.push(range.dateFrom);
        parameterIndex += 1;
      }

      if (range.dateToExclusive) {
        clauses.push(`a.received_at < $${parameterIndex}`);
        values.push(range.dateToExclusive);
        parameterIndex += 1;
      }

      if (filter.customerId) {
        clauses.push(`s.customer_id = $${parameterIndex}`);
        values.push(filter.customerId);
        parameterIndex += 1;
      }

      if (filter.siteId) {
        clauses.push(`a.site_id = $${parameterIndex}`);
        values.push(filter.siteId);
        parameterIndex += 1;
      }

      if (filter.cameraId) {
        clauses.push(`(
          a.primary_device_id = $${parameterIndex}
          or exists (
            select 1
            from alarm_media media_filter
            where media_filter.alarm_case_id = a.id and media_filter.device_id = $${parameterIndex}
          )
        )`);
        values.push(filter.cameraId);
        parameterIndex += 1;
      }

      if (filter.alarmType) {
        clauses.push(`a.alarm_type = $${parameterIndex}`);
        values.push(filter.alarmType);
        parameterIndex += 1;
      }

      if (filter.assessmentStatus) {
        clauses.push(`a.assessment_status = $${parameterIndex}`);
        values.push(filter.assessmentStatus);
        parameterIndex += 1;
      }

      if (filter.operatorUserId) {
        clauses.push(`(
          a.closed_by_user_id = $${parameterIndex}
          or a.archived_by_user_id = $${parameterIndex}
          or exists (
            select 1
            from alarm_assignments assignment_filter
            where assignment_filter.alarm_case_id = a.id and assignment_filter.user_id = $${parameterIndex}
          )
          or exists (
            select 1
            from alarm_case_comments comment_filter
            where comment_filter.alarm_case_id = a.id and comment_filter.user_id = $${parameterIndex}
          )
          or exists (
            select 1
            from alarm_case_actions action_filter
            where action_filter.alarm_case_id = a.id and action_filter.user_id = $${parameterIndex}
          )
        )`);
        values.push(filter.operatorUserId);
        parameterIndex += 1;
      }

      if (filter.closureReasonId) {
        clauses.push(`a.closure_reason_id = $${parameterIndex}`);
        values.push(filter.closureReasonId);
        parameterIndex += 1;
      }

      if (filter.disturbanceType) {
        const mappedAlarmTypes = mapDisturbanceTypeToAlarmTypes(filter.disturbanceType);
        if (mappedAlarmTypes.length === 0) {
          return [];
        }

        clauses.push(`a.alarm_type = any($${parameterIndex})`);
        values.push(mappedAlarmTypes);
        parameterIndex += 1;
      }

      values.push(safeLimit);
      const result = await database.query<AlarmArchiveRow>(
        `
          select
            a.id, a.site_id, a.primary_device_id, a.external_source_ref, a.alarm_type, a.priority, a.priority_rank,
            a.lifecycle_status, a.assessment_status, a.technical_state, a.incomplete_reason, a.title, a.description,
            a.source_occurred_at, a.received_at, a.first_opened_at, a.resolved_at, a.follow_up_at, a.follow_up_note,
            a.closure_reason_id, a.closed_by_user_id, a.closure_comment, a.archived_at, a.archived_by_user_id, a.last_event_at,
            a.source_payload, a.technical_details,
            a.created_at, a.updated_at,
            s.site_name,
            c.name as customer_name,
            d.name as primary_device_name,
            closure_reason.label as closure_reason_label,
            closed_by.display_name as closed_by_display_name,
            archived_by.display_name as archived_by_display_name,
            count(distinct m.id)::text as media_count,
            count(distinct e.id)::text as event_count
          from alarm_cases a
          join sites s on s.id = a.site_id
          join customers c on c.id = s.customer_id
          left join devices d on d.id = a.primary_device_id
          left join alarm_closure_reasons closure_reason on closure_reason.id = a.closure_reason_id
          left join users closed_by on closed_by.id = a.closed_by_user_id
          left join users archived_by on archived_by.id = a.archived_by_user_id
          left join alarm_media m on m.alarm_case_id = a.id
          left join alarm_events e on e.alarm_case_id = a.id
          where ${clauses.join(" and ")}
          group by
            a.id,
            s.site_name,
            c.name,
            d.name,
            closure_reason.label,
            closed_by.display_name,
            archived_by.display_name
          order by coalesce(a.archived_at, a.resolved_at, a.received_at) desc, a.priority_rank desc, a.last_event_at desc
          limit $${parameterIndex}
        `,
        values
      );

      return result.rows.map(toAlarmArchiveItem);
    },
    async countTodaysFalsePositives() {
      const result = await database.query<{ total: string }>(
        `
          select count(*)::text as total
          from alarm_cases
          where assessment_status = 'false_positive'
            and updated_at::date = current_date
        `
      );

      return Number(result.rows[0]?.total ?? "0");
    },
    async getActiveOwnerAssignment(alarmCaseId) {
      const result = await database.query<{
        id: string;
        alarm_case_id: string;
        user_id: string;
        assignment_kind: AlarmAssignmentRecord["assignmentKind"];
        assignment_status: AlarmAssignmentRecord["assignmentStatus"];
        assigned_at: string;
        released_at: string | null;
        release_reason: string | null;
        created_at: string;
        updated_at: string;
        display_name: string;
      }>(
        `
          select
            aa.id, aa.alarm_case_id, aa.user_id, aa.assignment_kind, aa.assignment_status, aa.assigned_at,
            aa.released_at, aa.release_reason, aa.created_at, aa.updated_at, u.display_name
          from alarm_assignments aa
          join users u on u.id = aa.user_id
          where aa.alarm_case_id = $1 and aa.assignment_kind = 'owner' and aa.assignment_status = 'active'
          order by aa.assigned_at desc
          limit 1
        `,
        [alarmCaseId]
      );

      const row = result.rows[0];
      return row
        ? {
            ...toAlarmAssignmentRecord(row),
            displayName: row.display_name
          }
        : null;
    },
    async releaseAssignment(alarmCaseId, releasedAt, reason) {
      const result = await database.query<AlarmAssignmentRow>(
        `
          update alarm_assignments
          set
            assignment_status = 'released',
            released_at = $2,
            release_reason = $3,
            updated_at = now()
          where id = (
            select id
            from alarm_assignments
            where alarm_case_id = $1 and assignment_kind = 'owner' and assignment_status = 'active'
            order by assigned_at desc
            limit 1
          )
          returning
            id, alarm_case_id, user_id, assignment_kind, assignment_status, assigned_at, released_at, release_reason,
            created_at, updated_at
        `,
        [alarmCaseId, releasedAt, normalizeOptional(reason) ?? null]
      );

      return result.rows[0] ? toAlarmAssignmentRecord(result.rows[0]) : null;
    },
    async updateLifecycleStatus(alarmCaseId, status, openedAt) {
      const result = await database.query<AlarmCaseRow>(
        `
          update alarm_cases
          set
            lifecycle_status = $2,
            first_opened_at = coalesce(first_opened_at, $3),
            updated_at = now()
          where id = $1
          returning
            id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
            lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
            source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
            closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
            source_payload, technical_details,
            created_at, updated_at
        `,
        [alarmCaseId, status, openedAt ?? null]
      );

      const row = result.rows[0];
      if (!row) {
        throw new AppError("Alarm case not found.", {
          status: 404,
          code: "ALARM_CASE_NOT_FOUND"
        });
      }

      return toAlarmCaseRecord(row);
    },
    async updateAssessment(alarmCaseId, assessmentStatus) {
      const result = await database.query<AlarmCaseRow>(
        `
          update alarm_cases
          set
            assessment_status = $2,
            updated_at = now()
          where id = $1
          returning
            id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
            lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
            source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
            closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
            source_payload, technical_details,
            created_at, updated_at
        `,
        [alarmCaseId, assessmentStatus]
      );

      const row = result.rows[0];
      if (!row) {
        throw new AppError("Alarm case not found.", {
          status: 404,
          code: "ALARM_CASE_NOT_FOUND"
        });
      }

      return toAlarmCaseRecord(row);
    },
    async updateFollowUp(alarmCaseId, input) {
      const result = await database.query<AlarmCaseRow>(
        `
          update alarm_cases
          set
            follow_up_at = $2,
            follow_up_note = $3,
            updated_at = now()
          where id = $1
          returning
            id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
            lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
            source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
            closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
            source_payload, technical_details,
            created_at, updated_at
        `,
        [alarmCaseId, input.followUpAt ?? null, normalizeOptional(input.followUpNote) ?? null]
      );

      const row = result.rows[0];
      if (!row) {
        throw new AppError("Alarm case not found.", {
          status: 404,
          code: "ALARM_CASE_NOT_FOUND"
        });
      }

      return toAlarmCaseRecord(row);
    },
    async closeCase(alarmCaseId, input) {
      const result = await database.query<AlarmCaseRow>(
        `
          update alarm_cases
          set
            lifecycle_status = 'resolved',
            resolved_at = $2,
            follow_up_at = null,
            follow_up_note = null,
            closure_reason_id = $3,
            closed_by_user_id = $4,
            closure_comment = $5,
            updated_at = now()
          where id = $1
          returning
            id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
            lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
            source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
            closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
            source_payload, technical_details,
            created_at, updated_at
        `,
        [alarmCaseId, input.resolvedAt, input.closureReasonId, input.closedByUserId, normalizeOptional(input.closureComment) ?? null]
      );

      const row = result.rows[0];
      if (!row) {
        throw new AppError("Alarm case not found.", {
          status: 404,
          code: "ALARM_CASE_NOT_FOUND"
        });
      }

      return toAlarmCaseRecord(row);
    },
    async archiveCase(alarmCaseId, input) {
      const result = await database.query<AlarmCaseRow>(
        `
          update alarm_cases
          set
            lifecycle_status = 'archived',
            archived_at = $2,
            archived_by_user_id = $3,
            follow_up_at = null,
            follow_up_note = null,
            updated_at = now()
          where id = $1
          returning
            id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
            lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
            source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
            closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
            source_payload, technical_details,
            created_at, updated_at
        `,
        [alarmCaseId, input.archivedAt, input.archivedByUserId]
      );

      const row = result.rows[0];
      if (!row) {
        throw new AppError("Alarm case not found.", {
          status: 404,
          code: "ALARM_CASE_NOT_FOUND"
        });
      }

      return toAlarmCaseRecord(row);
    },
    async replaceFalsePositiveReasons(alarmCaseId, reasonIds) {
      await database.withTransaction(async (client) => {
        await client.query("delete from alarm_case_false_positive_reasons where alarm_case_id = $1", [alarmCaseId]);
        for (const reasonId of reasonIds) {
          await client.query(
            `
              insert into alarm_case_false_positive_reasons(alarm_case_id, reason_id)
              values ($1, $2)
              on conflict (alarm_case_id, reason_id) do nothing
            `,
            [alarmCaseId, reasonId]
          );
        }
      });
    },
    async listFalsePositiveReasons() {
      const result = await database.query<AlarmReasonRow>(
        `
          select id, code, label, description, is_active, sort_order
          from alarm_false_positive_reasons
          where is_active = true
          order by sort_order asc, label asc
        `
      );
      return result.rows.map(toAlarmReasonRecord);
    },
    async listClosureReasons() {
      const result = await database.query<AlarmReasonRow>(
        `
          select id, code, label, description, is_active, sort_order
          from alarm_closure_reasons
          where is_active = true
          order by sort_order asc, label asc
        `
      );
      return result.rows.map(toAlarmClosureReasonRecord);
    },
    async listActionTypes() {
      const result = await database.query<AlarmActionTypeRow>(
        `
          select id, code, label, description, is_active, sort_order
          from alarm_action_types
          where is_active = true
          order by sort_order asc, label asc
        `
      );
      return result.rows.map(toAlarmActionTypeRecord);
    },
    async listActionStatuses() {
      const result = await database.query<AlarmActionStatusRow>(
        `
          select id, code, label, description, is_active, sort_order
          from alarm_action_statuses
          where is_active = true
          order by sort_order asc, label asc
        `
      );
      return result.rows.map(toAlarmActionStatusRecord);
    },
    async listWorkflowProfiles(filter = {}) {
      return await loadWorkflowProfiles(database, filter);
    },
    async upsertWorkflowProfile(input) {
      await ensureSiteExists(database, input.siteId);
      await ensureWorkflowProfileStepsValid(database, input.steps);

      const profileId = input.id ?? randomUUID();
      await database.withTransaction(async (client) => {
        await client.query(
          `
            insert into alarm_workflow_profiles(
              id, site_id, code, label, description, time_context, special_context_label, is_active, sort_order, active_from_time, active_to_time
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::time, $11::time)
            on conflict (id) do update set
              site_id = excluded.site_id,
              code = excluded.code,
              label = excluded.label,
              description = excluded.description,
              time_context = excluded.time_context,
              special_context_label = excluded.special_context_label,
              is_active = excluded.is_active,
              sort_order = excluded.sort_order,
              active_from_time = excluded.active_from_time,
              active_to_time = excluded.active_to_time,
              updated_at = now()
          `,
          [
            profileId,
            input.siteId,
            input.code.trim(),
            input.label.trim(),
            normalizeOptional(input.description) ?? null,
            input.timeContext,
            normalizeOptional(input.specialContextLabel) ?? null,
            input.isActive,
            input.sortOrder,
            normalizeOptional(input.activeFromTime) ?? null,
            normalizeOptional(input.activeToTime) ?? null
          ]
        );

        await client.query("delete from alarm_workflow_profile_steps where profile_id = $1", [profileId]);

        for (const step of input.steps) {
          await client.query(
            `
              insert into alarm_workflow_profile_steps(
                id, profile_id, step_code, title, instruction, sort_order, is_required_by_default, action_type_id, active_from_time, active_to_time
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9::time, $10::time)
            `,
            [
              step.id ?? randomUUID(),
              profileId,
              step.stepCode.trim(),
              step.title.trim(),
              normalizeOptional(step.instruction) ?? null,
              step.sortOrder,
              step.isRequiredByDefault,
              step.actionTypeId ?? null,
              normalizeOptional(step.activeFromTime) ?? null,
              normalizeOptional(step.activeToTime) ?? null
            ]
          );
        }
      });

      const profiles = await loadWorkflowProfiles(database, { siteId: input.siteId });
      const profile = profiles.find((entry) => entry.id === profileId);
      if (!profile) {
        throw new AppError("Alarm workflow profile not found.", {
          status: 404,
          code: "ALARM_WORKFLOW_PROFILE_NOT_FOUND"
        });
      }
      return profile;
    },
    async resolveInstructionContextForCase(alarmCaseId, filter = {}) {
      const result = await database.query<{ site_id: string; source_occurred_at: string | null; received_at: string }>(
        "select site_id, source_occurred_at, received_at from alarm_cases where id = $1",
        [alarmCaseId]
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const timeContext = filter.timeContext ?? deriveInstructionTimeContext(row.source_occurred_at ?? row.received_at);
      const profiles = await loadWorkflowProfiles(database, {
        siteId: row.site_id,
        timeContext
      });
      const filteredProfiles = filter.specialContextLabel && timeContext === "special"
        ? profiles.filter((profile) => profile.specialContextLabel === filter.specialContextLabel)
        : profiles;

      return {
        siteId: row.site_id,
        timeContext,
        ...(filter.specialContextLabel ? { specialContextLabel: filter.specialContextLabel } : {}),
        profiles: filteredProfiles
      };
    },
    async getActionTypeById(actionTypeId) {
      const result = await database.query<AlarmActionTypeRow>(
        `
          select id, code, label, description, is_active, sort_order
          from alarm_action_types
          where id = $1 and is_active = true
        `,
        [actionTypeId]
      );
      return result.rows[0] ? toAlarmActionTypeRecord(result.rows[0]) : null;
    },
    async getActionStatusById(statusId) {
      const result = await database.query<AlarmActionStatusRow>(
        `
          select id, code, label, description, is_active, sort_order
          from alarm_action_statuses
          where id = $1 and is_active = true
        `,
        [statusId]
      );
      return result.rows[0] ? toAlarmActionStatusRecord(result.rows[0]) : null;
    },
    async listFalsePositiveReasonsForCase(alarmCaseId) {
      const result = await database.query<AlarmReasonRow>(
        `
          select r.id, r.code, r.label, r.description, r.is_active, r.sort_order
          from alarm_case_false_positive_reasons c
          join alarm_false_positive_reasons r on r.id = c.reason_id
          where c.alarm_case_id = $1
          order by r.sort_order asc, r.label asc
        `,
        [alarmCaseId]
      );
      return result.rows.map(toAlarmReasonRecord);
    },
    async getClosureReasonById(reasonId) {
      const result = await database.query<AlarmReasonRow>(
        `
          select id, code, label, description, is_active, sort_order
          from alarm_closure_reasons
          where id = $1 and is_active = true
        `,
        [reasonId]
      );
      return result.rows[0] ? toAlarmClosureReasonRecord(result.rows[0]) : null;
    },
    async getClosureReasonForCase(alarmCaseId) {
      const result = await database.query<AlarmReasonRow>(
        `
          select r.id, r.code, r.label, r.description, r.is_active, r.sort_order
          from alarm_cases a
          join alarm_closure_reasons r on r.id = a.closure_reason_id
          where a.id = $1
        `,
        [alarmCaseId]
      );
      return result.rows[0] ? toAlarmClosureReasonRecord(result.rows[0]) : null;
    },
    async countActiveAssignmentsForUser(userId) {
      const result = await database.query<{ total: string }>(
        "select count(*)::text as total from alarm_assignments where user_id = $1 and assignment_kind = 'owner' and assignment_status = 'active'",
        [userId]
      );
      return Number(result.rows[0]?.total ?? "0");
    },
    async forceReleaseActiveAssignmentsForUser(userId, releasedAt, reason) {
      const result = await database.query<{ released_count: string }>(
        `
          with released_assignments as (
            update alarm_assignments aa
            set
              assignment_status = 'released',
              released_at = $2,
              release_reason = $3,
              updated_at = now()
            where aa.user_id = $1
              and aa.assignment_kind = 'owner'
              and aa.assignment_status = 'active'
            returning aa.alarm_case_id
          ),
          queued_cases as (
            update alarm_cases ac
            set
              lifecycle_status = 'queued',
              updated_at = now()
            where ac.id in (select alarm_case_id from released_assignments)
              and ac.lifecycle_status in ('reserved', 'in_progress')
            returning ac.id
          )
          select count(*)::text as released_count
          from released_assignments
        `,
        [userId, releasedAt, normalizeOptional(reason) ?? null]
      );
      return Number(result.rows[0]?.released_count ?? "0");
    },
    async hasSite(id) {
      const result = await database.query<{ id: string }>("select id from sites where id = $1", [id]);
      return Boolean(result.rows[0]);
    },
    async hasDevice(id) {
      const result = await database.query<{ id: string }>("select id from devices where id = $1", [id]);
      return Boolean(result.rows[0]);
    },
    async getCaseByExternalSourceRef(externalSourceRef) {
      const result = await database.query<AlarmCaseRow>(
        `
          select
            id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
            lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
            source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
            closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
            source_payload, technical_details,
            created_at, updated_at
          from alarm_cases
          where external_source_ref = $1
          limit 1
        `,
        [externalSourceRef]
      );
      return result.rows[0] ? toAlarmCaseRecord(result.rows[0]) : null;
    },
    async resolveSiteIdByDeviceId(deviceId) {
      const result = await database.query<{ site_id: string }>(
        "select site_id from devices where id = $1",
        [deviceId]
      );
      return result.rows[0]?.site_id ?? null;
    },
    async findCaseByVendorCorrelationKey(correlationKey) {
      const result = await database.query<AlarmCaseRow>(
        `
          select
            id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
            lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
            source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
            closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
            source_payload, technical_details,
            created_at, updated_at
          from alarm_cases
          where technical_details ->> 'vendorCorrelationKey' = $1
          order by received_at desc
          limit 2
        `,
        [correlationKey]
      );
      if (result.rows.length > 1) {
        throw new AppError("Alarm case lookup by vendor correlation key is ambiguous.", {
          status: 409,
          code: "ALARM_MEDIA_CORRELATION_AMBIGUOUS"
        });
      }
      return result.rows[0] ? toAlarmCaseRecord(result.rows[0]) : null;
    },
    async findCaseByComponentEventTime(input) {
      return await resolveCaseByComponentEventTime(database, input);
    },
    async resolveAlarmSourceMapping(input) {
      return await resolveAlarmSourceMappingResolution(database, input);
    },
    async getVendorMediaInboxByStorageKey(storageKey) {
      const result = await database.query<VendorMediaInboxRow>(
        `
          select
            id, vendor, source_type, parser_key, media_bundle_profile_key, storage_key, original_filename, relative_path,
            mime_type, media_kind, sequence_no, source_id, channel_id, event_type, event_ts::text, vendor_event_id,
            correlation_key, site_id, component_id, nvr_component_id, alarm_case_id, attached_media_id, status,
            parse_error, metadata, created_at::text, updated_at::text
          from alarm_media_inbox
          where storage_key = $1
          limit 1
        `,
        [storageKey]
      );
      return result.rows[0] ? toVendorMediaInboxEntry(result.rows[0]) : null;
    },
    async createVendorMediaInboxEntry(input) {
      const result = await database.query<VendorMediaInboxRow>(
        `
          insert into alarm_media_inbox(
            id, vendor, source_type, parser_key, media_bundle_profile_key, storage_key, original_filename, relative_path,
            mime_type, media_kind, sequence_no, source_id, channel_id, event_type, event_ts, vendor_event_id,
            correlation_key, site_id, component_id, nvr_component_id, alarm_case_id, attached_media_id, status,
            parse_error, metadata, updated_at
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23,
            $24, $25, now()
          )
          returning
            id, vendor, source_type, parser_key, media_bundle_profile_key, storage_key, original_filename, relative_path,
            mime_type, media_kind, sequence_no, source_id, channel_id, event_type, event_ts::text, vendor_event_id,
            correlation_key, site_id, component_id, nvr_component_id, alarm_case_id, attached_media_id, status,
            parse_error, metadata, created_at::text, updated_at::text
        `,
        [
          input.id,
          input.vendor,
          input.sourceType,
          input.parserKey ?? null,
          input.mediaBundleProfileKey ?? null,
          input.storageKey,
          input.originalFilename ?? null,
          input.relativePath ?? null,
          input.mimeType ?? null,
          input.mediaKind,
          input.sequenceNo ?? null,
          input.sourceId ?? null,
          input.channelId ?? null,
          input.eventType ?? null,
          input.eventTs ?? null,
          input.vendorEventId ?? null,
          input.correlationKey ?? null,
          input.siteId ?? null,
          input.componentId ?? null,
          input.nvrComponentId ?? null,
          input.alarmCaseId ?? null,
          input.attachedMediaId ?? null,
          input.status,
          input.parseError ?? null,
          input.metadata ?? null
        ]
      );
      return toVendorMediaInboxEntry(result.rows[0]!);
    },
    async updateVendorMediaInboxEntry(id, patch) {
      const current = await this.getVendorMediaInboxByStorageKey(
        patch.storageKey ?? (await database.query<{ storage_key: string }>("select storage_key from alarm_media_inbox where id = $1", [id])).rows[0]?.storage_key ?? ""
      );
      if (!current || current.id !== id) {
        throw new AppError("Vendor media inbox entry not found.", {
          status: 404,
          code: "ALARM_MEDIA_INBOX_NOT_FOUND"
        });
      }
      const result = await database.query<VendorMediaInboxRow>(
        `
          update alarm_media_inbox
          set
            vendor = $2,
            source_type = $3,
            parser_key = $4,
            media_bundle_profile_key = $5,
            storage_key = $6,
            original_filename = $7,
            relative_path = $8,
            mime_type = $9,
            media_kind = $10,
            sequence_no = $11,
            source_id = $12,
            channel_id = $13,
            event_type = $14,
            event_ts = $15,
            vendor_event_id = $16,
            correlation_key = $17,
            site_id = $18,
            component_id = $19,
            nvr_component_id = $20,
            alarm_case_id = $21,
            attached_media_id = $22,
            status = $23,
            parse_error = $24,
            metadata = $25,
            updated_at = now()
          where id = $1
          returning
            id, vendor, source_type, parser_key, media_bundle_profile_key, storage_key, original_filename, relative_path,
            mime_type, media_kind, sequence_no, source_id, channel_id, event_type, event_ts::text, vendor_event_id,
            correlation_key, site_id, component_id, nvr_component_id, alarm_case_id, attached_media_id, status,
            parse_error, metadata, created_at::text, updated_at::text
        `,
        [
          id,
          patch.vendor ?? current.vendor,
          patch.sourceType ?? current.sourceType,
          patch.parserKey ?? current.parserKey ?? null,
          patch.mediaBundleProfileKey ?? current.mediaBundleProfileKey ?? null,
          patch.storageKey ?? current.storageKey,
          patch.originalFilename ?? current.originalFilename ?? null,
          patch.relativePath ?? current.relativePath ?? null,
          patch.mimeType ?? current.mimeType ?? null,
          patch.mediaKind ?? current.mediaKind,
          patch.sequenceNo ?? current.sequenceNo ?? null,
          patch.sourceId ?? current.sourceId ?? null,
          patch.channelId ?? current.channelId ?? null,
          patch.eventType ?? current.eventType ?? null,
          patch.eventTs ?? current.eventTs ?? null,
          patch.vendorEventId ?? current.vendorEventId ?? null,
          patch.correlationKey ?? current.correlationKey ?? null,
          patch.siteId ?? current.siteId ?? null,
          patch.componentId ?? current.componentId ?? null,
          patch.nvrComponentId ?? current.nvrComponentId ?? null,
          patch.alarmCaseId ?? current.alarmCaseId ?? null,
          patch.attachedMediaId ?? current.attachedMediaId ?? null,
          patch.status ?? current.status,
          patch.parseError ?? current.parseError ?? null,
          patch.metadata ?? current.metadata ?? null
        ]
      );
      return toVendorMediaInboxEntry(result.rows[0]!);
    },
    async listPendingVendorMediaInboxEntriesForAlarm(input) {
      const result = await database.query<VendorMediaInboxRow>(
        `
          select
            id, vendor, source_type, parser_key, media_bundle_profile_key, storage_key, original_filename, relative_path,
            mime_type, media_kind, sequence_no, source_id, channel_id, event_type, event_ts::text, vendor_event_id,
            correlation_key, site_id, component_id, nvr_component_id, alarm_case_id, attached_media_id, status,
            parse_error, metadata, created_at::text, updated_at::text
          from alarm_media_inbox
          where status in ('pending', 'orphaned')
            and vendor = $1
            and source_type = $2
            and (
              ($3::text is not null and vendor_event_id = $3)
              or ($4::text is not null and correlation_key = $4)
              or (
                $5::text is not null
                and $6::text is not null
                and component_id = $6
                and site_id = $5
                and ($7::text is null or event_type = $7)
                and (
                  $8::timestamptz is null
                  or (
                    event_ts is not null
                    and event_ts between ($8::timestamptz - make_interval(secs => $9::int)) and ($8::timestamptz + make_interval(secs => $9::int))
                  )
                )
              )
            )
          order by created_at asc
        `,
        [
          input.vendor,
          input.sourceType,
          input.vendorEventId ?? null,
          input.correlationKey ?? null,
          input.siteId ?? null,
          input.componentId ?? null,
          input.alarmType ?? null,
          input.sourceOccurredAt ?? null,
          input.toleranceSeconds ?? 30
        ]
      );
      return result.rows.map(toVendorMediaInboxEntry);
    },
    async listVendorMediaInbox(filter) {
      const clauses: string[] = [];
      const values: unknown[] = [];
      let parameterIndex = 1;

      if (filter.status) {
        clauses.push(`status = $${parameterIndex}`);
        values.push(filter.status);
        parameterIndex += 1;
      }
      if (filter.siteId) {
        clauses.push(`site_id = $${parameterIndex}`);
        values.push(filter.siteId);
        parameterIndex += 1;
      }
      if (filter.vendor) {
        clauses.push(`vendor = $${parameterIndex}`);
        values.push(filter.vendor.trim().toLowerCase());
        parameterIndex += 1;
      }

      const limit = Math.max(1, Math.min(filter.limit ?? 100, 500));
      values.push(limit);

      const whereClause = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
      const result = await database.query<VendorMediaInboxRow>(
        `
          select
            id, vendor, source_type, parser_key, media_bundle_profile_key, storage_key, original_filename, relative_path,
            mime_type, media_kind, sequence_no, source_id, channel_id, event_type, event_ts::text, vendor_event_id,
            correlation_key, site_id, component_id, nvr_component_id, alarm_case_id, attached_media_id, status,
            parse_error, metadata, created_at::text, updated_at::text
          from alarm_media_inbox
          ${whereClause}
          order by created_at desc
          limit $${parameterIndex}
        `,
        values
      );

      return result.rows.map(toVendorMediaInboxEntry);
    },
    async resolveDeviceIdBySerialNumber(serialNumber) {
      return await resolveUniqueDeviceIdByField(database, "serial_number", serialNumber, "serial number");
    },
    async resolveDeviceIdByNetworkAddress(networkAddress) {
      return await resolveUniqueDeviceIdByField(database, "network_address", networkAddress, "network address");
    }
  };
}

function toPriorityRank(priority: AlarmPriority): number {
  switch (priority) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "normal":
      return 2;
    case "low":
      return 1;
  }
}

function getResponseDeadlineMinutes(priority: AlarmPriority): number {
  switch (priority) {
    case "critical":
      return 5;
    case "high":
      return 10;
    case "normal":
      return 20;
    case "low":
      return 30;
  }
}

function addMinutes(value: string, minutes: number): string {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function isResponseMet(row: AlarmCaseRow): boolean {
  return Boolean(row.first_opened_at) || row.lifecycle_status === "in_progress" || row.lifecycle_status === "resolved" || row.lifecycle_status === "archived";
}

function isOperativeOpenLifecycle(status: AlarmLifecycleStatus): boolean {
  return status === "received" || status === "queued" || status === "reserved" || status === "in_progress";
}

function deriveResponseDeadlineState(row: AlarmCaseRow, responseDueAt: string): AlarmResponseDeadlineState {
  if (isResponseMet(row)) {
    return "met";
  }

  const nowMs = Date.now();
  const dueAtMs = new Date(responseDueAt).getTime();
  if (nowMs >= dueAtMs) {
    return "overdue";
  }

  const totalWindowMs = getResponseDeadlineMinutes(row.priority) * 60_000;
  const warningWindowMs = Math.min(5 * 60_000, Math.max(60_000, Math.floor(totalWindowMs * 0.25)));
  return dueAtMs - nowMs <= warningWindowMs ? "due_soon" : "within_deadline";
}

function toAlarmCaseRecord(row: AlarmCaseRow): AlarmCaseEntity {
  const responseDueAt = addMinutes(row.received_at, getResponseDeadlineMinutes(row.priority));
  const responseDeadlineState = deriveResponseDeadlineState(row, responseDueAt);
  return {
    id: row.id,
    siteId: row.site_id,
    alarmType: row.alarm_type,
    priority: row.priority,
    priorityRank: row.priority_rank,
    lifecycleStatus: row.lifecycle_status,
    assessmentStatus: row.assessment_status,
    technicalState: row.technical_state,
    title: row.title,
    receivedAt: row.received_at,
    lastEventAt: row.last_event_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.primary_device_id ? { primaryDeviceId: row.primary_device_id } : {}),
    ...(row.external_source_ref ? { externalSourceRef: row.external_source_ref } : {}),
    ...(row.incomplete_reason ? { incompleteReason: row.incomplete_reason } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.source_occurred_at ? { sourceOccurredAt: row.source_occurred_at } : {}),
    ...(row.first_opened_at ? { firstOpenedAt: row.first_opened_at } : {}),
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
    ...(row.follow_up_at ? { followUpAt: row.follow_up_at } : {}),
    ...(row.follow_up_note ? { followUpNote: row.follow_up_note } : {}),
    responseDueAt,
    responseDeadlineState,
    isEscalationReady: isOperativeOpenLifecycle(row.lifecycle_status) && responseDeadlineState === "overdue",
    ...(row.closure_reason_id ? { closureReasonId: row.closure_reason_id } : {}),
    ...(row.closed_by_user_id ? { closedByUserId: row.closed_by_user_id } : {}),
    ...(row.closure_comment ? { closureComment: row.closure_comment } : {}),
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
    ...(row.archived_by_user_id ? { archivedByUserId: row.archived_by_user_id } : {}),
    ...(row.source_payload ? { sourcePayload: row.source_payload } : {}),
    ...(row.technical_details ? { technicalDetails: row.technical_details } : {})
  };
}

function toAlarmEventRecord(row: AlarmEventRow): AlarmEventEntity {
  return {
    id: row.id,
    alarmCaseId: row.alarm_case_id,
    eventKind: row.event_kind,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
    ...(row.message ? { message: row.message } : {}),
    ...(row.payload ? { payload: row.payload } : {})
  };
}

function toAlarmMediaRecord(row: AlarmMediaRow): AlarmMediaEntity {
  return {
    id: row.id,
    alarmCaseId: row.alarm_case_id,
    mediaKind: row.media_kind,
    storageKey: row.storage_key,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    ...(row.device_id ? { deviceId: row.device_id } : {}),
    ...(row.mime_type ? { mimeType: row.mime_type } : {}),
    ...(row.captured_at ? { capturedAt: row.captured_at } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {})
  };
}

function toVendorMediaInboxEntry(row: VendorMediaInboxRow): VendorMediaInboxEntry {
  return {
    id: row.id,
    vendor: row.vendor,
    sourceType: row.source_type,
    storageKey: row.storage_key,
    mediaKind: row.media_kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.parser_key ? { parserKey: row.parser_key } : {}),
    ...(row.media_bundle_profile_key ? { mediaBundleProfileKey: row.media_bundle_profile_key as import("@leitstelle/contracts").MediaBundleProfileKey } : {}),
    ...(row.original_filename ? { originalFilename: row.original_filename } : {}),
    ...(row.relative_path ? { relativePath: row.relative_path } : {}),
    ...(row.mime_type ? { mimeType: row.mime_type } : {}),
    ...(row.sequence_no !== null ? { sequenceNo: row.sequence_no } : {}),
    ...(row.source_id ? { sourceId: row.source_id } : {}),
    ...(row.channel_id ? { channelId: row.channel_id } : {}),
    ...(row.event_type ? { eventType: row.event_type } : {}),
    ...(row.event_ts ? { eventTs: row.event_ts } : {}),
    ...(row.vendor_event_id ? { vendorEventId: row.vendor_event_id } : {}),
    ...(row.correlation_key ? { correlationKey: row.correlation_key } : {}),
    ...(row.site_id ? { siteId: row.site_id } : {}),
    ...(row.component_id ? { componentId: row.component_id } : {}),
    ...(row.nvr_component_id ? { nvrComponentId: row.nvr_component_id } : {}),
    ...(row.alarm_case_id ? { alarmCaseId: row.alarm_case_id } : {}),
    ...(row.attached_media_id ? { attachedMediaId: row.attached_media_id } : {}),
    ...(row.parse_error ? { parseError: row.parse_error } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {})
  };
}

function buildAlarmMediaBundles(media: AlarmMediaEntity[]): import("@leitstelle/contracts").AlarmMediaBundleSummary[] {
  const bundles = new Map<string, import("@leitstelle/contracts").AlarmMediaBundleSummary>();
  for (const entry of media) {
    const vendor = typeof entry.metadata?.["vendor"] === "string" ? entry.metadata["vendor"] : undefined;
    const correlationKey = typeof entry.metadata?.["correlationKey"] === "string" ? entry.metadata["correlationKey"] : undefined;
    const sourceType = typeof entry.metadata?.["sourceType"] === "string" ? entry.metadata["sourceType"] : undefined;
    const sourceId = typeof entry.metadata?.["sourceId"] === "string" ? entry.metadata["sourceId"] : undefined;
    const eventType = typeof entry.metadata?.["eventType"] === "string" ? entry.metadata["eventType"] : undefined;
    const eventTs = typeof entry.metadata?.["eventTs"] === "string" ? entry.metadata["eventTs"] : undefined;
    const profileKey = typeof entry.metadata?.["mediaBundleProfileKey"] === "string"
      ? entry.metadata["mediaBundleProfileKey"] as import("@leitstelle/contracts").MediaBundleProfileKey
      : undefined;
    if (!vendor || !correlationKey || !sourceType || !sourceId || !eventType || !eventTs || !profileKey) {
      continue;
    }

    const expectedImages = typeof entry.metadata?.["expectedImages"] === "number" ? entry.metadata["expectedImages"] : 0;
    const expectedClips = typeof entry.metadata?.["expectedClips"] === "number" ? entry.metadata["expectedClips"] : 0;
    const current = bundles.get(correlationKey) ?? {
      correlationKey,
      vendor,
      sourceType,
      sourceId,
      eventType,
      eventTs,
      mediaBundleProfileKey: profileKey,
      expectedImages,
      expectedClips,
      receivedImages: 0,
      receivedClips: 0,
      completenessState: "empty" as const,
      mediaIds: []
    };
    current.mediaIds.push(entry.id);
    if (entry.mediaKind === "clip") {
      current.receivedClips += 1;
    } else if (entry.mediaKind === "snapshot") {
      current.receivedImages += 1;
    }
    if (typeof entry.metadata?.["componentId"] === "string") {
      current.componentId = entry.metadata["componentId"] as string;
    }
    if (typeof entry.metadata?.["siteId"] === "string") {
      current.siteId = entry.metadata["siteId"] as string;
    }
    if (typeof entry.metadata?.["nvrComponentId"] === "string") {
      current.nvrComponentId = entry.metadata["nvrComponentId"] as string;
    }
    if (typeof entry.metadata?.["channelId"] === "string") {
      current.channelId = entry.metadata["channelId"] as string;
    }
    if (typeof entry.metadata?.["vendorEventId"] === "string") {
      current.vendorEventId = entry.metadata["vendorEventId"] as string;
    }
    bundles.set(correlationKey, current);
  }

  for (const bundle of bundles.values()) {
    const isComplete = bundle.receivedImages >= bundle.expectedImages && bundle.receivedClips >= bundle.expectedClips;
    bundle.completenessState = isComplete
      ? "complete"
      : bundle.receivedImages > 0 || bundle.receivedClips > 0
        ? "partial"
        : "empty";
  }

  return Array.from(bundles.values());
}

function toAlarmAssignmentRecord(row: AlarmAssignmentRow): AlarmAssignmentEntity {
  return {
    id: row.id,
    alarmCaseId: row.alarm_case_id,
    userId: row.user_id,
    assignmentKind: row.assignment_kind,
    assignmentStatus: row.assignment_status,
    assignedAt: row.assigned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.released_at ? { releasedAt: row.released_at } : {}),
    ...(row.release_reason ? { releaseReason: row.release_reason } : {})
  };
}

function toAlarmCommentRecord(row: AlarmCommentRow): AlarmCommentEntity {
  return {
    id: row.id,
    alarmCaseId: row.alarm_case_id,
    userId: row.user_id,
    commentKind: row.comment_kind,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.context ? { context: row.context } : {}),
    ...(row.user_display_name ? { userDisplayName: row.user_display_name } : {})
  };
}

function toAlarmActionRecord(row: AlarmCaseActionRow): AlarmActionEntity {
  return {
    id: row.id,
    alarmCaseId: row.alarm_case_id,
    actionTypeId: row.action_type_id,
    actionTypeCode: row.action_type_code,
    actionTypeLabel: row.action_type_label,
    statusId: row.status_id,
    statusCode: row.status_code,
    statusLabel: row.status_label,
    userId: row.user_id,
    comment: row.comment,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.user_display_name ? { userDisplayName: row.user_display_name } : {})
  };
}

function toAlarmReasonRecord(row: AlarmReasonRow): AlarmFalsePositiveReason {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    ...(row.description ? { description: row.description } : {})
  };
}

function toAlarmClosureReasonRecord(row: AlarmReasonRow): AlarmClosureReason {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    ...(row.description ? { description: row.description } : {})
  };
}

function toAlarmActionTypeRecord(row: AlarmActionTypeRow): AlarmActionTypeCatalogEntry {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    ...(row.description ? { description: row.description } : {})
  };
}

function toAlarmActionStatusRecord(row: AlarmActionStatusRow): AlarmActionStatusCatalogEntry {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    ...(row.description ? { description: row.description } : {})
  };
}

function toAlarmWorkflowProfileRecord(row: AlarmWorkflowProfileRow): Omit<AlarmWorkflowProfile, "steps"> {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    code: row.code,
    label: row.label,
    timeContext: row.time_context,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    ...(row.description ? { description: row.description } : {}),
    ...(row.special_context_label ? { specialContextLabel: row.special_context_label } : {}),
    ...(row.active_from_time ? { activeFromTime: row.active_from_time } : {}),
    ...(row.active_to_time ? { activeToTime: row.active_to_time } : {})
  };
}

function toAlarmWorkflowStepRecord(row: AlarmWorkflowStepRow): AlarmWorkflowChecklistStep {
  return {
    id: row.id,
    profileId: row.profile_id,
    stepCode: row.step_code,
    title: row.title,
    sortOrder: row.sort_order,
    isRequiredByDefault: row.is_required_by_default,
    ...(row.instruction ? { instruction: row.instruction } : {}),
    ...(row.action_type_id ? { actionTypeId: row.action_type_id } : {}),
    ...(row.action_type_code ? { actionTypeCode: row.action_type_code } : {}),
    ...(row.action_type_label ? { actionTypeLabel: row.action_type_label } : {}),
    ...(row.active_from_time ? { activeFromTime: row.active_from_time } : {}),
    ...(row.active_to_time ? { activeToTime: row.active_to_time } : {})
  };
}

function toAlarmPipelineItem(row: AlarmPipelineRow): AlarmPipelineEntity {
  const base = toAlarmCaseRecord(row);
  return {
    ...base,
    siteName: row.site_name,
    customerName: row.customer_name,
    mediaCount: Number(row.media_count),
    eventCount: Number(row.event_count),
    hasTechnicalIssue: row.technical_state !== "complete",
    ...(row.primary_device_name ? { primaryDeviceName: row.primary_device_name } : {}),
    ...(row.assignment_user_id && row.assignment_display_name && row.assignment_status && row.assignment_assigned_at
      ? {
          activeAssignment: {
            userId: row.assignment_user_id,
            displayName: row.assignment_display_name,
            assignmentStatus: row.assignment_status,
            assignedAt: row.assignment_assigned_at
          }
        }
      : {})
  };
}

function toAlarmArchiveItem(row: AlarmArchiveRow): AlarmArchiveItem {
  const base = toAlarmCaseRecord(row);
  return {
    ...base,
    siteName: row.site_name,
    customerName: row.customer_name,
    mediaCount: Number(row.media_count),
    eventCount: Number(row.event_count),
    ...(row.primary_device_name ? { primaryDeviceName: row.primary_device_name } : {}),
    ...(row.closure_reason_label ? { closureReasonLabel: row.closure_reason_label } : {}),
    ...(row.closed_by_display_name ? { closedByDisplayName: row.closed_by_display_name } : {}),
    ...(row.archived_by_display_name ? { archivedByDisplayName: row.archived_by_display_name } : {})
  };
}

function toArchiveStatuses(scope: AlarmArchiveFilter["lifecycleScope"]): AlarmLifecycleStatus[] {
  switch (scope) {
    case "open":
      return openStatuses;
    case "resolved":
      return ["resolved"];
    case "all":
      return [...openStatuses, "resolved", "archived"];
    case "archived":
    default:
      return ["archived"];
  }
}

function resolveArchiveRange(filter: AlarmArchiveFilter): {
  dateFrom?: string;
  dateToExclusive?: string;
} {
  if (filter.period === "custom") {
    return {
      ...(filter.dateFrom ? { dateFrom: `${filter.dateFrom}T00:00:00.000Z` } : {}),
      ...(filter.dateTo ? { dateToExclusive: addDay(`${filter.dateTo}T00:00:00.000Z`) } : {})
    };
  }

  const end = new Date();
  const start = new Date(end);
  switch (filter.period) {
    case "day":
      start.setUTCHours(0, 0, 0, 0);
      break;
    case "week":
      start.setUTCDate(start.getUTCDate() - 6);
      start.setUTCHours(0, 0, 0, 0);
      break;
    case "month":
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      break;
    case "year":
      start.setUTCMonth(0, 1);
      start.setUTCHours(0, 0, 0, 0);
      break;
  }

  return {
    dateFrom: start.toISOString(),
    dateToExclusive: addDay(end.toISOString().slice(0, 10) + "T00:00:00.000Z")
  };
}

function addDay(value: string): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function mapDisturbanceTypeToAlarmTypes(disturbanceType: string): AlarmType[] {
  switch (disturbanceType) {
    case "camera_unreachable":
      return ["camera_offline"];
    case "nvr_unreachable":
      return ["nvr_offline"];
    case "router_unreachable":
      return ["router_offline"];
    case "site_connection_disturbed":
      return ["technical"];
    case "technical_alarm":
      return ["technical"];
    case "other_disturbance":
      return ["other_disturbance"];
    default:
      return [];
  }
}

async function ensureSiteExists(database: DatabaseClient, siteId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from sites where id = $1", [siteId]);
  if (!result.rows[0]) {
    throw new AppError("Alarm site not found.", {
      status: 404,
      code: "ALARM_SITE_NOT_FOUND"
    });
  }
}

async function ensureDeviceExists(database: DatabaseClient, deviceId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from devices where id = $1", [deviceId]);
  if (!result.rows[0]) {
    throw new AppError("Alarm device not found.", {
      status: 404,
      code: "ALARM_DEVICE_NOT_FOUND"
    });
  }
}

async function resolveUniqueDeviceIdByField(
  database: DatabaseClient,
  fieldName: "serial_number" | "network_address",
  value: string,
  label: string
): Promise<string | null> {
  const result = await database.query<{ id: string }>(
    `select id from devices where ${fieldName} = $1 order by id asc limit 2`,
    [value]
  );
  if (result.rows.length === 0) {
    return null;
  }
  if (result.rows.length > 1) {
    throw new AppError(`Alarm device lookup by ${label} is ambiguous.`, {
      status: 409,
      code: "ALARM_DEVICE_LOOKUP_AMBIGUOUS"
    });
  }
  return result.rows[0]!.id;
}

async function resolveAlarmSourceMappingResolution(
  database: DatabaseClient,
  input: {
    siteId?: string;
    sourceSystem: string;
    sourceType: string;
    externalDeviceId?: string;
    externalRecorderId?: string;
    serialNumber?: string;
    channelNumber?: number;
    analyticsName?: string;
    sourceName?: string;
    eventNamespace?: string;
  }
): Promise<AlarmSourceMappingResolution | null> {
  const result = await database.query<AlarmSourceMappingLookupRow>(
    `
      select
        asm.id,
        asm.site_id,
        asm.component_id,
        asm.nvr_component_id,
        asm.vendor,
        asm.source_type,
        asm.external_source_key,
        asm.external_device_id,
        asm.external_recorder_id,
        asm.channel_number,
        asm.serial_number,
        asm.analytics_name,
        asm.event_namespace,
        asm.media_bundle_profile_key,
        asm.sort_order
      from alarm_source_mappings asm
      join devices component on component.id = asm.component_id
      where asm.is_active = true
        and component.is_active = true
        and asm.vendor = $1
        and asm.source_type = $2
        and ($3::text is null or asm.site_id = $3)
      order by asm.sort_order asc, asm.id asc
    `,
    [input.sourceSystem.trim(), input.sourceType.trim(), input.siteId ?? null]
  );

  let bestCandidate: AlarmSourceMappingResolution | null = null;
  let bestScore = -1;

  for (const row of result.rows) {
    const matchedFields: string[] = [];
    const mismatch = hasAlarmSourceMappingMismatch(row, input, matchedFields);
    if (mismatch || matchedFields.length === 0) {
      continue;
    }

    const score = matchedFields.length * 100 - row.sort_order;
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = {
        mappingId: row.id,
        siteId: row.site_id,
        componentId: row.component_id,
        ...(row.nvr_component_id ? { nvrComponentId: row.nvr_component_id } : {}),
        ...(row.media_bundle_profile_key ? { mediaBundleProfileKey: row.media_bundle_profile_key as import("@leitstelle/contracts").MediaBundleProfileKey } : {}),
        matchedFields
      };
      continue;
    }

    if (score === bestScore && bestCandidate) {
      throw new AppError("Alarm source mapping is ambiguous.", {
        status: 409,
        code: "ALARM_SOURCE_MAPPING_AMBIGUOUS",
        detail: `${bestCandidate.mappingId}, ${row.id}`
      });
    }
  }

  return bestCandidate;
}

function hasAlarmSourceMappingMismatch(
  row: AlarmSourceMappingLookupRow,
  input: {
    externalDeviceId?: string;
    externalRecorderId?: string;
    serialNumber?: string;
    channelNumber?: number;
    analyticsName?: string;
    sourceName?: string;
    eventNamespace?: string;
  },
  matchedFields: string[]
): boolean {
  return (
    fieldMismatch(row.external_device_id, input.externalDeviceId, "externalDeviceId", matchedFields)
    || fieldMismatch(row.external_recorder_id, input.externalRecorderId, "externalRecorderId", matchedFields)
    || numericFieldMismatch(row.channel_number, input.channelNumber, "channelNumber", matchedFields)
    || fieldMismatch(row.serial_number, input.serialNumber, "serialNumber", matchedFields)
    || fieldMismatch(row.analytics_name, input.analyticsName, "analyticsName", matchedFields)
    || fieldMismatch(row.external_source_key, input.sourceName, "sourceName", matchedFields)
    || fieldMismatch(row.event_namespace, input.eventNamespace, "eventNamespace", matchedFields)
  );
}

function fieldMismatch(
  expected: string | null,
  actual: string | undefined,
  fieldName: string,
  matchedFields: string[]
): boolean {
  if (!expected) {
    return false;
  }
  if (!actual?.trim()) {
    return true;
  }
  if (expected !== actual.trim()) {
    return true;
  }
  matchedFields.push(fieldName);
  return false;
}

function numericFieldMismatch(
  expected: number | null,
  actual: number | undefined,
  fieldName: string,
  matchedFields: string[]
): boolean {
  if (expected === null) {
    return false;
  }
  if (typeof actual !== "number") {
    return true;
  }
  if (expected !== actual) {
    return true;
  }
  matchedFields.push(fieldName);
  return false;
}

async function resolveCaseByComponentEventTime(
  database: DatabaseClient,
  input: {
    siteId: string;
    componentId: string;
    alarmType: AlarmCaseRecord["alarmType"];
    sourceOccurredAt: string;
    toleranceSeconds?: number;
  }
): Promise<AlarmCaseEntity | null> {
  const toleranceSeconds = Math.max(0, input.toleranceSeconds ?? 0);
  const result = await database.query<AlarmCaseRow>(
    `
      select
        id, site_id, primary_device_id, external_source_ref, alarm_type, priority, priority_rank,
        lifecycle_status, assessment_status, technical_state, incomplete_reason, title, description,
        source_occurred_at, received_at, first_opened_at, resolved_at, follow_up_at, follow_up_note,
        closure_reason_id, closed_by_user_id, closure_comment, archived_at, archived_by_user_id, last_event_at,
        source_payload, technical_details,
        created_at, updated_at
      from alarm_cases
      where site_id = $1
        and primary_device_id = $2
        and alarm_type = $3
        and source_occurred_at is not null
        and lifecycle_status <> 'archived'
        and source_occurred_at between ($4::timestamptz - make_interval(secs => $5::int)) and ($4::timestamptz + make_interval(secs => $5::int))
      order by abs(extract(epoch from (source_occurred_at - $4::timestamptz))) asc, received_at desc
      limit 2
    `,
    [input.siteId, input.componentId, input.alarmType, input.sourceOccurredAt, toleranceSeconds]
  );
  if (result.rows.length > 1) {
    const first = result.rows[0]!;
    const second = result.rows[1]!;
    const firstDelta = Math.abs(new Date(first.source_occurred_at ?? first.received_at).getTime() - new Date(input.sourceOccurredAt).getTime());
    const secondDelta = Math.abs(new Date(second.source_occurred_at ?? second.received_at).getTime() - new Date(input.sourceOccurredAt).getTime());
    if (firstDelta === secondDelta) {
      throw new AppError("Alarm case lookup by component event time is ambiguous.", {
        status: 409,
        code: "ALARM_MEDIA_CORRELATION_AMBIGUOUS"
      });
    }
  }
  return result.rows[0] ? toAlarmCaseRecord(result.rows[0]) : null;
}

async function ensureUserExists(database: DatabaseClient, userId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from users where id = $1", [userId]);
  if (!result.rows[0]) {
    throw new AppError("Alarm assignment user not found.", {
      status: 404,
      code: "ALARM_USER_NOT_FOUND"
    });
  }
}

async function ensureActionTypeExists(database: DatabaseClient, actionTypeId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from alarm_action_types where id = $1 and is_active = true", [actionTypeId]);
  if (!result.rows[0]) {
    throw new AppError("Alarm action type not found.", {
      status: 404,
      code: "ALARM_ACTION_TYPE_NOT_FOUND"
    });
  }
}

async function ensureActionStatusExists(database: DatabaseClient, statusId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from alarm_action_statuses where id = $1 and is_active = true", [statusId]);
  if (!result.rows[0]) {
    throw new AppError("Alarm action status not found.", {
      status: 404,
      code: "ALARM_ACTION_STATUS_NOT_FOUND"
    });
  }
}

async function ensureWorkflowProfileStepsValid(
  database: DatabaseClient,
  steps: AlarmWorkflowProfileUpsertInput["steps"]
): Promise<void> {
  for (const step of steps) {
    if (step.actionTypeId) {
      await ensureActionTypeExists(database, step.actionTypeId);
    }
  }
}

async function loadWorkflowProfiles(database: DatabaseClient, filter: AlarmWorkflowProfileFilter = {}): Promise<AlarmWorkflowProfile[]> {
  const clauses = ["p.is_active = true"];
  const values: unknown[] = [];
  let parameterIndex = 1;

  if (filter.siteId) {
    clauses.push(`p.site_id = $${parameterIndex}`);
    values.push(filter.siteId);
    parameterIndex += 1;
  }

  if (filter.timeContext) {
    clauses.push(`p.time_context = $${parameterIndex}`);
    values.push(filter.timeContext);
    parameterIndex += 1;
  }

  const [profileResult, stepResult] = await Promise.all([
    database.query<AlarmWorkflowProfileRow>(
      `
        select
          p.id,
          p.site_id,
          s.site_name,
          p.code,
          p.label,
          p.description,
          p.time_context,
          p.special_context_label,
          p.is_active,
          p.sort_order,
          p.active_from_time::text as active_from_time,
          p.active_to_time::text as active_to_time
        from alarm_workflow_profiles p
        join sites s on s.id = p.site_id
        where ${clauses.join(" and ")}
        order by p.sort_order asc, p.label asc
      `,
      values
    ),
    database.query<AlarmWorkflowStepRow>(
      `
        select
          step.id,
          step.profile_id,
          step.step_code,
          step.title,
          step.instruction,
          step.sort_order,
          step.is_required_by_default,
          step.action_type_id,
          action_type.code as action_type_code,
          action_type.label as action_type_label,
          step.active_from_time::text as active_from_time,
          step.active_to_time::text as active_to_time
        from alarm_workflow_profile_steps step
        left join alarm_action_types action_type on action_type.id = step.action_type_id
        order by step.profile_id asc, step.sort_order asc, step.title asc
      `
    )
  ]);

  const stepsByProfile = new Map<string, AlarmWorkflowChecklistStep[]>();
  for (const row of stepResult.rows) {
    const steps = stepsByProfile.get(row.profile_id) ?? [];
    steps.push(toAlarmWorkflowStepRecord(row));
    stepsByProfile.set(row.profile_id, steps);
  }

  return profileResult.rows.map((row) => ({
    ...toAlarmWorkflowProfileRecord(row),
    steps: stepsByProfile.get(row.id) ?? []
  }));
}

function deriveInstructionTimeContext(referenceTimestamp: string): AlarmInstructionTimeContext {
  const referenceDate = new Date(referenceTimestamp);
  const weekday = referenceDate.getUTCDay();
  return weekday === 0 || weekday === 6 ? "weekend" : "normal";
}

async function ensureAlarmCaseExists(database: DatabaseClient, alarmCaseId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from alarm_cases where id = $1", [alarmCaseId]);
  if (!result.rows[0]) {
    throw new AppError("Alarm case not found.", {
      status: 404,
      code: "ALARM_CASE_NOT_FOUND"
    });
  }
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}