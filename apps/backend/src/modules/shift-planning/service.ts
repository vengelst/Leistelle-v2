/**
 * Enthaelt die Fachlogik fuer Planung, Besetzung und Auswertung von Schichten.
 */
import { AppError, type AuditTrail } from "@leitstelle/observability";
import type { ShiftAssignableUser, ShiftPlanningFilter, ShiftPlanningOverview, ShiftPlanningRange, ShiftPlanningState, ShiftRecord, ShiftUpsertInput, UserRole } from "@leitstelle/contracts";

import type { IdentityService } from "../identity/types.js";
import type { ShiftPlanningStore } from "./types.js";

export type ShiftPlanningService = {
  getOverview: (token: string, filter: ShiftPlanningFilter, requestId: string) => Promise<ShiftPlanningOverview>;
  upsertShift: (token: string, input: ShiftUpsertInput, requestId: string) => Promise<ShiftPlanningOverview>;
};

type CreateShiftPlanningServiceInput = {
  identity: IdentityService;
  store: ShiftPlanningStore;
  audit: AuditTrail;
};

const editorRoles: UserRole[] = ["administrator", "leitstellenleiter"];

export function createShiftPlanningService(input: CreateShiftPlanningServiceInput): ShiftPlanningService {
  async function getOverview(token: string, filter: ShiftPlanningFilter, requestId: string): Promise<ShiftPlanningOverview> {
    const range = resolveTimeRange(filter);
    const normalizedFilter = normalizeFilter(filter, range);
    const [session, activeOperators, storeOverview] = await Promise.all([
      input.identity.getSession(token),
      input.identity.listActiveOperators(token),
      input.store.getOverviewData(range, normalizedFilter)
    ]);

    const activeOperatorIds = new Set(activeOperators.map((user) => user.id));
    const assignableUsers = storeOverview.assignableUsers.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      primaryRole: user.primaryRole,
      roles: [...user.roles],
      presence: {
        currentStatus: user.currentStatus,
        hasActiveSession: activeOperatorIds.has(user.id),
        lastStatusChangeAt: user.lastStatusChangeAt,
        ...(user.pauseReason ? { pauseReason: user.pauseReason } : {})
      }
    } satisfies ShiftAssignableUser));
    const userById = new Map(assignableUsers.map((user) => [user.id, user] as const));

    const shifts = storeOverview.shifts
      .map((shift) => {
        const planningState = resolvePlanningState(shift.startsAt, shift.endsAt);
        const shiftRecord: ShiftRecord = {
          id: shift.id,
          title: shift.title,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          planningState,
          assignments: shift.assignmentUserIds
            .map((userId) => userById.get(userId))
            .filter((assignment): assignment is ShiftAssignableUser => Boolean(assignment))
            .map((assignment) => ({
              userId: assignment.id,
              displayName: assignment.displayName,
              primaryRole: assignment.primaryRole,
              roles: [...assignment.roles],
              presence: assignment.presence
            })),
          createdAt: shift.createdAt,
          updatedAt: shift.updatedAt
        };

        if (shift.handoverNote) {
          shiftRecord.handoverNote = shift.handoverNote;
        }
        if (shift.handoverNotedAt) {
          shiftRecord.handoverNotedAt = shift.handoverNotedAt;
        }
        if (shift.handoverNotedByUserId) {
          shiftRecord.handoverNotedByUserId = shift.handoverNotedByUserId;
        }
        if (shift.handoverNotedByDisplayName) {
          shiftRecord.handoverNotedByDisplayName = shift.handoverNotedByDisplayName;
        }

        return shiftRecord;
      })
      .filter((shift) => !normalizedFilter.planningState || shift.planningState === normalizedFilter.planningState);

    await input.audit.record(
      {
        category: "shift-planning",
        action: "shift-planning.overview.read",
        outcome: "success",
        actorId: session.user.id,
        subjectId: session.user.id,
        metadata: {
          filter: normalizedFilter,
          shiftCount: shifts.length
        }
      },
      { requestId }
    );

    return {
      filter: normalizedFilter,
      range,
      summary: {
        plannedShifts: shifts.filter((shift) => shift.planningState === "planned").length,
        runningShifts: shifts.filter((shift) => shift.planningState === "running").length,
        completedShifts: shifts.filter((shift) => shift.planningState === "completed").length,
        staffedAssignments: shifts.reduce((total, shift) => total + shift.assignments.length, 0),
        unstaffedShifts: shifts.filter((shift) => shift.assignments.length === 0).length
      },
      assignableUsers,
      shifts
    };
  }

  return {
    getOverview,
    async upsertShift(token, shiftInput, requestId) {
      const session = await requireEditor(input.identity, token);
      await input.store.upsertShift({
        ...(shiftInput.id ? { id: shiftInput.id } : {}),
        title: shiftInput.title,
        startsAt: shiftInput.startsAt,
        endsAt: shiftInput.endsAt,
        assignmentUserIds: shiftInput.assignmentUserIds ?? [],
        ...(shiftInput.handoverNote ? { handoverNote: shiftInput.handoverNote } : {}),
        actorUserId: session.user.id
      });

      await input.audit.record(
        {
          category: "shift-planning",
          action: "shift-planning.shift.upsert",
          outcome: "success",
          actorId: session.user.id,
          subjectId: shiftInput.id ?? session.user.id,
          metadata: {
            shiftId: shiftInput.id ?? null,
            assignmentCount: shiftInput.assignmentUserIds?.length ?? 0
          }
        },
        { requestId }
      );

      return await getOverview(token, { period: "week" }, requestId);
    }
  };
}

async function requireEditor(identity: IdentityService, token: string) {
  const session = await identity.getSession(token);
  if (!session.user.roles.some((role) => editorRoles.includes(role))) {
    throw new AppError("Insufficient role for shift-planning changes.", {
      status: 403,
      code: "SHIFT_PLANNING_FORBIDDEN"
    });
  }
  return session;
}

function resolvePlanningState(startsAt: string, endsAt: string): ShiftPlanningState {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now < start) {
    return "planned";
  }
  if (now > end) {
    return "completed";
  }
  return "running";
}

function normalizeFilter(filter: ShiftPlanningFilter, range: ShiftPlanningRange): ShiftPlanningFilter {
  return {
    period: range.period,
    ...(filter.dateFrom ? { dateFrom: filter.dateFrom } : {}),
    ...(filter.dateTo ? { dateTo: filter.dateTo } : {}),
    ...(filter.planningState ? { planningState: filter.planningState } : {}),
    ...(filter.userId ? { userId: filter.userId } : {})
  };
}

function resolveTimeRange(filter: ShiftPlanningFilter): ShiftPlanningRange {
  const now = new Date();
  const period = filter.period;

  if (period === "custom") {
    if (!filter.dateFrom || !filter.dateTo) {
      throw new AppError("Custom shift ranges require dateFrom and dateTo.", {
        status: 400,
        code: "SHIFT_PLANNING_RANGE_REQUIRED"
      });
    }
    const from = parseDateBoundary(filter.dateFrom, "start");
    const to = parseDateBoundary(filter.dateTo, "end");
    if (from >= to) {
      throw new AppError("Shift planning range is invalid.", {
        status: 400,
        code: "SHIFT_PLANNING_RANGE_INVALID"
      });
    }
    return {
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      label: `${from.toLocaleDateString("de-DE")} bis ${to.toLocaleDateString("de-DE")}`
    };
  }

  const end = new Date(now);
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
    throw new AppError("Shift planning period is invalid.", {
      status: 400,
      code: "SHIFT_PLANNING_PERIOD_INVALID"
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
    throw new AppError("Shift planning range contains an invalid date.", {
      status: 400,
      code: "SHIFT_PLANNING_RANGE_INVALID"
    });
  }
  return parsed;
}