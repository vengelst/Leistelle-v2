import assert from "node:assert/strict";
import test from "node:test";

import { createAlarmAssignmentService } from "../modules/alarm-core/assignment-service.js";

test("auto assignment light reserves for first available active operator", async () => {
  const auditEvents: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const reserveCalls: Array<{ alarmCaseId: string; userId: string }> = [];
  const markedUsers: string[] = [];

  const service = createAlarmAssignmentService({
    identity: {
      listAutoAssignableOperators: async () => [
        createUser("user-operator-a", "aktiv"),
        createUser("user-operator-b", "aktiv")
      ],
      markAssignedToAlarm: async (userId: string) => {
        markedUsers.push(userId);
        return createUser(userId, "assigned_to_alarm");
      }
    } as any,
    store: {
      getCaseById: async () => ({
        id: "alarm-1",
        lifecycleStatus: "received"
      }),
      getActiveOwnerAssignment: async () => null,
      reserveCase: async (input: any) => {
        reserveCalls.push({ alarmCaseId: input.alarmCaseId, userId: input.userId });
        return input;
      },
      updateLifecycleStatus: async () => ({ id: "alarm-1", lifecycleStatus: "reserved" }),
      appendEvent: async () => undefined
    } as any,
    audit: {
      record: async (event: any) => {
        auditEvents.push(event);
      }
    } as any
  });

  const result = await service.tryAutoAssignLight("alarm-1", "req-1");

  assert.deepEqual(result, { assigned: true, targetUserId: "user-operator-a" });
  assert.deepEqual(reserveCalls, [{ alarmCaseId: "alarm-1", userId: "user-operator-a" }]);
  assert.deepEqual(markedUsers, ["user-operator-a"]);
  assert.equal(auditEvents.at(-1)?.action, "alarm.assignment.auto.reserve");
});

test("auto assignment light skips when no suitable operator is available", async () => {
  const auditEvents: Array<{ action: string; metadata?: Record<string, unknown> }> = [];

  const service = createAlarmAssignmentService({
    identity: {
      listAutoAssignableOperators: async () => []
    } as any,
    store: {
      getCaseById: async () => ({
        id: "alarm-1",
        lifecycleStatus: "received"
      }),
      getActiveOwnerAssignment: async () => null
    } as any,
    audit: {
      record: async (event: any) => {
        auditEvents.push(event);
      }
    } as any
  });

  const result = await service.tryAutoAssignLight("alarm-1", "req-2");

  assert.deepEqual(result, { assigned: false, reason: "no_available_operator" });
  assert.equal(auditEvents.at(-1)?.action, "alarm.assignment.auto.skipped");
  assert.equal(auditEvents.at(-1)?.metadata?.reason, "no_available_operator");
});

test("auto assignment light skips when case is already reserved", async () => {
  const auditEvents: Array<{ action: string; metadata?: Record<string, unknown> }> = [];

  const service = createAlarmAssignmentService({
    identity: {
      listAutoAssignableOperators: async () => [createUser("user-operator-a", "aktiv")]
    } as any,
    store: {
      getCaseById: async () => ({
        id: "alarm-1",
        lifecycleStatus: "reserved"
      }),
      getActiveOwnerAssignment: async () => ({
        userId: "user-existing",
        displayName: "Operator Bereits Belegt"
      })
    } as any,
    audit: {
      record: async (event: any) => {
        auditEvents.push(event);
      }
    } as any
  });

  const result = await service.tryAutoAssignLight("alarm-1", "req-3");

  assert.deepEqual(result, { assigned: false, reason: "already_reserved" });
  assert.equal(auditEvents.at(-1)?.action, "alarm.assignment.auto.skipped");
  assert.equal(auditEvents.at(-1)?.metadata?.reason, "already_reserved");
});

function createUser(userId: string, status: "aktiv" | "assigned_to_alarm") {
  return {
    id: userId,
    username: userId,
    email: `${userId}@example.test`,
    displayName: userId,
    primaryRole: "operator",
    roles: ["operator"],
    status,
    lastStatusChangeAt: "2026-04-10T12:00:00.000Z"
  };
}
