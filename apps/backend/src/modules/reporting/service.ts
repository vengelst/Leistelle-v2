import type {
  ReportingDurationMetric,
  ReportingFilter,
  ReportingGroupBucket,
  ReportingGroupDimension,
  ReportingOverview,
  ReportingPeriod,
  ReportingTimeRange
} from "@leitstelle/contracts";
import { AppError, type AuditTrail } from "@leitstelle/observability";

import type { DatabaseClient } from "../../db/client.js";
import type { IdentityService } from "../identity/types.js";

export type ReportingService = {
  getOverview: (token: string, filter: ReportingFilter, requestId: string) => Promise<ReportingOverview>;
};

type CreateReportingServiceInput = {
  identity: IdentityService;
  database: DatabaseClient;
  audit: AuditTrail;
};

type AlarmReportRow = {
  id: string;
  site_id: string;
  site_name: string;
  customer_id: string;
  customer_name: string;
  device_id: string | null;
  device_name: string | null;
  alarm_type: string;
  assessment_status: string;
  lifecycle_status: string;
  source_occurred_at: string | null;
  received_at: string;
  first_opened_at: string | null;
  resolved_at: string | null;
};

type AlarmActionRow = {
  alarm_case_id: string;
  action_type_code: string;
};

type DisturbanceReportRow = {
  id: string;
  site_id: string;
  site_name: string;
  customer_id: string;
  customer_name: string;
  device_id: string | null;
  device_name: string | null;
  disturbance_type_code: string;
  disturbance_type_label: string;
  priority: string;
  status: string;
  started_at: string;
  ended_at: string | null;
};

type GroupRow = {
  group_key: string | null;
  group_label: string | null;
  total: string;
};

export function createReportingService(input: CreateReportingServiceInput): ReportingService {
  return {
    async getOverview(token, filter, requestId) {
      const session = await input.identity.getSession(token);
      const range = resolveTimeRange(filter);
      const normalizedFilter = normalizeFilter(filter, range);

      const [alarmRows, disturbanceRows] = await Promise.all([
        loadAlarmRows(input.database, normalizedFilter, range),
        loadDisturbanceRows(input.database, normalizedFilter, range)
      ]);

      const alarmGroups = normalizedFilter.groupBy
        ? await loadAlarmGroups(input.database, normalizedFilter, range)
        : [];
      const disturbanceGroups = normalizedFilter.groupBy
        ? await loadDisturbanceGroups(input.database, normalizedFilter, range)
        : [];

      const alarmActionRows = alarmRows.length > 0
        ? await input.database.query<AlarmActionRow>(
            `
              select
                a.alarm_case_id,
                t.code as action_type_code
              from alarm_case_actions a
              join alarm_action_types t on t.id = a.action_type_id
              where a.alarm_case_id = any($1)
            `,
            [alarmRows.map((row) => row.id)]
          )
        : { rows: [] as AlarmActionRow[] };

      const nowIso = new Date().toISOString();
      const policeCalls = alarmActionRows.rows.filter((row) => row.action_type_code === "call_police").length;
      const securityServiceCalls = alarmActionRows.rows.filter((row) => row.action_type_code === "call_security_service").length;
      const customerContacts = alarmActionRows.rows.filter((row) => row.action_type_code === "call_customer").length;

      const overview: ReportingOverview = {
        filter: normalizedFilter,
        range,
        alarms: {
          counts: {
            totalAlarms: {
              value: alarmRows.length,
              label: "Alle Alarme",
              hint: "Alarmfaelle im ausgewaehlten Zeitraum."
            },
            confirmedIncidents: {
              value: alarmRows.filter((row) => row.assessment_status === "confirmed_incident").length,
              label: "Echtalarme"
            },
            falsePositives: {
              value: alarmRows.filter((row) => row.assessment_status === "false_positive").length,
              label: "Fehlalarme"
            },
            policeCalls: {
              value: policeCalls,
              label: "Polizeieinsaetze"
            },
            securityServiceCalls: {
              value: securityServiceCalls,
              label: "Sicherheitsdiensteinsaetze"
            },
            customerContacts: {
              value: customerContacts,
              label: "Kundenkontakte"
            }
          },
          durations: {
            timeToAcceptance: buildDurationMetric(
              "Zeit bis Alarmannahme",
              alarmRows
                .filter((row) => Boolean(row.source_occurred_at))
                .map((row) => secondsBetween(row.source_occurred_at!, row.received_at))
            ),
            timeToProcessingStart: buildDurationMetric(
              "Zeit bis Bearbeitungsbeginn",
              alarmRows
                .filter((row) => Boolean(row.first_opened_at))
                .map((row) => secondsBetween(row.received_at, row.first_opened_at!))
            ),
            timeToClosure: buildDurationMetric(
              "Zeit bis Abschluss",
              alarmRows
                .filter((row) => Boolean(row.resolved_at))
                .map((row) => secondsBetween(row.received_at, row.resolved_at!))
            ),
            openAlarmDuration: buildDurationMetric(
              "Dauer offener Alarme",
              alarmRows
                .filter((row) => ["received", "queued", "reserved", "in_progress"].includes(row.lifecycle_status))
                .map((row) => secondsBetween(row.received_at, nowIso)),
              true
            )
          },
          groups: alarmGroups
        },
        monitoring: {
          counts: {
            totalDisturbances: {
              value: disturbanceRows.length,
              label: "Technische Stoerungen"
            },
            openCriticalDisturbances: {
              value: disturbanceRows.filter((row) => row.priority === "critical" && row.status !== "resolved").length,
              label: "Offene kritische Stoerungen"
            }
          },
          durations: {
            openDisturbanceDuration: buildDurationMetric(
              "Dauer offener Stoerungen",
              disturbanceRows
                .filter((row) => row.status !== "resolved")
                .map((row) => secondsBetween(row.started_at, row.ended_at ?? nowIso)),
              true
            )
          },
          groups: disturbanceGroups
        }
      };

      await input.audit.record(
        {
          category: "reporting",
          action: "reporting.overview.read",
          outcome: "success",
          actorId: session.user.id,
          subjectId: session.user.id,
          metadata: {
            filter: normalizedFilter,
            range,
            alarmCount: alarmRows.length,
            disturbanceCount: disturbanceRows.length
          }
        },
        { requestId }
      );

      return overview;
    }
  };
}

function normalizeFilter(filter: ReportingFilter, range: ReportingTimeRange): ReportingFilter {
  return {
    period: range.period,
    ...(filter.dateFrom ? { dateFrom: filter.dateFrom } : {}),
    ...(filter.dateTo ? { dateTo: filter.dateTo } : {}),
    ...(filter.customerId ? { customerId: filter.customerId } : {}),
    ...(filter.siteId ? { siteId: filter.siteId } : {}),
    ...(filter.cameraId ? { cameraId: filter.cameraId } : {}),
    ...(filter.alarmType ? { alarmType: filter.alarmType } : {}),
    ...(filter.operatorUserId ? { operatorUserId: filter.operatorUserId } : {}),
    ...(filter.disturbanceType ? { disturbanceType: filter.disturbanceType } : {}),
    ...(filter.groupBy ? { groupBy: filter.groupBy } : {})
  };
}

function resolveTimeRange(filter: ReportingFilter): ReportingTimeRange {
  const now = new Date();
  const period = filter.period;

  if (period === "custom") {
    if (!filter.dateFrom || !filter.dateTo) {
      throw new AppError("Custom reporting ranges require dateFrom and dateTo.", {
        status: 400,
        code: "REPORTING_RANGE_REQUIRED"
      });
    }

    const from = parseDateBoundary(filter.dateFrom, "start");
    const to = parseDateBoundary(filter.dateTo, "end");
    if (from >= to) {
      throw new AppError("Reporting range is invalid.", {
        status: 400,
        code: "REPORTING_RANGE_INVALID",
        detail: "dateFrom must be earlier than dateTo."
      });
    }

    return {
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      label: `${from.toLocaleDateString("de-DE")} bis ${to.toLocaleDateString("de-DE")}`
    };
  }

  const end = now;
  const start = new Date(now);

  if (period === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    const weekday = start.getDay();
    const delta = weekday === 0 ? 6 : weekday - 1;
    start.setDate(start.getDate() - delta);
    start.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (period === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    throw new AppError("Reporting period is invalid.", {
      status: 400,
      code: "REPORTING_PERIOD_INVALID"
    });
  }

  return {
    period,
    from: start.toISOString(),
    to: end.toISOString(),
    label: `${start.toLocaleDateString("de-DE")} bis ${end.toLocaleDateString("de-DE")}`
  };
}

function parseDateBoundary(value: string, boundary: "start" | "end"): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
    return boundary === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("Reporting range contains an invalid date.", {
      status: 400,
      code: "REPORTING_RANGE_INVALID_DATE",
      detail: `${value} is not a valid date.`
    });
  }

  return parsed;
}

async function loadAlarmRows(database: DatabaseClient, filter: ReportingFilter, range: ReportingTimeRange): Promise<AlarmReportRow[]> {
  const clauses = ["a.received_at >= $1", "a.received_at <= $2"];
  const values: unknown[] = [range.from, range.to];
  let index = 3;

  if (filter.customerId) {
    clauses.push(`s.customer_id = $${index}`);
    values.push(filter.customerId);
    index += 1;
  }
  if (filter.siteId) {
    clauses.push(`a.site_id = $${index}`);
    values.push(filter.siteId);
    index += 1;
  }
  if (filter.cameraId) {
    clauses.push(`a.primary_device_id = $${index}`);
    values.push(filter.cameraId);
    index += 1;
  }
  if (filter.alarmType) {
    clauses.push(`a.alarm_type = $${index}`);
    values.push(filter.alarmType);
    index += 1;
  }
  if (filter.operatorUserId) {
    clauses.push(`
      (
        a.closed_by_user_id = $${index}
        or exists (select 1 from alarm_assignments aa where aa.alarm_case_id = a.id and aa.user_id = $${index})
        or exists (select 1 from alarm_case_actions ac where ac.alarm_case_id = a.id and ac.user_id = $${index})
        or exists (select 1 from alarm_case_comments cc where cc.alarm_case_id = a.id and cc.user_id = $${index})
      )
    `);
    values.push(filter.operatorUserId);
    index += 1;
  }

  const result = await database.query<AlarmReportRow>(
    `
      select
        a.id,
        a.site_id,
        s.site_name,
        c.id as customer_id,
        c.name as customer_name,
        a.primary_device_id as device_id,
        d.name as device_name,
        a.alarm_type,
        a.assessment_status,
        a.lifecycle_status,
        a.source_occurred_at,
        a.received_at,
        a.first_opened_at,
        a.resolved_at
      from alarm_cases a
      join sites s on s.id = a.site_id
      join customers c on c.id = s.customer_id
      left join devices d on d.id = a.primary_device_id
      where ${clauses.join(" and ")}
      order by a.received_at desc
    `,
    values
  );

  return result.rows;
}

async function loadDisturbanceRows(database: DatabaseClient, filter: ReportingFilter, range: ReportingTimeRange): Promise<DisturbanceReportRow[]> {
  const clauses = ["d.started_at >= $1", "d.started_at <= $2"];
  const values: unknown[] = [range.from, range.to];
  let index = 3;

  if (filter.customerId) {
    clauses.push(`s.customer_id = $${index}`);
    values.push(filter.customerId);
    index += 1;
  }
  if (filter.siteId) {
    clauses.push(`d.site_id = $${index}`);
    values.push(filter.siteId);
    index += 1;
  }
  if (filter.cameraId) {
    clauses.push(`d.device_id = $${index}`);
    values.push(filter.cameraId);
    index += 1;
  }
  if (filter.disturbanceType) {
    clauses.push(`dt.code = $${index}`);
    values.push(filter.disturbanceType);
    index += 1;
  }
  if (filter.operatorUserId) {
    clauses.push(`
      (
        d.owner_user_id = $${index}
        or exists (select 1 from monitoring_disturbance_events e where e.disturbance_id = d.id and e.actor_user_id = $${index})
        or exists (select 1 from monitoring_service_cases sc where sc.disturbance_id = d.id and sc.created_by_user_id = $${index})
      )
    `);
    values.push(filter.operatorUserId);
    index += 1;
  }

  const result = await database.query<DisturbanceReportRow>(
    `
      select
        d.id,
        d.site_id,
        s.site_name,
        c.id as customer_id,
        c.name as customer_name,
        d.device_id,
        dev.name as device_name,
        dt.code as disturbance_type_code,
        dt.label as disturbance_type_label,
        d.priority,
        d.status,
        d.started_at,
        d.ended_at
      from monitoring_disturbances d
      join sites s on s.id = d.site_id
      join customers c on c.id = s.customer_id
      join monitoring_disturbance_types dt on dt.id = d.disturbance_type_id
      left join devices dev on dev.id = d.device_id
      where ${clauses.join(" and ")}
      order by d.started_at desc
    `,
    values
  );

  return result.rows;
}

async function loadAlarmGroups(database: DatabaseClient, filter: ReportingFilter, range: ReportingTimeRange): Promise<ReportingGroupBucket[]> {
  const dimension = filter.groupBy;
  if (!dimension) {
    return [];
  }

  if (dimension === "disturbance_type") {
    return [];
  }

  if (dimension === "operator") {
    return await loadAlarmOperatorGroups(database, filter, range);
  }

  const grouping = resolveAlarmGrouping(dimension);
  const clauses = ["a.received_at >= $1", "a.received_at <= $2"];
  const values: unknown[] = [range.from, range.to];
  let index = 3;

  if (filter.customerId) {
    clauses.push(`s.customer_id = $${index}`);
    values.push(filter.customerId);
    index += 1;
  }
  if (filter.siteId) {
    clauses.push(`a.site_id = $${index}`);
    values.push(filter.siteId);
    index += 1;
  }
  if (filter.cameraId) {
    clauses.push(`a.primary_device_id = $${index}`);
    values.push(filter.cameraId);
    index += 1;
  }
  if (filter.alarmType) {
    clauses.push(`a.alarm_type = $${index}`);
    values.push(filter.alarmType);
    index += 1;
  }
  if (filter.operatorUserId) {
    clauses.push(`
      (
        a.closed_by_user_id = $${index}
        or exists (select 1 from alarm_assignments aa where aa.alarm_case_id = a.id and aa.user_id = $${index})
        or exists (select 1 from alarm_case_actions ac where ac.alarm_case_id = a.id and ac.user_id = $${index})
        or exists (select 1 from alarm_case_comments cc where cc.alarm_case_id = a.id and cc.user_id = $${index})
      )
    `);
    values.push(filter.operatorUserId);
    index += 1;
  }

  const result = await database.query<GroupRow>(
    `
      select
        ${grouping.keySql} as group_key,
        ${grouping.labelSql} as group_label,
        count(*)::text as total
      from alarm_cases a
      join sites s on s.id = a.site_id
      join customers c on c.id = s.customer_id
      left join devices d on d.id = a.primary_device_id
      where ${clauses.join(" and ")}
      group by 1, 2
      order by count(*) desc, 2 asc
      limit 20
    `,
    values
  );

  return toGroupBuckets(result.rows);
}

async function loadAlarmOperatorGroups(database: DatabaseClient, filter: ReportingFilter, range: ReportingTimeRange): Promise<ReportingGroupBucket[]> {
  const clauses = ["a.received_at >= $1", "a.received_at <= $2"];
  const values: unknown[] = [range.from, range.to];
  let index = 3;

  if (filter.customerId) {
    clauses.push(`s.customer_id = $${index}`);
    values.push(filter.customerId);
    index += 1;
  }
  if (filter.siteId) {
    clauses.push(`a.site_id = $${index}`);
    values.push(filter.siteId);
    index += 1;
  }
  if (filter.cameraId) {
    clauses.push(`a.primary_device_id = $${index}`);
    values.push(filter.cameraId);
    index += 1;
  }
  if (filter.alarmType) {
    clauses.push(`a.alarm_type = $${index}`);
    values.push(filter.alarmType);
    index += 1;
  }
  if (filter.operatorUserId) {
    clauses.push(`
      (
        a.closed_by_user_id = $${index}
        or exists (select 1 from alarm_assignments aa where aa.alarm_case_id = a.id and aa.user_id = $${index})
        or exists (select 1 from alarm_case_actions ac where ac.alarm_case_id = a.id and ac.user_id = $${index})
        or exists (select 1 from alarm_case_comments cc where cc.alarm_case_id = a.id and cc.user_id = $${index})
      )
    `);
    values.push(filter.operatorUserId);
    index += 1;
  }

  const result = await database.query<GroupRow>(
    `
      with filtered_cases as (
        select a.id
        from alarm_cases a
        join sites s on s.id = a.site_id
        where ${clauses.join(" and ")}
      ),
      operator_links as (
        select distinct fc.id as alarm_case_id, aa.user_id
        from filtered_cases fc
        join alarm_assignments aa on aa.alarm_case_id = fc.id
        union
        select distinct fc.id as alarm_case_id, ac.user_id
        from filtered_cases fc
        join alarm_case_actions ac on ac.alarm_case_id = fc.id
        union
        select distinct fc.id as alarm_case_id, cc.user_id
        from filtered_cases fc
        join alarm_case_comments cc on cc.alarm_case_id = fc.id
        union
        select distinct fc.id as alarm_case_id, a.closed_by_user_id as user_id
        from filtered_cases fc
        join alarm_cases a on a.id = fc.id
        where a.closed_by_user_id is not null
      )
      select
        u.id as group_key,
        u.display_name as group_label,
        count(distinct ol.alarm_case_id)::text as total
      from operator_links ol
      join users u on u.id = ol.user_id
      group by 1, 2
      order by count(distinct ol.alarm_case_id) desc, 2 asc
      limit 20
    `,
    values
  );

  return toGroupBuckets(result.rows);
}

async function loadDisturbanceGroups(database: DatabaseClient, filter: ReportingFilter, range: ReportingTimeRange): Promise<ReportingGroupBucket[]> {
  const dimension = filter.groupBy;
  if (!dimension) {
    return [];
  }

  if (dimension === "alarm_type") {
    return [];
  }

  if (dimension === "operator") {
    return await loadDisturbanceOperatorGroups(database, filter, range);
  }

  const grouping = resolveDisturbanceGrouping(dimension);
  const clauses = ["d.started_at >= $1", "d.started_at <= $2"];
  const values: unknown[] = [range.from, range.to];
  let index = 3;

  if (filter.customerId) {
    clauses.push(`s.customer_id = $${index}`);
    values.push(filter.customerId);
    index += 1;
  }
  if (filter.siteId) {
    clauses.push(`d.site_id = $${index}`);
    values.push(filter.siteId);
    index += 1;
  }
  if (filter.cameraId) {
    clauses.push(`d.device_id = $${index}`);
    values.push(filter.cameraId);
    index += 1;
  }
  if (filter.disturbanceType) {
    clauses.push(`dt.code = $${index}`);
    values.push(filter.disturbanceType);
    index += 1;
  }
  if (filter.operatorUserId) {
    clauses.push(`
      (
        d.owner_user_id = $${index}
        or exists (select 1 from monitoring_disturbance_events e where e.disturbance_id = d.id and e.actor_user_id = $${index})
        or exists (select 1 from monitoring_service_cases sc where sc.disturbance_id = d.id and sc.created_by_user_id = $${index})
      )
    `);
    values.push(filter.operatorUserId);
    index += 1;
  }

  const result = await database.query<GroupRow>(
    `
      select
        ${grouping.keySql} as group_key,
        ${grouping.labelSql} as group_label,
        count(*)::text as total
      from monitoring_disturbances d
      join sites s on s.id = d.site_id
      join customers c on c.id = s.customer_id
      join monitoring_disturbance_types dt on dt.id = d.disturbance_type_id
      left join devices dev on dev.id = d.device_id
      where ${clauses.join(" and ")}
      group by 1, 2
      order by count(*) desc, 2 asc
      limit 20
    `,
    values
  );

  return toGroupBuckets(result.rows);
}

async function loadDisturbanceOperatorGroups(database: DatabaseClient, filter: ReportingFilter, range: ReportingTimeRange): Promise<ReportingGroupBucket[]> {
  const clauses = ["d.started_at >= $1", "d.started_at <= $2"];
  const values: unknown[] = [range.from, range.to];
  let index = 3;

  if (filter.customerId) {
    clauses.push(`s.customer_id = $${index}`);
    values.push(filter.customerId);
    index += 1;
  }
  if (filter.siteId) {
    clauses.push(`d.site_id = $${index}`);
    values.push(filter.siteId);
    index += 1;
  }
  if (filter.cameraId) {
    clauses.push(`d.device_id = $${index}`);
    values.push(filter.cameraId);
    index += 1;
  }
  if (filter.disturbanceType) {
    clauses.push(`dt.code = $${index}`);
    values.push(filter.disturbanceType);
    index += 1;
  }
  if (filter.operatorUserId) {
    clauses.push(`
      (
        d.owner_user_id = $${index}
        or exists (select 1 from monitoring_disturbance_events e where e.disturbance_id = d.id and e.actor_user_id = $${index})
        or exists (select 1 from monitoring_service_cases sc where sc.disturbance_id = d.id and sc.created_by_user_id = $${index})
      )
    `);
    values.push(filter.operatorUserId);
    index += 1;
  }

  const result = await database.query<GroupRow>(
    `
      with filtered_disturbances as (
        select d.id
        from monitoring_disturbances d
        join sites s on s.id = d.site_id
        join monitoring_disturbance_types dt on dt.id = d.disturbance_type_id
        where ${clauses.join(" and ")}
      ),
      operator_links as (
        select distinct fd.id as disturbance_id, d.owner_user_id as user_id
        from filtered_disturbances fd
        join monitoring_disturbances d on d.id = fd.id
        where d.owner_user_id is not null
        union
        select distinct fd.id as disturbance_id, e.actor_user_id as user_id
        from filtered_disturbances fd
        join monitoring_disturbance_events e on e.disturbance_id = fd.id
        where e.actor_user_id is not null
        union
        select distinct fd.id as disturbance_id, sc.created_by_user_id as user_id
        from filtered_disturbances fd
        join monitoring_service_cases sc on sc.disturbance_id = fd.id
      )
      select
        u.id as group_key,
        u.display_name as group_label,
        count(distinct ol.disturbance_id)::text as total
      from operator_links ol
      join users u on u.id = ol.user_id
      group by 1, 2
      order by count(distinct ol.disturbance_id) desc, 2 asc
      limit 20
    `,
    values
  );

  return toGroupBuckets(result.rows);
}

function resolveAlarmGrouping(dimension: Exclude<ReportingGroupDimension, "operator" | "disturbance_type">) {
  switch (dimension) {
    case "customer":
      return { keySql: "c.id", labelSql: "c.name" };
    case "site":
      return { keySql: "s.id", labelSql: "s.site_name" };
    case "camera":
      return { keySql: "coalesce(d.id, 'unassigned')", labelSql: "coalesce(d.name, 'Ohne Kamera')" };
    case "alarm_type":
      return { keySql: "a.alarm_type", labelSql: "a.alarm_type" };
  }

  throw new AppError("Alarm reporting grouping is invalid.", {
    status: 400,
    code: "REPORTING_GROUP_INVALID"
  });
}

function resolveDisturbanceGrouping(dimension: Exclude<ReportingGroupDimension, "operator" | "alarm_type">) {
  switch (dimension) {
    case "customer":
      return { keySql: "c.id", labelSql: "c.name" };
    case "site":
      return { keySql: "s.id", labelSql: "s.site_name" };
    case "camera":
      return { keySql: "coalesce(dev.id, 'unassigned')", labelSql: "coalesce(dev.name, 'Ohne Kamera')" };
    case "disturbance_type":
      return { keySql: "dt.code", labelSql: "dt.label" };
  }

  throw new AppError("Monitoring reporting grouping is invalid.", {
    status: 400,
    code: "REPORTING_GROUP_INVALID"
  });
}

function toGroupBuckets(rows: GroupRow[]): ReportingGroupBucket[] {
  return rows.map((row) => ({
    key: row.group_key ?? "unknown",
    label: row.group_label ?? "Unbekannt",
    value: Number(row.total)
  }));
}

function buildDurationMetric(label: string, rawValues: number[], includeTotal = false): ReportingDurationMetric {
  const values = rawValues.filter((value) => Number.isFinite(value) && value >= 0);
  if (values.length === 0) {
    return { label, sampleCount: 0 };
  }

  const totalSeconds = Math.round(values.reduce((sum, value) => sum + value, 0));
  const base: ReportingDurationMetric = {
    label,
    averageSeconds: Math.round(totalSeconds / values.length),
    maximumSeconds: Math.round(Math.max(...values)),
    sampleCount: values.length
  };

  return includeTotal ? { ...base, totalSeconds } : base;
}

function secondsBetween(from: string, to: string): number {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
}
