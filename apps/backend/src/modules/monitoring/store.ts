/**
 * Persistiert technische Monitoring-Pruefungen, Stoerungen und zugehoerige Notizen.
 */
import { randomUUID } from "node:crypto";

import type {
  MonitoringCheckStateRecord,
  MonitoringCheckStateStatus,
  MonitoringCheckTargetRecord,
  MonitoringDisturbanceCreateInput,
  MonitoringDisturbanceDetail,
  MonitoringDisturbanceEventKind,
  MonitoringDisturbanceEventRecord,
  MonitoringDisturbanceRecord,
  MonitoringDisturbanceResolveInput,
  MonitoringDisturbanceStatus,
  MonitoringDisturbanceTypeCatalogEntry,
  MonitoringPipelineFilter,
  MonitoringPipelineItem,
  MonitoringPriority,
  MonitoringServiceCaseRecord,
  MonitoringServiceCaseStatus,
  MonitoringSiteStatusUpdateInput,
  SiteTechnicalOverallStatus,
  SiteTechnicalStatusRecord
} from "@leitstelle/contracts";
import { AppError } from "@leitstelle/observability";

import type { DatabaseClient } from "../../db/client.js";
import type { MonitoringCheckPlanItem, MonitoringStore } from "./types.js";

type DisturbanceTypeRow = {
  id: string;
  code: MonitoringDisturbanceTypeCatalogEntry["code"];
  label: string;
  description: string | null;
  default_priority: MonitoringPriority;
  is_active: boolean;
  sort_order: number;
};

type DisturbanceRow = {
  id: string;
  site_id: string;
  check_target_id: string | null;
  device_id: string | null;
  reference_label: string | null;
  disturbance_type_id: string;
  disturbance_type_code: MonitoringDisturbanceTypeCatalogEntry["code"];
  disturbance_type_label: string;
  priority: MonitoringPriority;
  priority_rank: number;
  status: MonitoringDisturbanceStatus;
  title: string;
  description: string | null;
  comment: string | null;
  owner_user_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: string | null;
  created_at: string;
  updated_at: string;
};

type SiteStatusRow = {
  technical_status: SiteTechnicalOverallStatus;
  technical_status_updated_at: string;
};

type CheckPlanRow = {
  target_id: string;
  target_scope: MonitoringCheckTargetRecord["scope"];
  site_id: string;
  site_name: string;
  monitoring_interval_seconds: number;
  failure_threshold: number;
  device_id: string | null;
  device_name: string | null;
  device_type: string | null;
  device_network_address: string | null;
  target_label: string;
  check_kind: MonitoringCheckTargetRecord["checkKind"];
  endpoint: string;
  port: number | null;
  path: string | null;
  request_method: MonitoringCheckTargetRecord["requestMethod"] | null;
  expected_status_codes: number[];
  timeout_ms: number;
  requires_vpn: boolean;
  disturbance_type_id: string;
  is_active: boolean;
  sort_order: number;
  state_last_status: MonitoringCheckStateStatus | null;
  state_consecutive_failures: number | null;
  state_last_checked_at: string | null;
  state_last_success_at: string | null;
  state_last_failure_at: string | null;
  state_last_error: string | null;
  state_active_disturbance_id: string | null;
};

type PipelineRow = DisturbanceRow & {
  site_name: string;
  customer_id: string;
  customer_name: string;
  site_technical_status: SiteTechnicalOverallStatus;
  device_name: string | null;
  check_target_label: string | null;
  latest_event_at: string | null;
  last_note: string | null;
  service_case_id: string | null;
  service_case_status: MonitoringServiceCaseStatus | null;
};

type DisturbanceDetailRow = DisturbanceRow & {
  site_name: string;
  customer_id: string;
  customer_name: string;
  site_technical_status: SiteTechnicalOverallStatus;
  site_technical_status_updated_at: string;
  device_name: string | null;
  device_type: string | null;
  device_network_address: string | null;
  check_target_label: string | null;
  check_target_scope: MonitoringCheckTargetRecord["scope"] | null;
  check_target_kind: MonitoringCheckTargetRecord["checkKind"] | null;
  check_target_endpoint: string | null;
  check_target_path: string | null;
  check_target_requires_vpn: boolean | null;
};

type DisturbanceEventRow = {
  id: string;
  disturbance_id: string;
  event_kind: MonitoringDisturbanceEventKind;
  previous_status: MonitoringDisturbanceStatus | null;
  status: MonitoringDisturbanceStatus | null;
  actor_user_id: string | null;
  message: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ServiceCaseRow = {
  id: string;
  disturbance_id: string;
  site_id: string;
  device_id: string | null;
  reference_label: string | null;
  status: MonitoringServiceCaseStatus;
  created_at: string;
  created_by_user_id: string;
  comment: string;
};

export function createMonitoringStore(database: DatabaseClient): MonitoringStore {
  return {
    async getDisturbanceTypeCatalog() {
      const result = await database.query<DisturbanceTypeRow>(
        `
          select id, code, label, description, default_priority, is_active, sort_order
          from monitoring_disturbance_types
          order by sort_order asc, label asc
        `
      );

      return result.rows.map((row) => ({
        id: row.id,
        code: row.code,
        label: row.label,
        defaultPriority: row.default_priority,
        isActive: row.is_active,
        sortOrder: row.sort_order,
        ...(row.description ? { description: row.description } : {})
      }));
    },
    async listDisturbancesForSite(siteId, status) {
      await ensureSiteExists(database, siteId);

      const values: unknown[] = [siteId];
      const statusClause = status
        ? (() => {
            values.push(status);
            return "and d.status = $2";
          })()
        : "";

      const result = await database.query<DisturbanceRow>(
        `
          select
            d.id, d.site_id, d.check_target_id, d.device_id, d.reference_label, d.disturbance_type_id,
            t.code as disturbance_type_code, t.label as disturbance_type_label,
            d.priority, d.priority_rank, d.status, d.title, d.description, d.comment, d.owner_user_id,
            d.started_at::text, d.ended_at::text,
            case
              when d.ended_at is null then extract(epoch from (now() - d.started_at))::bigint::text
              else extract(epoch from (d.ended_at - d.started_at))::bigint::text
            end as duration_seconds,
            d.created_at::text, d.updated_at::text
          from monitoring_disturbances d
          join monitoring_disturbance_types t on t.id = d.disturbance_type_id
          where d.site_id = $1
          ${statusClause}
          order by d.priority_rank desc, d.started_at desc, d.created_at desc
        `,
        values
      );

      return result.rows.map(toDisturbanceRecord);
    },
    async listOpenDisturbancesForSite(siteId) {
      return await this.listDisturbancesForSite(siteId, undefined).then((rows) =>
        rows.filter((row) => row.status === "open" || row.status === "acknowledged")
      );
    },
    async listOpenPipelineItems(filter) {
      const values: unknown[] = [];
      const clauses = ["d.status in ('open', 'acknowledged')"];

      if (filter.siteId) {
        values.push(filter.siteId);
        clauses.push(`d.site_id = $${values.length}`);
      }

      if (filter.priority) {
        values.push(filter.priority);
        clauses.push(`d.priority = $${values.length}`);
      }

      if (filter.siteTechnicalStatus) {
        values.push(filter.siteTechnicalStatus);
        clauses.push(`s.technical_status = $${values.length}`);
      }

      let limitClause = "";
      if (filter.limit) {
        values.push(filter.limit);
        limitClause = `limit $${values.length}`;
      }

      const result = await database.query<PipelineRow>(
        `
          select
            d.id, d.site_id, d.check_target_id, d.device_id, d.reference_label, d.disturbance_type_id,
            t.code as disturbance_type_code, t.label as disturbance_type_label,
            d.priority, d.priority_rank, d.status, d.title, d.description, d.comment, d.owner_user_id,
            d.started_at::text, d.ended_at::text,
            case
              when d.ended_at is null then extract(epoch from (now() - d.started_at))::bigint::text
              else extract(epoch from (d.ended_at - d.started_at))::bigint::text
            end as duration_seconds,
            d.created_at::text, d.updated_at::text,
            s.site_name,
            c.id as customer_id,
            c.name as customer_name,
            s.technical_status as site_technical_status,
            dev.name as device_name,
            target.label as check_target_label,
            latest.latest_event_at::text,
            notes.last_note,
            svc.id as service_case_id,
            svc.status as service_case_status
          from monitoring_disturbances d
          join monitoring_disturbance_types t on t.id = d.disturbance_type_id
          join sites s on s.id = d.site_id
          join customers c on c.id = s.customer_id
          left join devices dev on dev.id = d.device_id
          left join monitoring_check_targets target on target.id = d.check_target_id
          left join monitoring_service_cases svc on svc.disturbance_id = d.id
          left join lateral (
            select max(created_at) as latest_event_at
            from monitoring_disturbance_events
            where disturbance_id = d.id
          ) latest on true
          left join lateral (
            select note as last_note
            from monitoring_disturbance_events
            where disturbance_id = d.id
              and event_kind = 'note_added'
            order by created_at desc
            limit 1
          ) notes on true
          where ${clauses.join("\n            and ")}
          order by d.priority_rank desc, d.started_at desc, d.created_at desc
          ${limitClause}
        `,
        values
      );

      return result.rows.map(toMonitoringPipelineItem);
    },
    async getDisturbanceDetail(disturbanceId) {
      const detailResult = await database.query<DisturbanceDetailRow>(
        `
          select
            d.id, d.site_id, d.check_target_id, d.device_id, d.reference_label, d.disturbance_type_id,
            t.code as disturbance_type_code, t.label as disturbance_type_label,
            d.priority, d.priority_rank, d.status, d.title, d.description, d.comment, d.owner_user_id,
            d.started_at::text, d.ended_at::text,
            case
              when d.ended_at is null then extract(epoch from (now() - d.started_at))::bigint::text
              else extract(epoch from (d.ended_at - d.started_at))::bigint::text
            end as duration_seconds,
            d.created_at::text, d.updated_at::text,
            s.site_name,
            c.id as customer_id,
            c.name as customer_name,
            s.technical_status as site_technical_status,
            s.technical_status_updated_at::text as site_technical_status_updated_at,
            dev.name as device_name,
            dev.type as device_type,
            dev.network_address as device_network_address,
            target.label as check_target_label,
            target.scope as check_target_scope,
            target.check_kind as check_target_kind,
            target.endpoint as check_target_endpoint,
            target.path as check_target_path,
            target.requires_vpn as check_target_requires_vpn
          from monitoring_disturbances d
          join monitoring_disturbance_types t on t.id = d.disturbance_type_id
          join sites s on s.id = d.site_id
          join customers c on c.id = s.customer_id
          left join devices dev on dev.id = d.device_id
          left join monitoring_check_targets target on target.id = d.check_target_id
          where d.id = $1
        `,
        [disturbanceId]
      );
      const row = detailResult.rows[0];
      if (!row) {
        return null;
      }

      const historyResult = await database.query<DisturbanceEventRow>(
        `
          select
            id, disturbance_id, event_kind, previous_status, status, actor_user_id,
            message, note, metadata, created_at::text
          from monitoring_disturbance_events
          where disturbance_id = $1
          order by created_at asc, id asc
        `,
        [disturbanceId]
      );

      const history = historyResult.rows.map(toMonitoringDisturbanceEventRecord);
      const notes = history.filter((entry) => entry.eventKind === "note_added");
      const serviceCase = await this.getServiceCaseByDisturbanceId(disturbanceId);

      return {
        disturbance: toDisturbanceRecord(row),
        site: {
          id: row.site_id,
          siteName: row.site_name,
          customerId: row.customer_id,
          customerName: row.customer_name,
          technicalStatus: row.site_technical_status,
          technicalStatusUpdatedAt: row.site_technical_status_updated_at
        },
        ...(row.device_id && row.device_name && row.device_type
          ? {
              device: {
                id: row.device_id,
                name: row.device_name,
                type: row.device_type,
                ...(row.device_network_address ? { networkAddress: row.device_network_address } : {})
              }
            }
          : {}),
        ...(row.check_target_id && row.check_target_label && row.check_target_scope && row.check_target_kind && row.check_target_endpoint
          ? {
              checkTarget: {
                id: row.check_target_id,
                label: row.check_target_label,
                scope: row.check_target_scope,
                checkKind: row.check_target_kind,
                endpoint: row.check_target_endpoint,
                requiresVpn: row.check_target_requires_vpn ?? false,
                ...(row.check_target_path ? { path: row.check_target_path } : {})
              }
            }
          : {}),
        ...(serviceCase ? { serviceCase } : {}),
        history,
        notes
      };
    },
    async createDisturbance(input) {
      await ensureSiteExists(database, input.siteId);

      if (input.deviceId) {
        await ensureDeviceExists(database, input.deviceId);
      }

      const type = await findDisturbanceType(database, input.disturbanceTypeId);
      const priority = input.priority ?? type.defaultPriority;
      const result = await database.query<DisturbanceRow>(
        `
          insert into monitoring_disturbances(
            id, site_id, check_target_id, device_id, reference_label, disturbance_type_id, priority, priority_rank, status,
            title, description, comment, owner_user_id, started_at, ended_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz, $15::timestamptz)
          returning
            id, site_id, check_target_id, device_id, reference_label, disturbance_type_id,
            $16::text as disturbance_type_code, $17::text as disturbance_type_label,
            priority, priority_rank, status, title, description, comment, owner_user_id,
            started_at::text, ended_at::text,
            case
              when ended_at is null then extract(epoch from (now() - started_at))::bigint::text
              else extract(epoch from (ended_at - started_at))::bigint::text
            end as duration_seconds,
            created_at::text, updated_at::text
        `,
        [
          input.id ?? randomUUID(),
          input.siteId,
          normalizeOptional(input.checkTargetId) ?? null,
          normalizeOptional(input.deviceId) ?? null,
          normalizeOptional(input.referenceLabel) ?? null,
          type.id,
          priority,
          toPriorityRank(priority),
          input.status ?? "open",
          input.title.trim(),
          normalizeOptional(input.description) ?? null,
          normalizeOptional(input.comment) ?? null,
          normalizeOptional(input.ownerUserId) ?? null,
          input.startedAt ?? new Date().toISOString(),
          input.endedAt ?? null,
          type.code,
          type.label
        ]
      );

      return toDisturbanceRecord(result.rows[0]!);
    },
    async updateDisturbanceObservation(disturbanceId, input) {
      const priority = input.priority ?? null;
      const result = await database.query<DisturbanceRow>(
        `
          update monitoring_disturbances d
          set
            priority = coalesce($2, d.priority),
            priority_rank = coalesce($3, d.priority_rank),
            title = $4,
            description = $5,
            comment = $6,
            updated_at = now()
          from monitoring_disturbance_types t
          where d.id = $1
            and t.id = d.disturbance_type_id
          returning
            d.id, d.site_id, d.check_target_id, d.device_id, d.reference_label, d.disturbance_type_id,
            t.code as disturbance_type_code, t.label as disturbance_type_label,
            d.priority, d.priority_rank, d.status, d.title, d.description, d.comment, d.owner_user_id,
            d.started_at::text, d.ended_at::text,
            case
              when d.ended_at is null then extract(epoch from (now() - d.started_at))::bigint::text
              else extract(epoch from (d.ended_at - d.started_at))::bigint::text
            end as duration_seconds,
            d.created_at::text, d.updated_at::text
        `,
        [
          disturbanceId,
          priority,
          priority ? toPriorityRank(priority) : null,
          input.title.trim(),
          normalizeOptional(input.description) ?? null,
          normalizeOptional(input.comment) ?? null
        ]
      );
      const row = result.rows[0];

      if (!row) {
        throw new AppError("Monitoring disturbance not found.", {
          status: 404,
          code: "MONITORING_DISTURBANCE_NOT_FOUND"
        });
      }

      return toDisturbanceRecord(row);
    },
    async resolveDisturbance(disturbanceId, input) {
      const result = await database.query<DisturbanceRow>(
        `
          update monitoring_disturbances d
          set
            status = 'resolved',
            ended_at = coalesce($2::timestamptz, now()),
            comment = coalesce($3, d.comment),
            owner_user_id = coalesce($4, d.owner_user_id),
            updated_at = now()
          from monitoring_disturbance_types t
          where d.id = $1
            and t.id = d.disturbance_type_id
          returning
            d.id, d.site_id, d.check_target_id, d.device_id, d.reference_label, d.disturbance_type_id,
            t.code as disturbance_type_code, t.label as disturbance_type_label,
            d.priority, d.priority_rank, d.status, d.title, d.description, d.comment, d.owner_user_id,
            d.started_at::text, d.ended_at::text,
            case
              when d.ended_at is null then extract(epoch from (now() - d.started_at))::bigint::text
              else extract(epoch from (d.ended_at - d.started_at))::bigint::text
            end as duration_seconds,
            d.created_at::text, d.updated_at::text
        `,
        [disturbanceId, input.endedAt ?? null, normalizeOptional(input.comment) ?? null, normalizeOptional(input.ownerUserId) ?? null]
      );
      const row = result.rows[0];

      if (!row) {
        throw new AppError("Monitoring disturbance not found.", {
          status: 404,
          code: "MONITORING_DISTURBANCE_NOT_FOUND"
        });
      }

      return toDisturbanceRecord(row);
    },
    async acknowledgeDisturbance(disturbanceId, input) {
      const result = await database.query<DisturbanceRow>(
        `
          update monitoring_disturbances d
          set
            status = 'acknowledged',
            comment = coalesce($2, d.comment),
            owner_user_id = coalesce($3, d.owner_user_id),
            updated_at = now()
          from monitoring_disturbance_types t
          where d.id = $1
            and d.status in ('open', 'acknowledged')
            and t.id = d.disturbance_type_id
          returning
            d.id, d.site_id, d.check_target_id, d.device_id, d.reference_label, d.disturbance_type_id,
            t.code as disturbance_type_code, t.label as disturbance_type_label,
            d.priority, d.priority_rank, d.status, d.title, d.description, d.comment, d.owner_user_id,
            d.started_at::text, d.ended_at::text,
            case
              when d.ended_at is null then extract(epoch from (now() - d.started_at))::bigint::text
              else extract(epoch from (d.ended_at - d.started_at))::bigint::text
            end as duration_seconds,
            d.created_at::text, d.updated_at::text
        `,
        [disturbanceId, normalizeOptional(input.comment) ?? null, normalizeOptional(input.ownerUserId) ?? null]
      );
      const row = result.rows[0];

      if (!row) {
        throw new AppError("Monitoring disturbance not found or cannot be acknowledged.", {
          status: 404,
          code: "MONITORING_DISTURBANCE_NOT_FOUND"
        });
      }

      return toDisturbanceRecord(row);
    },
    async appendDisturbanceEvent(input) {
      const result = await database.query<DisturbanceEventRow>(
        `
          insert into monitoring_disturbance_events(
            id, disturbance_id, event_kind, previous_status, status, actor_user_id, message, note, metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
          returning
            id, disturbance_id, event_kind, previous_status, status, actor_user_id,
            message, note, metadata, created_at::text
        `,
        [
          randomUUID(),
          input.disturbanceId,
          input.eventKind,
          input.previousStatus ?? null,
          input.status ?? null,
          normalizeOptional(input.actorUserId) ?? null,
          normalizeOptional(input.message) ?? null,
          normalizeOptional(input.note) ?? null,
          JSON.stringify(input.metadata ?? {})
        ]
      );

      return toMonitoringDisturbanceEventRecord(result.rows[0]!);
    },
    async addDisturbanceNote(disturbanceId, input) {
      return await this.appendDisturbanceEvent({
        disturbanceId,
        eventKind: "note_added",
        actorUserId: input.actorUserId,
        note: input.note,
        message: "Monitoring note added."
      });
    },
    async getServiceCaseByDisturbanceId(disturbanceId) {
      const result = await database.query<ServiceCaseRow>(
        `
          select
            id, disturbance_id, site_id, device_id, reference_label, status,
            created_at::text, created_by_user_id, comment
          from monitoring_service_cases
          where disturbance_id = $1
        `,
        [disturbanceId]
      );

      const row = result.rows[0];
      return row ? toMonitoringServiceCaseRecord(row) : null;
    },
    async createServiceCase(disturbanceId, input) {
      const disturbance = await this.getDisturbanceDetail(disturbanceId);
      if (!disturbance) {
        throw new AppError("Monitoring disturbance not found.", {
          status: 404,
          code: "MONITORING_DISTURBANCE_NOT_FOUND"
        });
      }

      const existing = await this.getServiceCaseByDisturbanceId(disturbanceId);
      if (existing) {
        throw new AppError("A service case already exists for this monitoring disturbance.", {
          status: 409,
          code: "MONITORING_SERVICE_CASE_ALREADY_EXISTS"
        });
      }

      let result;
      try {
        result = await database.query<ServiceCaseRow>(
          `
            insert into monitoring_service_cases(
              id, disturbance_id, site_id, device_id, reference_label, status, comment, created_by_user_id
            )
            values ($1, $2, $3, $4, $5, 'open', $6, $7)
            returning
              id, disturbance_id, site_id, device_id, reference_label, status,
              created_at::text, created_by_user_id, comment
          `,
          [
            randomUUID(),
            disturbanceId,
            disturbance.site.id,
            disturbance.device?.id ?? null,
            disturbance.disturbance.referenceLabel ?? disturbance.checkTarget?.label ?? null,
            input.comment.trim(),
            input.actorUserId
          ]
        );
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
          throw new AppError("A service case already exists for this monitoring disturbance.", {
            status: 409,
            code: "MONITORING_SERVICE_CASE_ALREADY_EXISTS"
          });
        }
        throw error;
      }

      return toMonitoringServiceCaseRecord(result.rows[0]!);
    },
    async getSiteTechnicalStatus(siteId) {
      await ensureSiteExists(database, siteId);

      const result = await database.query<SiteStatusRow>(
        "select technical_status, technical_status_updated_at::text from sites where id = $1",
        [siteId]
      );

      return toSiteTechnicalStatusRecord(result.rows[0]!);
    },
    async updateSiteTechnicalStatus(input) {
      await ensureSiteExists(database, input.siteId);

      const result = await database.query<SiteStatusRow>(
        `
          update sites
          set
            technical_status = $2,
            technical_status_updated_at = coalesce($3::timestamptz, now())
          where id = $1
          returning technical_status, technical_status_updated_at::text
        `,
        [input.siteId, input.overallStatus, input.updatedAt ?? null]
      );

      return toSiteTechnicalStatusRecord(result.rows[0]!);
    },
    async listActiveCheckPlan() {
      const result = await database.query<CheckPlanRow>(
        `
          select
            t.id as target_id,
            t.scope as target_scope,
            t.site_id,
            s.site_name,
            coalesce(ss.monitoring_interval_seconds, gs.monitoring_interval_seconds) as monitoring_interval_seconds,
            coalesce(ss.failure_threshold, gs.failure_threshold) as failure_threshold,
            t.device_id,
            d.name as device_name,
            d.type as device_type,
            d.network_address as device_network_address,
            t.label as target_label,
            t.check_kind,
            t.endpoint,
            t.port,
            t.path,
            t.request_method,
            t.expected_status_codes,
            t.timeout_ms,
            t.requires_vpn,
            t.disturbance_type_id,
            t.is_active,
            t.sort_order,
            st.last_status as state_last_status,
            st.consecutive_failures as state_consecutive_failures,
            st.last_checked_at::text as state_last_checked_at,
            st.last_success_at::text as state_last_success_at,
            st.last_failure_at::text as state_last_failure_at,
            st.last_error as state_last_error,
            st.active_disturbance_id as state_active_disturbance_id
          from monitoring_check_targets t
          join sites s on s.id = t.site_id
          join site_settings ss on ss.site_id = s.id
          join global_settings gs on gs.id = 1
          left join devices d on d.id = t.device_id
          left join monitoring_check_states st on st.target_id = t.id
          where t.is_active = true
          order by t.site_id asc, t.sort_order asc, t.label asc
        `
      );

      return result.rows.map(toCheckPlanItem);
    },
    async upsertCheckState(input) {
      const result = await database.query<{
        target_id: string;
        last_status: MonitoringCheckStateStatus | null;
        consecutive_failures: number;
        last_checked_at: string | null;
        last_success_at: string | null;
        last_failure_at: string | null;
        last_error: string | null;
        active_disturbance_id: string | null;
      }>(
        `
          insert into monitoring_check_states(
            target_id, last_status, consecutive_failures, last_checked_at, last_success_at, last_failure_at, last_error, active_disturbance_id
          )
          values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::timestamptz, $7, $8)
          on conflict (target_id) do update set
            last_status = excluded.last_status,
            consecutive_failures = excluded.consecutive_failures,
            last_checked_at = excluded.last_checked_at,
            last_success_at = excluded.last_success_at,
            last_failure_at = excluded.last_failure_at,
            last_error = excluded.last_error,
            active_disturbance_id = excluded.active_disturbance_id,
            updated_at = now()
          returning
            target_id, last_status, consecutive_failures,
            last_checked_at::text, last_success_at::text, last_failure_at::text,
            last_error, active_disturbance_id
        `,
        [
          input.targetId,
          input.lastStatus,
          input.consecutiveFailures,
          input.lastCheckedAt,
          input.lastSuccessAt ?? null,
          input.lastFailureAt ?? null,
          normalizeOptional(input.lastError) ?? null,
          normalizeOptional(input.activeDisturbanceId) ?? null
        ]
      );

      return toCheckStateRecord(result.rows[0]!);
    },
    async clearCheckStateDisturbance(targetId) {
      await database.query(
        `
          update monitoring_check_states
          set
            active_disturbance_id = null,
            updated_at = now()
          where target_id = $1
        `,
        [targetId]
      );
    }
  };
}

function toDisturbanceRecord(row: DisturbanceRow): MonitoringDisturbanceRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    ...(row.check_target_id ? { checkTargetId: row.check_target_id } : {}),
    disturbanceTypeId: row.disturbance_type_id,
    disturbanceTypeCode: row.disturbance_type_code,
    disturbanceTypeLabel: row.disturbance_type_label,
    priority: row.priority,
    priorityRank: row.priority_rank,
    status: row.status,
    title: row.title,
    startedAt: row.started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.device_id ? { deviceId: row.device_id } : {}),
    ...(row.reference_label ? { referenceLabel: row.reference_label } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.comment ? { comment: row.comment } : {}),
    ...(row.owner_user_id ? { ownerUserId: row.owner_user_id } : {}),
    ...(row.ended_at ? { endedAt: row.ended_at } : {}),
    ...(row.duration_seconds ? { durationSeconds: Number(row.duration_seconds) } : {})
  };
}

function toMonitoringPipelineItem(row: PipelineRow): MonitoringPipelineItem {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    siteTechnicalStatus: row.site_technical_status,
    disturbanceTypeId: row.disturbance_type_id,
    disturbanceTypeCode: row.disturbance_type_code,
    disturbanceTypeLabel: row.disturbance_type_label,
    priority: row.priority,
    priorityRank: row.priority_rank,
    status: row.status,
    title: row.title,
    startedAt: row.started_at,
    durationSeconds: Number(row.duration_seconds ?? "0"),
    isCritical: row.priority === "critical",
    isOfflineRelated:
      row.site_technical_status === "offline" ||
      row.disturbance_type_code === "site_connection_disturbed" ||
      row.disturbance_type_code === "router_unreachable" ||
      row.disturbance_type_code === "nvr_unreachable" ||
      row.disturbance_type_code === "camera_unreachable",
    ...(row.device_id ? { deviceId: row.device_id } : {}),
    ...(row.device_name ? { deviceName: row.device_name } : {}),
    ...(row.reference_label ? { referenceLabel: row.reference_label } : {}),
    ...(row.check_target_id ? { checkTargetId: row.check_target_id } : {}),
    ...(row.check_target_label ? { checkTargetLabel: row.check_target_label } : {}),
    ...(row.latest_event_at ? { latestEventAt: row.latest_event_at } : {}),
    ...(row.last_note ? { lastNote: row.last_note } : {}),
    ...(row.service_case_id ? { serviceCaseId: row.service_case_id } : {}),
    ...(row.service_case_status ? { serviceCaseStatus: row.service_case_status } : {})
  };
}

function toMonitoringServiceCaseRecord(row: ServiceCaseRow): MonitoringServiceCaseRecord {
  return {
    id: row.id,
    disturbanceId: row.disturbance_id,
    siteId: row.site_id,
    status: row.status,
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    comment: row.comment,
    ...(row.device_id ? { deviceId: row.device_id } : {}),
    ...(row.reference_label ? { referenceLabel: row.reference_label } : {})
  };
}

function toMonitoringDisturbanceEventRecord(row: DisturbanceEventRow): MonitoringDisturbanceEventRecord {
  return {
    id: row.id,
    disturbanceId: row.disturbance_id,
    eventKind: row.event_kind,
    createdAt: row.created_at,
    ...(row.message ? { message: row.message } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(row.previous_status ? { previousStatus: row.previous_status } : {}),
    ...(row.status ? { status: row.status } : {}),
    ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
    ...(row.metadata && Object.keys(row.metadata).length > 0 ? { metadata: row.metadata } : {})
  };
}

function toCheckPlanItem(row: CheckPlanRow): MonitoringCheckPlanItem {
  return {
    target: {
      id: row.target_id,
      scope: row.target_scope,
      siteId: row.site_id,
      label: row.target_label,
      checkKind: row.check_kind,
      endpoint: row.endpoint,
      expectedStatusCodes: row.expected_status_codes,
      timeoutMs: row.timeout_ms,
      requiresVpn: row.requires_vpn,
      disturbanceTypeId: row.disturbance_type_id,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      ...(row.device_id ? { deviceId: row.device_id } : {}),
      ...(row.port !== null ? { port: row.port } : {}),
      ...(row.path ? { path: row.path } : {}),
      ...(row.request_method ? { requestMethod: row.request_method } : {})
    },
    site: {
      id: row.site_id,
      siteName: row.site_name,
      monitoringIntervalSeconds: row.monitoring_interval_seconds,
      failureThreshold: row.failure_threshold
    },
    ...(row.device_id && row.device_name && row.device_type
      ? {
          device: {
            id: row.device_id,
            name: row.device_name,
            type: row.device_type,
            ...(row.device_network_address ? { networkAddress: row.device_network_address } : {})
          }
        }
      : {}),
    ...(row.state_last_status !== null || row.state_consecutive_failures !== null || row.state_active_disturbance_id !== null
      ? {
          state: toCheckStateRecord({
            target_id: row.target_id,
            last_status: row.state_last_status,
            consecutive_failures: row.state_consecutive_failures ?? 0,
            last_checked_at: row.state_last_checked_at,
            last_success_at: row.state_last_success_at,
            last_failure_at: row.state_last_failure_at,
            last_error: row.state_last_error,
            active_disturbance_id: row.state_active_disturbance_id
          })
        }
      : {})
  };
}

function toCheckStateRecord(row: {
  target_id: string;
  last_status: MonitoringCheckStateStatus | null;
  consecutive_failures: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  active_disturbance_id: string | null;
}): MonitoringCheckStateRecord {
  return {
    targetId: row.target_id,
    consecutiveFailures: row.consecutive_failures,
    ...(row.last_status ? { lastStatus: row.last_status } : {}),
    ...(row.last_checked_at ? { lastCheckedAt: row.last_checked_at } : {}),
    ...(row.last_success_at ? { lastSuccessAt: row.last_success_at } : {}),
    ...(row.last_failure_at ? { lastFailureAt: row.last_failure_at } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(row.active_disturbance_id ? { activeDisturbanceId: row.active_disturbance_id } : {})
  };
}

function toSiteTechnicalStatusRecord(row: SiteStatusRow): SiteTechnicalStatusRecord {
  return {
    overallStatus: row.technical_status,
    updatedAt: row.technical_status_updated_at
  };
}

async function ensureSiteExists(database: DatabaseClient, siteId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from sites where id = $1", [siteId]);
  if (!result.rows[0]) {
    throw new AppError("Site not found.", {
      status: 404,
      code: "MASTER_SITE_NOT_FOUND"
    });
  }
}

async function ensureDeviceExists(database: DatabaseClient, deviceId: string): Promise<void> {
  const result = await database.query<{ id: string }>("select id from devices where id = $1", [deviceId]);
  if (!result.rows[0]) {
    throw new AppError("Device not found.", {
      status: 404,
      code: "MASTER_DEVICE_NOT_FOUND"
    });
  }
}

async function findDisturbanceType(database: DatabaseClient, disturbanceTypeId: string): Promise<MonitoringDisturbanceTypeCatalogEntry> {
  const result = await database.query<DisturbanceTypeRow>(
    `
      select id, code, label, description, default_priority, is_active, sort_order
      from monitoring_disturbance_types
      where id = $1
    `,
    [disturbanceTypeId]
  );
  const row = result.rows[0];

  if (!row || !row.is_active) {
    throw new AppError("Monitoring disturbance type not found.", {
      status: 404,
      code: "MONITORING_DISTURBANCE_TYPE_NOT_FOUND"
    });
  }

  return {
    id: row.id,
    code: row.code,
    label: row.label,
    defaultPriority: row.default_priority,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    ...(row.description ? { description: row.description } : {})
  };
}

function toPriorityRank(priority: MonitoringPriority): number {
  switch (priority) {
    case "critical":
      return 300;
    case "high":
      return 200;
    case "normal":
    default:
      return 100;
  }
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}