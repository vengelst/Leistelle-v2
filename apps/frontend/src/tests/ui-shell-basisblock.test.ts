import assert from "node:assert/strict";
import test from "node:test";

import { createSharedUiHandlers } from "../actions/shared-ui-handlers.js";
import { resolveWorkspaceNavigation } from "../navigation/routes.js";
import { resetSessionScopedState, state } from "../state.js";
import { renderApp } from "../views/app.js";

test("renderApp shows dedicated login shell before authenticated app", () => {
  resetSessionScopedState();

  const html = renderApp();

  assert.ok(html.includes("Leitstellensoftware"));
  assert.ok(html.includes("Anmelden"));
  assert.ok(!html.includes("Hauptnavigation"));
});

test("legacy administration hash resolves to settings workspace", () => {
  assert.deepEqual(resolveWorkspaceNavigation("#administration"), {
    workspace: "settings"
  });
});

test("settings workspace shows central overview for administrative subareas", () => {
  resetSessionScopedState();
  state.session = createSession(["administrator"]);
  state.activeWorkspace = "settings";
  state.overview = createOverview();
  state.workflowProfiles = [];
  state.userAdministration = createUserAdministrationOverview();
  state.selectedSettingsSection = "overview";

  const html = renderApp();

  assert.ok(html.includes("Einstellungen"));
  assert.ok(html.includes("Allgemein"));
  assert.ok(html.includes("Benutzer"));
  assert.ok(html.includes("Admin / Rollen &amp; Rechte") || html.includes("Admin / Rollen & Rechte"));
  assert.ok(html.includes("Standorte"));
});

test("primary navigation shows settings and separate sites entry", () => {
  resetSessionScopedState();
  state.session = createSession(["administrator"]);
  state.activeWorkspace = "dashboard";

  const html = renderApp();

  assert.ok(html.includes('data-workspace-id="settings"'));
  assert.ok(html.includes('data-workspace-id="sites"'));
});

test("sites workspace renders dedicated site management area", () => {
  resetSessionScopedState();
  state.session = createSession(["administrator"]);
  state.activeWorkspace = "sites";
  state.overview = createOverview();

  const html = renderApp();

  assert.ok(html.includes("Standorte"));
  assert.ok(html.includes("Standortdaten aktualisieren"));
  assert.ok(html.includes("Administrativer Pflegebereich fuer Standortstammdaten"));
});

test("leitstelle toolbar renders alarm sound controls in the existing operator workspace", () => {
  resetSessionScopedState();
  state.session = createSession(["operator"]);
  state.activeWorkspace = "leitstelle";
  state.leitstelleMode = "alarms";

  const html = renderApp();

  assert.ok(html.includes("alarm-sound-toggle-button"));
  assert.ok(html.includes("alarm-sound-normal-toggle-button"));
  assert.ok(html.includes("alarm-sound-test-button"));
  assert.ok(html.includes("Alarmton an"));
  assert.ok(html.includes("Signal kritisch/hoch"));
});

test("alarm detail renders follow-up controls and active status in the existing worklog area", () => {
  resetSessionScopedState();
  state.session = createSession(["operator"]);
  state.activeWorkspace = "leitstelle";
  state.leitstelleMode = "alarms";
  state.selectedAlarmDetail = {
    alarmCase: {
      id: "alarm-1",
      siteId: "site-1",
      alarmType: "motion",
      priority: "high",
      priorityRank: 3,
      lifecycleStatus: "reserved",
      assessmentStatus: "pending",
      technicalState: "complete",
      title: "Zaunalarm Nord",
      receivedAt: "2026-04-10T11:55:00.000Z",
      followUpAt: "2026-04-10T13:30:00.000Z",
      followUpNote: "Rueckruf pruefen",
      responseDueAt: "2026-04-10T12:05:00.000Z",
      responseDeadlineState: "overdue",
      isEscalationReady: true,
      lastEventAt: "2026-04-10T11:56:00.000Z",
      createdAt: "2026-04-10T11:55:00.000Z",
      updatedAt: "2026-04-10T11:56:00.000Z"
    },
    events: [],
    media: [],
    assignments: [],
    comments: [],
    actions: [],
    instructionContext: {
      siteId: "site-1",
      timeContext: "normal",
      profiles: []
    },
    falsePositiveReasons: [],
    isArchived: false
  } as any;

  const html = renderApp();

  assert.ok(html.includes('id="follow-up-form"'));
  assert.ok(html.includes("Reaktionsfrist"));
  assert.ok(html.includes("eskalationsreif"));
  assert.ok(html.includes("Wiedervorlage"));
  assert.ok(html.includes("Rueckruf pruefen"));
  assert.ok(html.includes("Wiedervorlage entfernen"));
});

test("alarm workspace renders quick assignment filters and display name based assignment status", () => {
  resetSessionScopedState();
  state.session = createSession(["operator"]);
  state.activeWorkspace = "leitstelle";
  state.leitstelleMode = "alarms";
  state.pipelineFilter = { assignmentScope: "mine" };
  state.openAlarms = [{
    id: "alarm-1",
    siteId: "site-1",
    alarmType: "motion",
    priority: "high",
    priorityRank: 3,
    lifecycleStatus: "reserved",
    assessmentStatus: "pending",
    technicalState: "complete",
    title: "Zaunalarm Nord",
    receivedAt: "2026-04-10T11:55:00.000Z",
    responseDeadlineState: "within_deadline",
    isEscalationReady: false,
    lastEventAt: "2026-04-10T11:56:00.000Z",
    createdAt: "2026-04-10T11:55:00.000Z",
    updatedAt: "2026-04-10T11:56:00.000Z",
    customerName: "Testkunde",
    siteName: "Standort Nord",
    mediaCount: 0,
    eventCount: 1,
    hasTechnicalIssue: false,
    activeAssignment: {
      userId: "user-admin",
      displayName: "Admin",
      assignmentStatus: "active",
      assignedAt: "2026-04-10T11:56:00.000Z"
    }
  }] as any;
  state.selectedAlarmDetail = {
    alarmCase: {
      id: "alarm-1",
      siteId: "site-1",
      alarmType: "motion",
      priority: "high",
      priorityRank: 3,
      lifecycleStatus: "reserved",
      assessmentStatus: "pending",
      technicalState: "complete",
      title: "Zaunalarm Nord",
      receivedAt: "2026-04-10T11:55:00.000Z",
      responseDeadlineState: "within_deadline",
      isEscalationReady: false,
      lastEventAt: "2026-04-10T11:56:00.000Z",
      createdAt: "2026-04-10T11:55:00.000Z",
      updatedAt: "2026-04-10T11:56:00.000Z"
    },
    events: [],
    media: [],
    assignments: [{
      id: "assignment-1",
      alarmCaseId: "alarm-1",
      userId: "user-admin",
      assignmentKind: "owner",
      assignmentStatus: "active",
      assignedAt: "2026-04-10T11:56:00.000Z",
      createdAt: "2026-04-10T11:56:00.000Z",
      updatedAt: "2026-04-10T11:56:00.000Z"
    }],
    comments: [],
    actions: [],
    instructionContext: {
      siteId: "site-1",
      timeContext: "normal",
      profiles: []
    },
    falsePositiveReasons: [],
    isArchived: false
  } as any;

  const html = renderApp();

  assert.ok(html.includes('data-pipeline-assignment-scope="mine"'));
  assert.ok(html.includes("mein Fall"));
  assert.ok(html.includes("Admin seit"));
});

test("settings navigation entry stays hidden for non administrative roles", () => {
  resetSessionScopedState();
  state.session = createSession(["operator"]);
  state.activeWorkspace = "dashboard";

  const html = renderApp();

  assert.ok(!html.includes("data-workspace-id=\"settings\""));
});

test("dashboard hides archive jump for roles without archive access", () => {
  resetSessionScopedState();
  state.session = createSession(["service"]);
  state.dashboard = {
    metrics: {
      openAlarms: { label: "Offene Alarme", value: 1 },
      openDisturbances: { label: "Offene Stoerungen", value: 0 },
      todaysFalsePositives: { label: "Fehlalarme heute", value: 0 },
      criticalSites: { label: "Kritische Standorte", value: 0 },
      activeOperators: { label: "Aktive Operatoren", value: 1 }
    },
    highlights: {
      alarms: [],
      disturbances: [],
      criticalSites: [],
      activeOperators: []
    }
  } as any;

  const html = renderApp();

  assert.ok(!html.includes("Zur Archivsicht"));
  assert.ok(html.includes("Zum Reporting"));
});

test("archive section renders an access notice for roles without archive access", () => {
  resetSessionScopedState();
  state.session = createSession(["service"]);
  state.activeWorkspace = "archive-reporting";

  const html = renderApp();

  assert.ok(html.includes("bewussten Archivsicht verfuegbar"));
});

test("kiosk toggle stores shell preference without second app", () => {
  resetSessionScopedState();
  state.kioskMode = false;
  const previousLocalStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  const localStorageCalls: Array<{ key: string; value: string }> = [];

  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: () => null,
    setItem: (key: string, value: string) => {
      localStorageCalls.push({ key, value });
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0
  } as Storage;
  globalThis.window = {
    ...(globalThis.window ?? globalThis),
    localStorage: globalThis.localStorage
  } as Window & typeof globalThis;

  try {
    const handlers = createSharedUiHandlers({
      alarmSoundEnabledStorageKey: "leitstelle.alarm.sound.enabled",
      alarmSoundIncludeNormalPriorityStorageKey: "leitstelle.alarm.sound.include-normal",
      applyThemeMode: () => undefined,
      armAlarmSound: async () => undefined,
      render: () => undefined,
      playAlarmSoundPreview: async () => undefined,
      router: {
        navigateWorkspace: () => undefined,
        navigateLeitstelleMode: () => undefined
      } as any,
      themeStorageKey: "leitstelle.theme.mode",
      kioskStorageKey: "leitstelle.ui.kiosk"
    });

    handlers.toggleKiosk();
  } finally {
    if (previousLocalStorage) {
      globalThis.localStorage = previousLocalStorage;
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
    if (previousWindow) {
      globalThis.window = previousWindow;
    } else {
      delete (globalThis as { window?: Window & typeof globalThis }).window;
    }
  }

  assert.equal(state.kioskMode, true);
  assert.deepEqual(localStorageCalls, [{ key: "leitstelle.ui.kiosk", value: "true" }]);
});

function createSession(roles: string[]) {
  return {
    token: "token-1",
    expiresAt: "2026-04-10T18:00:00.000Z",
    user: {
      id: "user-admin",
      username: "admin",
      email: "admin@example.test",
      displayName: "Admin",
      primaryRole: roles[0] ?? "administrator",
      roles,
      isActive: true,
      status: "aktiv",
      lastStatusChangeAt: "2026-04-10T11:00:00.000Z"
    }
  } as any;
}

function createOverview() {
  return {
    customers: [],
    sites: [],
    globalSettings: {
      monitoringIntervalSeconds: 120,
      failureThreshold: 4,
      uiDensity: "comfortable",
      escalationProfile: "standard",
      workflowProfile: "default"
    }
  } as any;
}

function createUserAdministrationOverview() {
  return {
    users: [
      {
        id: "user-admin",
        username: "admin",
        email: "admin@example.test",
        displayName: "Admin",
        primaryRole: "administrator",
        roles: ["administrator"],
        isActive: true,
        status: "aktiv",
        lastStatusChangeAt: "2026-04-10T11:00:00.000Z",
        createdAt: "2026-04-10T09:00:00.000Z",
        updatedAt: "2026-04-10T11:00:00.000Z"
      }
    ]
  } as any;
}
