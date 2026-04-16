/**
 * Verifiziert Routing, Darstellung und Datenfluesse des Wallboard-Modus.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createDashboardHandlers } from "../actions/dashboard-handlers.js";
import { createShiftPlanningHandlers } from "../actions/shift-planning-handlers.js";
import { resolveWorkspaceNavigation, serializeWorkspaceNavigation } from "../navigation/routes.js";
import { resetSessionScopedState, state } from "../state.js";
import { renderOperatorWorkspace } from "../views/operator.js";

test("leitstelle wallboard route resolves and serializes canonically", () => {
  assert.deepEqual(resolveWorkspaceNavigation("#leitstelle/wallboard"), {
    workspace: "leitstelle",
    leitstelleMode: "wallboard"
  });
  assert.equal(
    serializeWorkspaceNavigation({ workspace: "leitstelle", leitstelleMode: "wallboard" }),
    "#leitstelle/wallboard"
  );
});

test("wallboard renders core overview blocks and robust empty states", () => {
  resetSessionScopedState();
  state.session = createSession();
  state.leitstelleMode = "wallboard";

  const markup = renderOperatorWorkspace();
  assert.match(markup, /Wallboard/);
  assert.match(markup, /Alarmlage/);
  assert.match(markup, /Stoerungslage/);
  assert.match(markup, /Keine offenen Alarme/);
  assert.match(markup, /Keine offenen Stoerungen/);
  assert.match(markup, /Keine aktiven Operatoren/);
  assert.match(markup, /Keine laufenden oder geplanten Schichten/);
});

test("wallboard renders existing alarms disturbances operators and shifts read-only", () => {
  resetSessionScopedState();
  state.session = createSession();
  state.leitstelleMode = "wallboard";
  state.openAlarms = [{
    id: "alarm-1",
    siteId: "site-1",
    alarmType: "motion",
    priority: "high",
    priorityRank: 3,
    lifecycleStatus: "received",
    assessmentStatus: "pending",
    technicalState: "complete",
    title: "Zaunalarm Nord",
    receivedAt: "2026-04-10T12:00:00.000Z",
    lastEventAt: "2026-04-10T12:00:00.000Z",
    createdAt: "2026-04-10T12:00:00.000Z",
    updatedAt: "2026-04-10T12:00:00.000Z",
    customerName: "Testkunde",
    siteName: "Standort Nord",
    mediaCount: 2,
    eventCount: 3,
    hasTechnicalIssue: false
  } as any];
  state.openDisturbances = [{
    id: "dist-1",
    siteId: "site-1",
    siteName: "Standort Nord",
    customerId: "customer-1",
    customerName: "Testkunde",
    siteTechnicalStatus: "disturbed",
    disturbanceTypeId: "type-1",
    disturbanceTypeCode: "technical_alarm",
    disturbanceTypeLabel: "Technischer Alarm",
    priority: "critical",
    priorityRank: 4,
    status: "open",
    title: "NVR stoerung",
    startedAt: "2026-04-10T11:45:00.000Z",
    durationSeconds: 900,
    isCritical: true,
    isOfflineRelated: false
  } as any];
  state.dashboard = {
    metrics: {
      openAlarms: { label: "Offene Alarme", value: 1 },
      openDisturbances: { label: "Offene Stoerungen", value: 1 },
      todaysFalsePositives: { label: "Fehlalarme heute", value: 0 },
      criticalSites: { label: "Kritische Standorte", value: 1 },
      activeOperators: { label: "Aktive Operatoren", value: 1 }
    },
    highlights: {
      alarms: [],
      disturbances: [],
      criticalSites: [{
        siteId: "site-1",
        siteName: "Standort Nord",
        customerName: "Testkunde",
        siteTechnicalStatus: "disturbed",
        openAlarmCount: 1,
        openDisturbanceCount: 1
      }],
      activeOperators: [{
        id: "user-1",
        displayName: "Operator Standard",
        status: "aktiv",
        primaryRole: "operator",
        lastStatusChangeAt: "2026-04-10T11:30:00.000Z"
      }]
    }
  };
  state.shiftPlanning = {
    filter: { period: "week" },
    range: {
      label: "KW 15",
      period: "week",
      from: "2026-04-07T00:00:00.000Z",
      to: "2026-04-13T23:59:59.000Z"
    },
    summary: {
      plannedShifts: 1,
      runningShifts: 1,
      completedShifts: 0,
      staffedAssignments: 1,
      unstaffedShifts: 0
    },
    assignableUsers: [],
    shifts: [{
      id: "shift-1",
      title: "Fruehschicht Leitstelle",
      startsAt: "2026-04-10T06:00:00.000Z",
      endsAt: "2026-04-10T14:00:00.000Z",
      planningState: "running",
      assignments: [{
        userId: "user-1",
        displayName: "Operator Standard",
        primaryRole: "operator",
        roles: ["operator"],
        presence: {
          hasActiveSession: true,
          currentStatus: "aktiv",
          lastStatusChangeAt: "2026-04-10T11:30:00.000Z"
        }
      }],
      handoverNote: "Uebergabe am Funkplatz.",
      createdAt: "2026-04-10T05:00:00.000Z",
      updatedAt: "2026-04-10T05:30:00.000Z"
    }]
  };

  const markup = renderOperatorWorkspace();
  assert.match(markup, /Zaunalarm Nord/);
  assert.match(markup, /NVR stoerung/);
  assert.match(markup, /Standort Nord/);
  assert.match(markup, /Operator Standard/);
  assert.match(markup, /Fruehschicht Leitstelle/);
  assert.doesNotMatch(markup, /Bearbeiten/);
});

test("dashboard poll keeps wallboard metrics quiet until data changes", async () => {
  resetSessionScopedState();
  state.dashboard = {
    metrics: {
      openAlarms: { label: "Offene Alarme", value: 1 },
      openDisturbances: { label: "Offene Stoerungen", value: 2 },
      todaysFalsePositives: { label: "Fehlalarme heute", value: 0 },
      criticalSites: { label: "Kritische Standorte", value: 1 },
      activeOperators: { label: "Aktive Operatoren", value: 1 }
    },
    highlights: {
      alarms: [],
      disturbances: [],
      criticalSites: [],
      activeOperators: []
    }
  };

  const handlers = createDashboardHandlers(createRuntimeStub());
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = (globalThis as any).localStorage;
  let responseIndex = 0;
  globalThis.fetch = (async () => {
    responseIndex += 1;
    return okResponse({
      overview: responseIndex === 1
        ? state.dashboard
        : {
            ...state.dashboard!,
            metrics: {
              ...state.dashboard!.metrics,
              openAlarms: { label: "Offene Alarme", value: 3 }
            }
          }
    });
  }) as typeof fetch;
  (globalThis as any).localStorage = { getItem: () => "token-1" };

  try {
    assert.equal(await handlers.pollDashboard(), false);
    assert.equal(state.dashboard?.metrics.openAlarms.value, 1);
    assert.equal(await handlers.pollDashboard(), true);
    assert.equal(state.dashboard?.metrics.openAlarms.value, 3);
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as any).localStorage = previousLocalStorage;
  }
});

test("shift planning poll keeps wallboard staffing quiet until data changes", async () => {
  resetSessionScopedState();
  state.shiftPlanningFilter = { period: "week" };
  state.shiftPlanning = {
    filter: { period: "week" },
    range: {
      label: "KW 15",
      period: "week",
      from: "2026-04-07T00:00:00.000Z",
      to: "2026-04-13T23:59:59.000Z"
    },
    summary: {
      plannedShifts: 1,
      runningShifts: 0,
      completedShifts: 0,
      staffedAssignments: 1,
      unstaffedShifts: 0
    },
    assignableUsers: [],
    shifts: []
  };

  const handlers = createShiftPlanningHandlers(createRuntimeStub());
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = (globalThis as any).localStorage;
  let responseIndex = 0;
  globalThis.fetch = (async () => {
    responseIndex += 1;
    return okResponse({
      overview: responseIndex === 1
        ? state.shiftPlanning
        : {
            ...state.shiftPlanning!,
            summary: {
              ...state.shiftPlanning!.summary,
              runningShifts: 1
            }
          }
    });
  }) as typeof fetch;
  (globalThis as any).localStorage = { getItem: () => "token-1" };

  try {
    assert.equal(await handlers.pollShiftPlanning(), false);
    assert.equal(state.shiftPlanning?.summary.runningShifts, 0);
    assert.equal(await handlers.pollShiftPlanning(), true);
    assert.equal(state.shiftPlanning?.summary.runningShifts, 1);
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as any).localStorage = previousLocalStorage;
  }
});

function createSession(): any {
  return {
    token: "token-1",
    expiresAt: "2026-04-10T18:00:00.000Z",
    user: {
      id: "user-operator",
      username: "operator",
      email: "operator@example.test",
      displayName: "Operator Standard",
      primaryRole: "operator",
      roles: ["operator"],
      isActive: true,
      status: "aktiv",
      lastStatusChangeAt: "2026-04-10T11:00:00.000Z"
    }
  };
}

function createRuntimeStub() {
  return {
    render: () => undefined,
    setBusyState: () => undefined,
    setSuccess: () => undefined,
    setFailure: () => undefined,
    runRenderBatch: async <T>(work: () => Promise<T>) => await work()
  };
}

function okResponse(data: unknown): any {
  return {
    ok: true,
    json: async () => ({ data })
  };
}
