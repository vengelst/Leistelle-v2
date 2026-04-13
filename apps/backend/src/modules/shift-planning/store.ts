import { randomUUID } from "node:crypto";

import { AppError } from "@leitstelle/observability";

import type { DatabaseClient } from "../../db/client.js";
import type { ShiftPlanEntity, ShiftPlanningStore, ShiftPlanningStoreOverview, ShiftPlanningUserEntity, ShiftStoreUpsertInput } from "./types.js";

const assignableRoleKeys = ["administrator", "leitstellenleiter", "operator"] as const;

type ShiftRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  handover_note: string | null;
  handover_noted_at: string | null;
  handover_noted_by_user_id: string | null;
  handover_noted_by_display_name: string | null;
  created_at: string;
  updated_at: string;
};

type ShiftAssignmentRow = {
  shift_id: string;
  user_id: string;
};

type PlanningUserRow = {
  id: string;
  display_name: string;
  primary_role: ShiftPlanningUserEntity["primaryRole"];
  roles: ShiftPlanningUserEntity["roles"];
  current_status: ShiftPlanningUserEntity["currentStatus"];
  current_pause_reason: string | null;
  last_status_change_at: string;
};

type ShiftConflictRow = {
  user_id: string;
  display_name: string;
  title: string;
  starts_at: string;
  ends_at: string;
};

type Queryable = Pick<DatabaseClient, "query">;

export function createShiftPlanningStore(database: DatabaseClient): ShiftPlanningStore {
  return {
    async getOverviewData(range, filter) {
      const shiftsResult = filter.userId
        ? await database.query<ShiftRow>(
            `
              select
                s.id,
                s.title,
                s.starts_at::text,
                s.ends_at::text,
                s.handover_note,
                s.handover_noted_at::text,
                s.handover_noted_by_user_id::text,
                author.display_name as handover_noted_by_display_name,
                s.created_at::text,
                s.updated_at::text
              from shift_plans s
              left join users author on author.id = s.handover_noted_by_user_id
              where s.starts_at <= $2
                and s.ends_at >= $1
                and exists (
                  select 1
                  from shift_plan_assignments spa
                  where spa.shift_id = s.id
                    and spa.user_id = $3
                )
              order by s.starts_at asc, s.title asc
            `,
            [range.from, range.to, filter.userId]
          )
        : await database.query<ShiftRow>(
            `
              select
                s.id,
                s.title,
                s.starts_at::text,
                s.ends_at::text,
                s.handover_note,
                s.handover_noted_at::text,
                s.handover_noted_by_user_id::text,
                author.display_name as handover_noted_by_display_name,
                s.created_at::text,
                s.updated_at::text
              from shift_plans s
              left join users author on author.id = s.handover_noted_by_user_id
              where s.starts_at <= $2
                and s.ends_at >= $1
              order by s.starts_at asc, s.title asc
            `,
            [range.from, range.to]
          );

      const shiftIds = shiftsResult.rows.map((row) => row.id);
      const assignmentRows = shiftIds.length > 0
        ? await database.query<ShiftAssignmentRow>(
            `
              select shift_id, user_id
              from shift_plan_assignments
              where shift_id = any($1)
              order by created_at asc
            `,
            [shiftIds]
          )
        : { rows: [] as ShiftAssignmentRow[] };

      const assignmentsByShiftId = new Map<string, string[]>();

      for (const row of assignmentRows.rows) {
        const current = assignmentsByShiftId.get(row.shift_id) ?? [];
        current.push(row.user_id);
        assignmentsByShiftId.set(row.shift_id, current);
      }

      return {
        shifts: shiftsResult.rows.map((row) => toShiftEntity(row, assignmentsByShiftId.get(row.id) ?? [])),
        assignableUsers: await loadAssignableUsers(database)
      } satisfies ShiftPlanningStoreOverview;
    },
    async upsertShift(input) {
      await database.withTransaction(async (client) => {
        const normalizedAssignmentUserIds = normalizeAssignmentUserIds(input.assignmentUserIds);
        validateTimeRange(input.startsAt, input.endsAt);

        if (normalizedAssignmentUserIds.length > 0) {
          await ensureAssignableUsers(client, normalizedAssignmentUserIds);
          await ensureNoOverlappingAssignments(client, input.id, normalizedAssignmentUserIds, input.startsAt, input.endsAt);
        }

        const shiftId = input.id ?? randomUUID();
        const existing = input.id
          ? await client.query<{
              id: string;
              handover_note: string | null;
              handover_noted_at: string | null;
              handover_noted_by_user_id: string | null;
            }>(
              `
                select id, handover_note, handover_noted_at::text, handover_noted_by_user_id::text
                from shift_plans
                where id = $1
              `,
              [input.id]
            )
          : { rows: [] as Array<{ id: string; handover_note: string | null; handover_noted_at: string | null; handover_noted_by_user_id: string | null }> };

        const current = existing.rows[0];
        const nextHandoverNote = normalizeOptional(input.handoverNote);
        const noteChanged = (current?.handover_note ?? null) !== (nextHandoverNote ?? null);
        const handoverNotedAt = noteChanged ? (nextHandoverNote ? new Date().toISOString() : null) : (current?.handover_noted_at ?? null);
        const handoverNotedByUserId = noteChanged ? (nextHandoverNote ? input.actorUserId : null) : (current?.handover_noted_by_user_id ?? null);

        if (current) {
          await client.query(
            `
              update shift_plans
              set
                title = $2,
                starts_at = $3,
                ends_at = $4,
                handover_note = $5,
                handover_noted_at = $6,
                handover_noted_by_user_id = $7,
                updated_by_user_id = $8,
                updated_at = now()
              where id = $1
            `,
            [
              shiftId,
              input.title.trim(),
              input.startsAt,
              input.endsAt,
              nextHandoverNote ?? null,
              handoverNotedAt,
              handoverNotedByUserId,
              input.actorUserId
            ]
          );
        } else {
          await client.query(
            `
              insert into shift_plans(
                id,
                title,
                starts_at,
                ends_at,
                handover_note,
                handover_noted_at,
                handover_noted_by_user_id,
                created_by_user_id,
                updated_by_user_id
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
            `,
            [
              shiftId,
              input.title.trim(),
              input.startsAt,
              input.endsAt,
              nextHandoverNote ?? null,
              nextHandoverNote ? new Date().toISOString() : null,
              nextHandoverNote ? input.actorUserId : null,
              input.actorUserId
            ]
          );
        }

        await client.query("delete from shift_plan_assignments where shift_id = $1", [shiftId]);
        for (const userId of normalizedAssignmentUserIds) {
          await client.query(
            `
              insert into shift_plan_assignments(id, shift_id, user_id)
              values ($1, $2, $3)
            `,
            [randomUUID(), shiftId, userId]
          );
        }
      });
    }
  };
}

function toShiftEntity(row: ShiftRow, assignmentUserIds: string[]): ShiftPlanEntity {
  const result: ShiftPlanEntity = {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    assignmentUserIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (row.handover_note) {
    result.handoverNote = row.handover_note;
  }
  if (row.handover_noted_at) {
    result.handoverNotedAt = row.handover_noted_at;
  }
  if (row.handover_noted_by_user_id) {
    result.handoverNotedByUserId = row.handover_noted_by_user_id;
  }
  if (row.handover_noted_by_display_name) {
    result.handoverNotedByDisplayName = row.handover_noted_by_display_name;
  }

  return result;
}

async function loadAssignableUsers(database: Queryable, userIds?: string[]): Promise<ShiftPlanningUserEntity[]> {
  const values: unknown[] = [assignableRoleKeys];
  const clauses = [
    `
      (
        u.primary_role = any($1)
        or exists (
          select 1
          from user_roles uf
          where uf.user_id = u.id
            and uf.role_key = any($1)
        )
      )
    `
  ];

  if (userIds && userIds.length > 0) {
    values.push(userIds);
    clauses.push(`u.id = any($2)`);
  }

  const result = await database.query<PlanningUserRow>(
    `
      select
        u.id,
        u.display_name,
        u.primary_role,
        array_remove(array_agg(ur.role_key order by ur.role_key), null) as roles,
        u.current_status,
        u.current_pause_reason,
        u.last_status_change_at::text
      from users u
      left join user_roles ur on ur.user_id = u.id
      where ${clauses.join(" and ")}
      group by u.id
      order by u.display_name asc
    `,
    values
  );

  return result.rows.map((row) => {
    const user: ShiftPlanningUserEntity = {
      id: row.id,
      displayName: row.display_name,
      primaryRole: row.primary_role,
      roles: row.roles,
      currentStatus: row.current_status,
      lastStatusChangeAt: row.last_status_change_at
    };

    if (row.current_pause_reason) {
      user.pauseReason = row.current_pause_reason;
    }

    return user;
  });
}

async function ensureAssignableUsers(client: { query: DatabaseClient["query"] }, userIds: string[]): Promise<void> {
  const users = await loadAssignableUsers({ query: client.query.bind(client) }, userIds);
  const foundIds = new Set(users.map((user) => user.id));
  const missingIds = userIds.filter((userId) => !foundIds.has(userId));

  if (missingIds.length > 0) {
    throw new AppError("Shift assignments reference unknown or unsupported users.", {
      status: 400,
      code: "SHIFT_PLANNING_USER_INVALID",
      detail: missingIds.join(", ")
    });
  }
}

async function ensureNoOverlappingAssignments(
  client: { query: DatabaseClient["query"] },
  shiftId: string | undefined,
  userIds: string[],
  startsAt: string,
  endsAt: string
): Promise<void> {
  const conflicts = await client.query<ShiftConflictRow>(
    `
      select
        spa.user_id,
        u.display_name,
        s.title,
        s.starts_at::text,
        s.ends_at::text
      from shift_plan_assignments spa
      join shift_plans s on s.id = spa.shift_id
      join users u on u.id = spa.user_id
      where spa.user_id = any($1)
        and ($2::text is null or s.id <> $2)
        and s.starts_at < $4
        and s.ends_at > $3
      order by u.display_name asc, s.starts_at asc
    `,
    [userIds, shiftId ?? null, startsAt, endsAt]
  );

  if (conflicts.rows.length > 0) {
    const conflict = conflicts.rows[0]!;
    throw new AppError("Shift assignment overlaps with an existing shift.", {
      status: 409,
      code: "SHIFT_PLANNING_OVERLAP",
      detail: `${conflict.display_name} ist bereits in ${conflict.title} (${conflict.starts_at} - ${conflict.ends_at}) eingeplant.`
    });
  }
}

function normalizeAssignmentUserIds(userIds: string[]): string[] {
  const normalized = userIds.map((userId) => userId.trim()).filter((userId) => userId.length > 0);
  if (new Set(normalized).size !== normalized.length) {
    throw new AppError("Shift assignments contain duplicate users.", {
      status: 400,
      code: "SHIFT_PLANNING_DUPLICATE_ASSIGNMENT"
    });
  }
  return normalized;
}

function validateTimeRange(startsAt: string, endsAt: string): void {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new AppError("Shift range is invalid.", {
      status: 400,
      code: "SHIFT_PLANNING_RANGE_INVALID"
    });
  }
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
