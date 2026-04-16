/**
 * Sichert Routing, Rendering und Interaktionen des dedizierten Operator-Screens ab.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { applyPendingOperatorFocus, bindAppEvents } from "../actions/events.js";
import { createAlarmHandlers } from "../actions/alarm-handlers.js";
import { resolveWorkspaceNavigation, serializeWorkspaceNavigation } from "../navigation/routes.js";
import { resetSessionScopedState, state } from "../state.js";
import { renderPipelineItem } from "../views/alarm.js";
import { renderOperatorScreen } from "../views/operator-screen.js";

test("leitstelle operator route resolves and serializes canonically", () => {
  assert.deepEqual(resolveWorkspaceNavigation("#leitstelle/operator"), {
    workspace: "leitstelle",
    leitstelleMode: "operator"
  });
  assert.deepEqual(resolveWorkspaceNavigation("#leitstelle"), {
    workspace: "leitstelle",
    leitstelleMode: "alarms"
  });
  assert.equal(
    serializeWorkspaceNavigation({ workspace: "leitstelle", leitstelleMode: "operator" }),
    "#leitstelle/operator"
  );
});

test("operator accept reserves an alarm and opens the existing detail context", async () => {
  resetSessionScopedState();
  state.session = {
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
  state.openAlarms = [
    {
      id: "alarm-1",
      siteId: "site-1",
      alarmType: "motion",
      priority: "high",
      priorityRank: 3,
      lifecycleStatus: "received",
      assessmentStatus: "pending",
      technicalState: "complete",
      title: "Zaunalarm Nord",
      receivedAt: "2026-04-10T11:55:00.000Z",
      lastEventAt: "2026-04-10T11:55:00.000Z",
      createdAt: "2026-04-10T11:55:00.000Z",
      updatedAt: "2026-04-10T11:55:00.000Z",
      customerName: "Testkunde",
      siteName: "Standort Nord",
      mediaCount: 1,
      eventCount: 1,
      hasTechnicalIssue: false
    } as any
  ];
  state.catalogs = {
    falsePositiveReasons: [],
    closureReasons: [],
    actionTypes: [],
    actionStatuses: [],
    workflowProfiles: []
  };

  const fetchCalls: string[] = [];
  const fetchStub = async (input: RequestInfo | URL): Promise<any> => {
    const url = String(input);
    fetchCalls.push(url);

    if (url.endsWith("/api/v1/alarm-cases/alarm-1/reserve")) {
      return okResponse({});
    }
    if (url.includes("/api/v1/alarm-cases/open")) {
      return okResponse({
        items: [
          {
            ...state.openAlarms[0],
            activeAssignment: {
              userId: "user-operator",
              displayName: "Operator Standard",
              assignmentStatus: "active",
              assignedAt: "2026-04-10T11:56:00.000Z"
            }
          }
        ]
      });
    }
    if (url.includes("/api/v1/alarm-cases/alarm-1?")) {
      return okResponse(createAlarmDetailFixture());
    }
    if (url.endsWith("/api/v1/alarm-cases/alarm-1")) {
      return okResponse(createAlarmDetailFixture());
    }
    if (url.endsWith("/api/v1/alarm-cases/alarm-1/report")) {
      return okResponse({
        report: {
          alarmCase: { id: "alarm-1" },
          isArchived: false,
          generatedAt: "2026-04-10T11:56:00.000Z",
          generatedBy: { id: "user-operator", displayName: "Operator Standard", primaryRole: "operator" },
          site: { id: "site-1", siteName: "Standort Nord", customerId: "customer-1", customerName: "Testkunde", address: "Testweg 1" },
          actors: [],
          events: [],
          media: [],
          assignments: [],
          comments: [],
          actions: [],
          falsePositiveReasons: [],
          narrative: { overview: [], progress: [], actions: [], completion: [] }
        }
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const previousFetch = globalThis.fetch;
  const previousLocalStorage = (globalThis as any).localStorage;
  globalThis.fetch = fetchStub as typeof fetch;
  (globalThis as any).localStorage = {
    getItem: () => "token-1"
  };

  const deps = {
    render: () => undefined,
    setBusyState: (_key: string, label: string | null) => {
      if (label) {
        state.pendingOperations = { ...state.pendingOperations, [_key]: label };
      } else {
        const next = { ...state.pendingOperations };
        delete next[_key];
        state.pendingOperations = next;
      }
    },
    setSuccess: (message: string | null) => {
      if (message !== null) {
        state.message = message;
        state.error = null;
      }
    },
    setFailure: (message: string) => {
      state.error = message;
      state.message = null;
    },
    runRenderBatch: async <T>(work: () => Promise<T>) => await work()
  };

  try {
    const handlers = createAlarmHandlers(deps);
    await handlers.handleOperatorAccept("alarm-1");
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as any).localStorage = previousLocalStorage;
  }

  assert.ok(fetchCalls.some((entry) => entry.endsWith("/api/v1/alarm-cases/alarm-1/reserve")));
  assert.ok(fetchCalls.some((entry) => entry.includes("/api/v1/alarm-cases/open")));
  assert.ok(fetchCalls.some((entry) => entry.includes("/api/v1/alarm-cases/alarm-1")));
  assert.equal(state.selectedAlarmCaseId, "alarm-1");
  assert.equal(state.selectedAlarmDetail?.alarmCase.id, "alarm-1");
  assert.equal(state.message, "Alarm uebernommen und geoeffnet.");
});

test("operator accept uses override takeover for leitstellenleitung on foreign assignment", async () => {
  resetSessionScopedState();
  state.session = {
    token: "token-1",
    expiresAt: "2026-04-10T18:00:00.000Z",
    user: {
      id: "user-lead",
      username: "lead",
      email: "lead@example.test",
      displayName: "Leitung",
      primaryRole: "leitstellenleiter",
      roles: ["leitstellenleiter"],
      isActive: true,
      status: "aktiv",
      lastStatusChangeAt: "2026-04-10T11:00:00.000Z"
    }
  };
  state.openAlarms = [
    {
      id: "alarm-1",
      siteId: "site-1",
      alarmType: "motion",
      priority: "high",
      priorityRank: 3,
      lifecycleStatus: "received",
      assessmentStatus: "pending",
      technicalState: "complete",
      title: "Zaunalarm Nord",
      receivedAt: "2026-04-10T11:55:00.000Z",
      lastEventAt: "2026-04-10T11:55:00.000Z",
      createdAt: "2026-04-10T11:55:00.000Z",
      updatedAt: "2026-04-10T11:55:00.000Z",
      customerName: "Testkunde",
      siteName: "Standort Nord",
      mediaCount: 1,
      eventCount: 1,
      hasTechnicalIssue: false,
      activeAssignment: {
        userId: "user-operator",
        displayName: "Operator Standard",
        assignmentStatus: "active",
        assignedAt: "2026-04-10T11:56:00.000Z"
      }
    } as any
  ];
  state.catalogs = {
    falsePositiveReasons: [],
    closureReasons: [],
    actionTypes: [],
    actionStatuses: [],
    workflowProfiles: []
  };

  let reserveBody = "";
  const fetchStub = async (input: RequestInfo | URL, init?: RequestInit): Promise<any> => {
    const url = String(input);

    if (url.endsWith("/api/v1/alarm-cases/alarm-1/reserve")) {
      reserveBody = String(init?.body ?? "");
      return okResponse({});
    }
    if (url.includes("/api/v1/alarm-cases/open")) {
      return okResponse({
        items: [
          {
            ...state.openAlarms[0],
            activeAssignment: {
              userId: "user-lead",
              displayName: "Leitung",
              assignmentStatus: "active",
              assignedAt: "2026-04-10T11:57:00.000Z"
            }
          }
        ]
      });
    }
    if (url.endsWith("/api/v1/alarm-cases/alarm-1") || url.includes("/api/v1/alarm-cases/alarm-1?")) {
      const detail = createAlarmDetailFixture();
      detail.assignments = [{
        ...detail.assignments[0],
        userId: "user-lead",
        assignedAt: "2026-04-10T11:57:00.000Z"
      }];
      return okResponse(detail);
    }
    if (url.endsWith("/api/v1/alarm-cases/alarm-1/report")) {
      return okResponse({
        report: {
          alarmCase: { id: "alarm-1" },
          isArchived: false,
          generatedAt: "2026-04-10T11:57:00.000Z",
          generatedBy: { id: "user-lead", displayName: "Leitung", primaryRole: "leitstellenleiter" },
          site: { id: "site-1", siteName: "Standort Nord", customerId: "customer-1", customerName: "Testkunde", address: "Testweg 1" },
          actors: [],
          events: [],
          media: [],
          assignments: [],
          comments: [],
          actions: [],
          falsePositiveReasons: [],
          narrative: { overview: [], progress: [], actions: [], completion: [] }
        }
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const previousFetch = globalThis.fetch;
  const previousLocalStorage = (globalThis as any).localStorage;
  globalThis.fetch = fetchStub as typeof fetch;
  (globalThis as any).localStorage = {
    getItem: () => "token-1"
  };

  try {
    const handlers = createAlarmHandlers({
      render: () => undefined,
      setBusyState: () => undefined,
      setSuccess: (message: string | null) => {
        if (message !== null) {
          state.message = message;
        }
      },
      setFailure: (message: string) => {
        state.error = message;
      },
      runRenderBatch: async <T>(work: () => Promise<T>) => await work()
    });
    await handlers.handleOperatorAccept("alarm-1");
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as any).localStorage = previousLocalStorage;
  }

  assert.equal(reserveBody, JSON.stringify({ override: true }));
  assert.equal(state.message, "Alarm per Override uebernommen und geoeffnet.");
});

test("operator acknowledge reuses reservation and moves the case into active processing", async () => {
  resetSessionScopedState();
  state.session = {
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
  const detail = createAlarmDetailFixture();
  detail.alarmCase.lifecycleStatus = "reserved";
  state.selectedAlarmCaseId = "alarm-1";
  state.selectedAlarmDetail = detail;
  state.openAlarms = [
    {
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
      lastEventAt: "2026-04-10T11:55:00.000Z",
      createdAt: "2026-04-10T11:55:00.000Z",
      updatedAt: "2026-04-10T11:55:00.000Z",
      customerName: "Testkunde",
      siteName: "Standort Nord",
      mediaCount: 1,
      eventCount: 1,
      hasTechnicalIssue: false,
      activeAssignment: {
        userId: "user-operator",
        displayName: "Operator Standard",
        assignmentStatus: "active",
        assignedAt: "2026-04-10T11:56:00.000Z"
      }
    } as any
  ];

  const fetchCalls: string[] = [];
  const fetchStub = async (input: RequestInfo | URL): Promise<any> => {
    const url = String(input);
    fetchCalls.push(url);

    if (url.endsWith("/api/v1/alarm-cases/alarm-1/acknowledge")) {
      return okResponse({
        alarmCase: {
          ...detail.alarmCase,
          lifecycleStatus: "in_progress"
        }
      });
    }
    if (url.includes("/api/v1/alarm-cases/open")) {
      return okResponse({
        items: [
          {
            ...state.openAlarms[0],
            lifecycleStatus: "in_progress"
          }
        ]
      });
    }
    if (url.endsWith("/api/v1/alarm-cases/alarm-1/report")) {
      return okResponse({
        report: {
          alarmCase: { id: "alarm-1" },
          isArchived: false,
          generatedAt: "2026-04-10T11:56:00.000Z",
          generatedBy: { id: "user-operator", displayName: "Operator Standard", primaryRole: "operator" },
          site: { id: "site-1", siteName: "Standort Nord", customerId: "customer-1", customerName: "Testkunde", address: "Testweg 1" },
          actors: [],
          events: [],
          media: [],
          assignments: [],
          comments: [],
          actions: [],
          falsePositiveReasons: [],
          narrative: { overview: [], progress: [], actions: [], completion: [] }
        }
      });
    }
    if (url.includes("/api/v1/alarm-cases/alarm-1")) {
      const updatedDetail = createAlarmDetailFixture();
      updatedDetail.alarmCase.lifecycleStatus = "in_progress";
      return okResponse(updatedDetail);
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  const previousFetch = globalThis.fetch;
  const previousLocalStorage = (globalThis as any).localStorage;
  globalThis.fetch = fetchStub as typeof fetch;
  (globalThis as any).localStorage = {
    getItem: () => "token-1"
  };

  const deps = {
    render: () => undefined,
    setBusyState: (_key: string, label: string | null) => {
      if (label) {
        state.pendingOperations = { ...state.pendingOperations, [_key]: label };
      } else {
        const next = { ...state.pendingOperations };
        delete next[_key];
        state.pendingOperations = next;
      }
    },
    setSuccess: (message: string | null) => {
      if (message !== null) {
        state.message = message;
        state.error = null;
      }
    },
    setFailure: (message: string) => {
      state.error = message;
      state.message = null;
    },
    runRenderBatch: async <T>(work: () => Promise<T>) => await work()
  };

  try {
    const handlers = createAlarmHandlers(deps);
    await handlers.handleDetailAcknowledge();
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as any).localStorage = previousLocalStorage;
  }

  assert.ok(fetchCalls.some((entry) => entry.endsWith("/api/v1/alarm-cases/alarm-1/acknowledge")));
  assert.equal(state.selectedAlarmDetail?.alarmCase.lifecycleStatus, "in_progress");
  assert.equal(state.message, "Alarm quittiert und in Bearbeitung gesetzt.");
});

test("operator ui structure highlights primary actions and readable status labels", () => {
  resetSessionScopedState();
  state.session = {
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
  state.openAlarms = [
    {
      id: "alarm-1",
      siteId: "site-1",
      alarmType: "motion",
      priority: "high",
      priorityRank: 3,
      lifecycleStatus: "in_progress",
      assessmentStatus: "confirmed_incident",
      technicalState: "incomplete",
      title: "Zaunalarm Nord",
      receivedAt: "2026-04-10T11:55:00.000Z",
      lastEventAt: "2026-04-10T11:55:00.000Z",
      createdAt: "2026-04-10T11:55:00.000Z",
      updatedAt: "2026-04-10T11:55:00.000Z",
      customerName: "Testkunde",
      siteName: "Standort Nord",
      primaryDeviceName: "Kamera Nord 1",
      mediaCount: 2,
      eventCount: 3,
      hasTechnicalIssue: true,
      incompleteReason: "Payload unvollstaendig",
      activeAssignment: {
        userId: "user-operator",
        displayName: "Operator Standard",
        assignmentStatus: "active",
        assignedAt: "2026-04-10T11:56:00.000Z"
      }
    } as any
  ];
  state.selectedAlarmCaseId = "alarm-1";
  const detail = createAlarmDetailFixture();
  detail.alarmCase.lifecycleStatus = "in_progress";
  detail.alarmCase.assessmentStatus = "confirmed_incident";
  detail.alarmCase.technicalState = "incomplete";
  state.selectedAlarmDetail = detail;
  state.overview = {
    customers: [{ id: "customer-1", name: "Testkunde", createdAt: "", updatedAt: "" }],
    sites: [{
      id: "site-1",
      customerId: "customer-1",
      customer: { id: "customer-1", name: "Testkunde" },
      siteNumber: "001",
      siteName: "Standort Nord",
      status: "active",
      address: { street: "Testweg", houseNumber: "1", postalCode: "12345", city: "Teststadt", country: "DE" },
      contact: { name: "Max Muster", phone: "", email: "" },
      escalationPolicy: "",
      devices: [],
      plans: [],
      createdAt: "",
      updatedAt: ""
    }] as any,
    deviceSummaries: [],
    sitePlans: []
  } as any;
  state.catalogs = {
    falsePositiveReasons: [],
    closureReasons: [],
    actionTypes: [],
    actionStatuses: [],
    workflowProfiles: []
  };

  const queueMarkup = renderPipelineItem(state.openAlarms[0]!);
  state.operatorWindowRole = "primary";
  const primaryScreenMarkup = renderOperatorScreen();
  state.operatorWindowRole = "secondary";
  const secondaryScreenMarkup = renderOperatorScreen();

  assert.match(queueMarkup, /Alarm oeffnen/);
  assert.match(queueMarkup, /Weitere Zuordnung/);
  assert.match(queueMarkup, /Bewegung/);
  assert.match(queueMarkup, /Vorfall bestaetigt/);
  assert.match(queueMarkup, /Unvollstaendig/);

  assert.match(primaryScreenMarkup, /Hauptbildschirm/);
  assert.match(primaryScreenMarkup, /Screen 1/);
  assert.match(primaryScreenMarkup, /Primaeraktionen/);
  assert.match(primaryScreenMarkup, /Quittieren/);
  assert.match(primaryScreenMarkup, /Eskalation \/ Weitergabe/);
  assert.match(primaryScreenMarkup, /Standortdaten und aktueller Bearbeitungsstatus fuer den aktuell im Alarmmonitor gewaehlten Alarm/);
  assert.match(primaryScreenMarkup, /Einsatzanweisungen/);
  assert.match(primaryScreenMarkup, /In Bearbeitung/);
  assert.match(primaryScreenMarkup, /Vorfall bestaetigt/);

  assert.match(secondaryScreenMarkup, /Alarmmonitor/);
  assert.match(secondaryScreenMarkup, /Screen 2/);
  assert.match(secondaryScreenMarkup, /Alarmannahme/);
  assert.match(secondaryScreenMarkup, /Snapshot- \/ Medienbezug/);
  assert.doesNotMatch(secondaryScreenMarkup, /Lageplan \/ Objektplan \/ Kamerakarte/);
  assert.doesNotMatch(secondaryScreenMarkup, /Quelle \/ Eingang/);
});

test("operator keyboard preparation binds focus zones, shortcuts and safe list navigation", () => {
  const listeners = new Map<string, Array<(event: any) => void>>();
  let activeElement: any = null;
  let listFocusCalls = 0;
  let detailFocusCalls = 0;
  let actionsFocusCalls = 0;
  let detailCalls = 0;
  let reserveCalls = 0;
  let acknowledgeCalls = 0;
  let quickActionCalls = 0;
  let filterFocusCalls = 0;
  let closeFocusCalls = 0;

  const listZone = { focus: () => { listFocusCalls += 1; activeElement = listZone; } };
  const detailZone = { focus: () => { detailFocusCalls += 1; activeElement = detailZone; } };
  const actionsZone = { focus: () => { actionsFocusCalls += 1; activeElement = actionsZone; } };

  function createFakeButton(dataset: Record<string, string> = {}) {
    const clickListeners: Array<() => void> = [];
    const button = {
      dataset,
      focus: () => { activeElement = button; },
      hasAttribute: () => false,
      addEventListener: (_type: string, listener: () => void) => {
        clickListeners.push(listener);
      },
      click: () => {
        for (const listener of clickListeners) {
          listener();
        }
      }
    };
    return button;
  }

  const queueButtonA = createFakeButton({ alarmCaseId: "alarm-1", operatorEntryButton: "true" }) as any;
  queueButtonA.focus = () => { activeElement = queueButtonA; };
  const queueButtonB = createFakeButton({ alarmCaseId: "alarm-2", operatorEntryButton: "true" }) as any;
  queueButtonB.focus = () => { activeElement = queueButtonB; };
  const reserveButton = createFakeButton({ alarmCaseId: "alarm-1" }) as any;
  const acknowledgeButton = createFakeButton() as any;
  const quickActionButton = createFakeButton({ actionTypeId: "action-call-security" }) as any;
  const filterButton = {
    focus: () => {
      filterFocusCalls += 1;
      activeElement = filterButton;
    }
  };
  const closeField = {
    hasAttribute: () => false,
    focus: () => {
      closeFocusCalls += 1;
      activeElement = closeField;
    }
  };

  reserveButton.addEventListener("click", () => {
    reserveCalls += 1;
  });
  acknowledgeButton.addEventListener("click", () => {
    acknowledgeCalls += 1;
  });
  quickActionButton.addEventListener("click", () => {
    quickActionCalls += 1;
  });

  const fakeDocument = {
    get activeElement() {
      return activeElement;
    },
    querySelector(selector: string) {
      switch (selector) {
        case "[data-operator-keyboard-root=\"true\"]":
          return {};
        case "[data-operator-focus-zone=\"list\"]":
          return listZone;
        case "[data-operator-focus-zone=\"detail\"]":
          return detailZone;
        case "[data-operator-focus-zone=\"actions\"]":
          return actionsZone;
        case '[data-operator-entry-button="true"][aria-current="true"]':
          return queueButtonA;
        case "#detail-reserve-button":
          return reserveButton;
        case "#detail-acknowledge-button":
          return acknowledgeButton;
        case '.quick-action-button[data-action-type-id="action-call-security"]':
          return quickActionButton;
        case '[data-pipeline-assignment-scope][aria-pressed="true"], [data-pipeline-assignment-scope], #pipeline-filter-form select, #pipeline-filter-form input, #pipeline-filter-form button':
          return filterButton;
        case "#close-form select, #close-form input, #close-form button[type=\"submit\"]":
          return closeField;
        case ".site-management-modal-backdrop":
          return null;
        default:
          return null;
      }
    },
    querySelectorAll(selector: string) {
      switch (selector) {
        case ".detail-button":
          return [queueButtonA];
        case ".reserve-button":
          return [reserveButton];
        case "[data-operator-entry-button=\"true\"]":
          return [queueButtonA, queueButtonB];
        default:
          return [];
      }
    },
    addEventListener(type: string, listener: (event: any) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: (event: any) => void) {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener));
    }
  };

  const previousDocument = globalThis.document;
  globalThis.document = fakeDocument as unknown as Document;

  try {
    bindAppEvents({
      navigateWorkspace: () => undefined,
      navigateLeitstelleMode: () => undefined,
      navigateToRegion: () => undefined,
      toggleLeitstelleNavigation: () => undefined,
      toggleTheme: () => undefined,
      toggleKiosk: () => undefined,
      setShellMenuPosition: () => undefined,
      openSecondaryOperatorWindow: () => undefined,
      toggleOperatorLayoutEditor: () => undefined,
      applyOperatorLayoutPreset: () => undefined,
      moveOperatorLayoutWidget: () => undefined,
      repositionOperatorLayoutWidget: () => undefined,
      updateOperatorLayoutWidgetWidth: () => undefined,
      updateOperatorLayoutWidgetHeight: () => undefined,
      updateOperatorLayoutDraftName: () => undefined,
      saveOperatorLayoutProfile: () => undefined,
      applyOperatorLayoutProfile: () => undefined,
      deleteOperatorLayoutProfile: () => undefined,
      toggleAlarmSound: () => undefined,
      toggleAlarmSoundIncludeNormalPriority: () => undefined,
      testAlarmSound: async () => undefined,
      handleLoginModeChange: () => undefined,
      handleLogin: async () => undefined,
      handleLogout: async () => undefined,
      fetchOverview: async () => undefined,
      fetchDashboard: async () => undefined,
      fetchShiftPlanning: async () => undefined,
      handleReportingFilterSubmit: async () => undefined,
      handleReportingReset: async () => undefined,
      handleReportingExport: () => undefined,
      handleShiftPlanningFilterSubmit: async () => undefined,
      handleShiftPlanningReset: async () => undefined,
      handleShiftPlanningSubmit: async () => undefined,
      handleShiftPlanningEdit: () => undefined,
      handleShiftPlanningEditorReset: () => undefined,
      handleArchiveFilterSubmit: async () => undefined,
      handleArchiveReset: async () => undefined,
      handleArchiveExport: () => undefined,
      fetchWorkflowProfiles: async () => undefined,
      fetchSiteMarkers: async () => undefined,
      fetchUserAdministration: async () => undefined,
      handleMapFocusSite: async () => undefined,
      handleStatusAction: async () => undefined,
      handleSettingsSectionChange: () => undefined,
      handleUserAdministrationSearchInput: () => undefined,
      handleUserAdministrationStatusFilterChange: () => undefined,
      handleUserAdministrationRoleFilterChange: () => undefined,
      handleUserAdministrationSelectUser: () => undefined,
      handleUserAdministrationBackToList: () => undefined,
      handleUserAdministrationCreateUser: () => undefined,
      handleUserAdministrationEditUser: () => undefined,
      handleUserAdministrationCancelEdit: () => undefined,
      handleUserAdministrationSubmit: async () => undefined,
      handleUserAdministrationToggleActive: async () => undefined,
      handlePipelineFilterSubmit: async () => undefined,
      handlePipelineAssignmentScopeChange: () => undefined,
      handlePipelineReset: async () => undefined,
      handleMonitoringFilterSubmit: async () => undefined,
      handleMonitoringReset: async () => undefined,
      handleDetailTimeContextChange: async () => undefined,
      refreshSelectedDetail: async () => undefined,
      fetchAlarmReport: async () => undefined,
      handleDetailReserve: async () => undefined,
      handleDetailAcknowledge: async () => undefined,
      handleDetailRelease: async () => undefined,
      refreshSelectedMonitoringDetail: async () => undefined,
      handleMonitoringAcknowledgeSelected: async () => undefined,
      handleMonitoringNoteSubmit: async () => undefined,
      handleMonitoringServiceCaseSubmit: async () => undefined,
      handleQuickConfirm: async () => undefined,
      handleQuickFalsePositive: async () => undefined,
      handleArchive: async () => undefined,
      handleAssessmentSubmit: async () => undefined,
      handleFollowUpSubmit: async () => undefined,
      handleFollowUpClear: async () => undefined,
      handleActionSubmit: async () => undefined,
      handleCommentSubmit: async () => undefined,
      handleCloseSubmit: async () => undefined,
      handleQuickAction: async () => undefined,
      handleAlarmExport: async () => undefined,
      handleArchiveOpen: async () => undefined,
      handleAlarmMediaAccess: async () => undefined,
      handleDetail: async () => {
        detailCalls += 1;
      },
      handleOperatorAccept: async () => undefined,
      handleReserve: async () => undefined,
      handleRelease: async () => undefined,
      handleReassign: async () => undefined,
      handleMonitoringDetail: async () => undefined,
      handleMonitoringAcknowledge: async () => undefined,
      handleMapMarkerSelect: async () => undefined,
      handleMapOpenSiteDetails: () => undefined,
      handleSiteManagementSelectSite: () => undefined,
      handleSiteManagementBackToList: () => undefined,
      handleSiteManagementSectionChange: () => undefined,
      handleSiteManagementSearchInput: () => undefined,
      handleSiteManagementStatusFilterChange: () => undefined,
      handleSiteManagementShowArchivedToggle: () => undefined,
      handleSiteManagementCreateSite: () => undefined,
      handleSiteManagementCancelSiteEdit: () => undefined,
      handleSiteManagementEditSite: () => undefined,
      handleSiteManagementToggleArchive: async () => undefined,
      handleSiteManagementCreateDevice: () => undefined,
      handleSiteManagementEditDevice: () => undefined,
      handleSiteManagementDeviceTypeChange: () => undefined,
      handleSiteManagementCloseDeviceModal: () => undefined,
      handleSiteManagementDeleteDevice: async () => undefined,
      handleSiteManagementEditAlarmSourceMapping: () => undefined,
      handleSiteManagementCancelAlarmSourceMappingEdit: () => undefined,
      handleSiteManagementToggleAlarmSourceMapping: async () => undefined,
      handleMapOpenAlarm: async () => undefined,
      handleMapOpenDisturbance: async () => undefined,
      scrollToRegion: () => undefined,
      handleSitePlanSelect: () => undefined,
      handleSitePlanMarkerSelect: () => undefined,
      handleSitePlanZoom: () => undefined,
      handleSitePlanOpenSiteDetails: () => undefined,
      handleSitePlanOpenAlarm: async () => undefined,
      handleSitePlanOpenDisturbance: async () => undefined,
      handleGlobalSettingsSubmit: async () => undefined,
      handleCustomerSubmit: async () => undefined,
      handleSiteSubmit: async () => undefined,
      handleDeviceSubmit: async () => undefined,
      handleAlarmSourceMappingSubmit: async () => undefined,
      handlePlanSubmit: async () => undefined,
      handleWorkflowProfileSubmit: async () => undefined
    });

    queueButtonA.click();
    applyPendingOperatorFocus();
    assert.equal(detailCalls, 1);
    assert.equal(detailFocusCalls, 1);

    const keydownListeners = listeners.get("keydown") ?? [];
    assert.equal(keydownListeners.length > 0, true);

    keydownListeners[0]!({
      key: "1",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      target: null,
      preventDefault: () => undefined
    });
    assert.equal(listFocusCalls, 1);

    activeElement = queueButtonA;
    keydownListeners[0]!({
      key: "ArrowDown",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      target: null,
      preventDefault: () => undefined
    });
    assert.equal(activeElement, queueButtonB);

    keydownListeners[0]!({
      key: "3",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      target: null,
      preventDefault: () => undefined
    });
    assert.equal(actionsFocusCalls, 1);

    keydownListeners[0]!({
      key: "Enter",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      repeat: false,
      target: null,
      preventDefault: () => undefined
    });
    assert.equal(detailCalls, 2);

    keydownListeners[0]!({
      key: "r",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      repeat: false,
      target: null,
      preventDefault: () => undefined
    });
    assert.equal(reserveCalls, 1);

    keydownListeners[0]!({
      key: "q",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      repeat: false,
      target: null,
      preventDefault: () => undefined
    });
    assert.equal(acknowledgeCalls, 1);

    keydownListeners[0]!({
      key: "e",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      repeat: false,
      target: null,
      preventDefault: () => undefined
    });
    assert.equal(quickActionCalls, 1);

    keydownListeners[0]!({
      key: "f",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      repeat: false,
      target: null,
      preventDefault: () => undefined
    });
    assert.equal(filterFocusCalls, 1);

    keydownListeners[0]!({
      key: "c",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      repeat: false,
      target: null,
      preventDefault: () => undefined
    });
    assert.equal(closeFocusCalls, 1);

    activeElement = actionsZone;
    keydownListeners[0]!({
      key: "Escape",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      defaultPrevented: false,
      repeat: false,
      target: null,
      preventDefault: () => undefined
    });
    assert.equal(activeElement, queueButtonA);
  } finally {
    globalThis.document = previousDocument;
  }
});

function okResponse(data: unknown): any {
  return {
    ok: true,
    json: async () => ({ data })
  };
}

function createAlarmDetailFixture(): any {
  return {
    alarmCase: {
      id: "alarm-1",
      siteId: "site-1",
      primaryDeviceId: "device-1",
      alarmType: "motion",
      priority: "high",
      priorityRank: 3,
      lifecycleStatus: "reserved",
      assessmentStatus: "pending",
      technicalState: "complete",
      title: "Zaunalarm Nord",
      receivedAt: "2026-04-10T11:55:00.000Z",
      lastEventAt: "2026-04-10T11:56:00.000Z",
      createdAt: "2026-04-10T11:55:00.000Z",
      updatedAt: "2026-04-10T11:56:00.000Z"
    },
    events: [],
    media: [],
    assignments: [
      {
        id: "assignment-1",
        alarmCaseId: "alarm-1",
        userId: "user-operator",
        assignmentKind: "owner",
        assignmentStatus: "active",
        assignedAt: "2026-04-10T11:56:00.000Z",
        createdAt: "2026-04-10T11:56:00.000Z",
        updatedAt: "2026-04-10T11:56:00.000Z"
      }
    ],
    comments: [],
    actions: [],
    instructionContext: {
      siteId: "site-1",
      timeContext: "normal",
      profiles: []
    },
    falsePositiveReasons: [],
    isArchived: false
  };
}
