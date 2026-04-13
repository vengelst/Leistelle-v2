import type {
  AlarmAssignmentActionResult,
  AlarmReleaseInput,
  AlarmReservationInput,
  UserRole
} from "@leitstelle/contracts";
import { AppError, type AuditTrail } from "@leitstelle/observability";

import type { IdentityService } from "../identity/types.js";
import type { AlarmCoreStore } from "./types.js";

export type AlarmAssignmentService = {
  reserve: (token: string, alarmCaseId: string, input: AlarmReservationInput, requestId: string) => Promise<AlarmAssignmentActionResult>;
  release: (token: string, alarmCaseId: string, input: AlarmReleaseInput, requestId: string) => Promise<AlarmAssignmentActionResult>;
  reassign: (token: string, alarmCaseId: string, input: AlarmReservationInput, requestId: string) => Promise<AlarmAssignmentActionResult>;
  tryAutoAssignLight: (alarmCaseId: string, requestId: string) => Promise<{ assigned: boolean; targetUserId?: string; reason?: string }>;
};

type CreateAlarmAssignmentServiceInput = {
  identity: IdentityService;
  store: AlarmCoreStore;
  audit: AuditTrail;
};

const operatorRoles: UserRole[] = ["administrator", "leitstellenleiter", "operator"];
const overrideRoles: UserRole[] = ["administrator", "leitstellenleiter"];

export function createAlarmAssignmentService(input: CreateAlarmAssignmentServiceInput): AlarmAssignmentService {
  return {
    async reserve(token, alarmCaseId, reservation, requestId) {
      const session = await requireAssignableUser(input.identity, token);
      await requireAssignableCase(input.store, alarmCaseId);
      const targetUserId = reservation.targetUserId ?? session.user.id;
      const targetUser = await requireAssignableTarget(input.identity, targetUserId);
      const current = await input.store.getActiveOwnerAssignment(alarmCaseId);
      const canOverride = reservation.override === true && hasAnyRole(session.user.roles, overrideRoles);

      if (current && current.userId !== targetUserId) {
        if (!canOverride && current.userId !== session.user.id) {
          throw new AppError("Alarm is already reserved.", {
            status: 409,
            code: "ALARM_ALREADY_RESERVED",
            detail: `Reserved by ${current.displayName}.`
          });
        }

        await releaseCurrentAssignment(input, alarmCaseId, requestId, reservation.reason ?? "override_reassign");
      }

      if (current && current.userId === targetUserId) {
        return {
          alarmCase: (await input.store.getCaseById(alarmCaseId))!,
          assignment: current
        };
      }

      const assignedAt = new Date().toISOString();
      const assignment = await input.store.reserveCase({
        alarmCaseId,
        userId: targetUser.id,
        assignmentKind: "owner",
        assignmentStatus: "active",
        assignedAt
      });
      const alarmCase = await input.store.updateLifecycleStatus(alarmCaseId, "reserved", assignedAt);
      await input.store.appendEvent({
        alarmCaseId,
        eventKind: "assignment_changed",
        actorUserId: session.user.id,
        message: targetUser.id === session.user.id ? "Alarm reserved by operator." : "Alarm assigned to another operator.",
        payload: {
          action: "reserve",
          targetUserId: targetUser.id,
          override: canOverride
        }
      });
      await input.identity.markAssignedToAlarm(targetUser.id);
      await input.audit.record(
        {
          category: "alarm.assignment",
          action: canOverride ? "alarm.assignment.override.reserve" : "alarm.assignment.reserve",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId,
          metadata: {
            targetUserId: targetUser.id,
            override: canOverride
          }
        },
        { requestId }
      );

      return {
        alarmCase,
        assignment
      };
    },
    async release(token, alarmCaseId, releaseInput, requestId) {
      const session = await requireAssignableUser(input.identity, token);
      await requireAssignableCase(input.store, alarmCaseId);
      const current = await input.store.getActiveOwnerAssignment(alarmCaseId);

      if (!current) {
        throw new AppError("Alarm is not currently reserved.", {
          status: 409,
          code: "ALARM_NOT_RESERVED"
        });
      }

      const canOverride = releaseInput.override === true && hasAnyRole(session.user.roles, overrideRoles);
      if (current.userId !== session.user.id && !canOverride) {
        throw new AppError("Only the reserving operator or override roles can release this alarm.", {
          status: 403,
          code: "ALARM_RELEASE_FORBIDDEN"
        });
      }

      const released = await releaseCurrentAssignment(input, alarmCaseId, requestId, releaseInput.reason ?? "manual_release", session.user.id);
      const alarmCase = await input.store.updateLifecycleStatus(alarmCaseId, "queued");

      return released?.id
        ? {
            alarmCase,
            releasedAssignmentId: released.id
          }
        : {
            alarmCase
          };
    },
    async reassign(token, alarmCaseId, reservation, requestId) {
      const session = await requireAssignableUser(input.identity, token);
      await requireAssignableCase(input.store, alarmCaseId);
      const current = await input.store.getActiveOwnerAssignment(alarmCaseId);
      const targetUserId = reservation.targetUserId;

      if (!targetUserId) {
        throw new AppError("targetUserId is required for reassign.", {
          status: 400,
          code: "ALARM_REASSIGN_TARGET_REQUIRED"
        });
      }

      const targetUser = await requireAssignableTarget(input.identity, targetUserId);
      const canOverride = hasAnyRole(session.user.roles, overrideRoles);

      if (!current) {
        throw new AppError("Alarm must be reserved before it can be reassigned.", {
          status: 409,
          code: "ALARM_REASSIGN_REQUIRES_RESERVATION"
        });
      }

      if (current.userId !== session.user.id && !canOverride) {
        throw new AppError("Only the reserving operator or override roles can reassign this alarm.", {
          status: 403,
          code: "ALARM_REASSIGN_FORBIDDEN"
        });
      }

      const released = await releaseCurrentAssignment(input, alarmCaseId, requestId, reservation.reason ?? "manual_reassign", session.user.id);
      const assignedAt = new Date().toISOString();
      const assignment = await input.store.reserveCase({
        alarmCaseId,
        userId: targetUser.id,
        assignmentKind: "owner",
        assignmentStatus: "active",
        assignedAt
      });
      const alarmCase = await input.store.updateLifecycleStatus(alarmCaseId, "reserved", assignedAt);
      await input.store.appendEvent({
        alarmCaseId,
        eventKind: "assignment_changed",
        actorUserId: session.user.id,
        message: "Alarm reassigned to another operator.",
        payload: {
          action: "reassign",
          fromUserId: current.userId,
          targetUserId: targetUser.id,
          override: canOverride
        }
      });
      await input.identity.markAssignedToAlarm(targetUser.id);
      await input.audit.record(
        {
          category: "alarm.assignment",
          action: canOverride ? "alarm.assignment.override.reassign" : "alarm.assignment.reassign",
          outcome: "success",
          actorId: session.user.id,
          subjectId: alarmCaseId,
          metadata: {
            fromUserId: current.userId,
            targetUserId: targetUser.id
          }
        },
        { requestId }
      );

      return released?.id
        ? {
            alarmCase,
            assignment,
            releasedAssignmentId: released.id
          }
        : {
            alarmCase,
            assignment
          };
    },
    async tryAutoAssignLight(alarmCaseId, requestId) {
      await requireAssignableCase(input.store, alarmCaseId);
      const current = await input.store.getActiveOwnerAssignment(alarmCaseId);
      if (current) {
        await input.audit.record(
          {
            category: "alarm.assignment",
            action: "alarm.assignment.auto.skipped",
            outcome: "success",
            subjectId: alarmCaseId,
            metadata: {
              reason: "already_reserved",
              currentUserId: current.userId
            }
          },
          { requestId }
        );
        return { assigned: false, reason: "already_reserved" };
      }

      const candidates = await input.identity.listAutoAssignableOperators();
      const targetUser = candidates[0];
      if (!targetUser) {
        await input.audit.record(
          {
            category: "alarm.assignment",
            action: "alarm.assignment.auto.skipped",
            outcome: "success",
            subjectId: alarmCaseId,
            metadata: {
              reason: "no_available_operator"
            }
          },
          { requestId }
        );
        return { assigned: false, reason: "no_available_operator" };
      }

      const assignedAt = new Date().toISOString();
      const assignment = await input.store.reserveCase({
        alarmCaseId,
        userId: targetUser.id,
        assignmentKind: "owner",
        assignmentStatus: "active",
        assignedAt
      });
      await input.store.updateLifecycleStatus(alarmCaseId, "reserved", assignedAt);
      await input.store.appendEvent({
        alarmCaseId,
        eventKind: "assignment_changed",
        message: "Alarm automatically assigned to next available operator.",
        payload: {
          action: "reserve",
          targetUserId: targetUser.id,
          trigger: "auto_assignment_light"
        }
      });
      await input.identity.markAssignedToAlarm(targetUser.id);
      await input.audit.record(
        {
          category: "alarm.assignment",
          action: "alarm.assignment.auto.reserve",
          outcome: "success",
          subjectId: alarmCaseId,
          metadata: {
            targetUserId: targetUser.id,
            trigger: "auto_assignment_light"
          }
        },
        { requestId }
      );

      return {
        assigned: true,
        targetUserId: targetUser.id
      };
    }
  };
}

async function requireAssignableUser(identity: IdentityService, token: string) {
  const session = await identity.getSession(token);

  if (!hasAnyRole(session.user.roles, operatorRoles)) {
    throw new AppError("User is not allowed to reserve alarms.", {
      status: 403,
      code: "ALARM_ASSIGNMENT_FORBIDDEN"
    });
  }

  if (session.user.status === "offline" || session.user.status === "in_pause") {
    throw new AppError("User is not currently available for alarm reservation.", {
      status: 409,
      code: "ALARM_ASSIGNMENT_USER_UNAVAILABLE"
    });
  }

  return session;
}

async function requireAssignableTarget(identity: IdentityService, userId: string) {
  const user = await identity.getUserById(userId);

  if (!hasAnyRole(user.roles, operatorRoles)) {
    throw new AppError("Target user cannot receive alarm assignments.", {
      status: 409,
      code: "ALARM_ASSIGNMENT_TARGET_INVALID"
    });
  }

  if (user.status === "offline" || user.status === "in_pause") {
    throw new AppError("Target user is not currently available.", {
      status: 409,
      code: "ALARM_ASSIGNMENT_TARGET_UNAVAILABLE"
    });
  }

  return user;
}

async function releaseCurrentAssignment(
  input: CreateAlarmAssignmentServiceInput,
  alarmCaseId: string,
  requestId: string,
  reason: string,
  actorUserId?: string
) {
  const releasedAt = new Date().toISOString();
  const released = await input.store.releaseAssignment(alarmCaseId, releasedAt, reason);

  if (released) {
    if ((await input.store.countActiveAssignmentsForUser(released.userId)) === 0) {
      await input.identity.restoreFromAlarmAssignment(released.userId);
    }

    await input.store.appendEvent({
      alarmCaseId,
      eventKind: "assignment_changed",
      ...(actorUserId ? { actorUserId } : {}),
      message: "Alarm reservation released.",
      payload: {
        action: "release",
        releasedUserId: released.userId,
        reason
      }
    });
    await input.audit.record(
      {
        category: "alarm.assignment",
        action: "alarm.assignment.release",
        outcome: "success",
        ...(actorUserId ? { actorId: actorUserId } : {}),
        subjectId: alarmCaseId,
        metadata: {
          releasedUserId: released.userId,
          reason
        }
      },
      { requestId }
    );
  }

  return released;
}

function hasAnyRole(userRoles: UserRole[], allowedRoles: readonly UserRole[]): boolean {
  return userRoles.some((role) => allowedRoles.includes(role));
}

async function requireAssignableCase(store: AlarmCoreStore, alarmCaseId: string) {
  const alarmCase = await store.getCaseById(alarmCaseId);
  if (!alarmCase) {
    throw new AppError("Alarm case not found.", {
      status: 404,
      code: "ALARM_CASE_NOT_FOUND"
    });
  }

  if (alarmCase.lifecycleStatus === "archived") {
    throw new AppError("Archived alarm cases are read-only.", {
      status: 409,
      code: "ALARM_CASE_ARCHIVED"
    });
  }

  if (alarmCase.lifecycleStatus === "resolved") {
    throw new AppError("Resolved alarm cases can no longer be reserved.", {
      status: 409,
      code: "ALARM_CASE_NOT_OPEN"
    });
  }
}
