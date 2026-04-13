import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import test from "node:test";

import { createAlarmHandlers } from "../actions/alarm-handlers.js";
import { resetSessionScopedState, state } from "../state.js";
import { renderOperatorScreen } from "../views/operator-screen.js";

test("operator screen renders inline snapshot preview for active alarm media", () => {
  resetSessionScopedState();
  state.session = createSession();
  state.overview = {
    customers: [],
    sites: [
      {
        id: "site-1",
        customer: {
          id: "customer-1",
          name: "Testkunde",
          isActive: true
        },
        siteName: "Standort Nord",
        address: {
          street: "Testweg 1",
          postalCode: "12345",
          city: "Hamburg",
          country: "DE"
        },
        status: "active",
        technicalStatus: {
          overallStatus: "ok",
          updatedAt: "2026-04-10T12:00:00.000Z"
        },
        isArchived: false,
        settings: {
          monitoringIntervalSeconds: 120,
          failureThreshold: 3,
          highlightCriticalDevices: true,
          defaultAlarmPriority: "high",
          defaultWorkflowProfile: "default",
          mapLabelMode: "full"
        },
        credentials: [],
        devices: [],
        plans: []
      }
    ],
    globalSettings: {
      defaultMonitoringIntervalSeconds: 120,
      defaultFailureThreshold: 3,
      highlightCriticalDevices: true,
      defaultAlarmPriority: "high",
      defaultWorkflowProfile: "default",
      mapLabelMode: "full"
    }
  } as any;
  state.selectedAlarmDetail = createDetailFixture();
  state.selectedAlarmCaseId = "alarm-1";
  state.selectedAlarmMediaPreviews = {
    "media-1": {
      mediaId: "media-1",
      alarmCaseId: "alarm-1",
      mode: "inline",
      filename: "alarm-1-media-1.svg",
      mimeType: "image/svg+xml",
      contentBase64: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><text x='10' y='20'>Preview</text></svg>").toString("base64"),
      title: "Snapshot Preview",
      sourceKind: "embedded"
    }
  };

  const html = renderOperatorScreen();

  assert.match(html, /alarm-media-preview-embed/);
  assert.match(html, /data:image\/svg\+xml;base64/);
  assert.doesNotMatch(html, /Vorschau wird geladen/);
});

test("handleDetail loads active media preview over active case media path", async () => {
  resetSessionScopedState();
  state.session = createSession();
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

    if (url.endsWith("/api/v1/alarm-cases/alarm-1")) {
      return okResponse(createDetailFixture());
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
    if (url.endsWith("/api/v1/alarm-cases/alarm-1/media/media-1/access?mode=inline")) {
      return okResponse({
        document: {
          mediaId: "media-1",
          alarmCaseId: "alarm-1",
          mode: "inline",
          filename: "alarm-1-media-1.svg",
          mimeType: "image/svg+xml",
          contentBase64: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><text x='10' y='20'>Preview</text></svg>").toString("base64"),
          title: "Snapshot Preview",
          sourceKind: "embedded"
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
      setSuccess: () => undefined,
      setFailure: () => undefined,
      runRenderBatch: async <T>(work: () => Promise<T>) => await work()
    });

    await handlers.handleDetail("alarm-1");
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as any).localStorage = previousLocalStorage;
  }

  assert.ok(fetchCalls.some((entry) => entry.endsWith("/api/v1/alarm-cases/alarm-1/media/media-1/access?mode=inline")));
  assert.equal(state.selectedAlarmMediaPreviews["media-1"]?.alarmCaseId, "alarm-1");
  assert.equal(state.selectedAlarmMediaPreviewErrors["media-1"], undefined);
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

function createDetailFixture(): any {
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
    media: [
      {
        id: "media-1",
        alarmCaseId: "alarm-1",
        deviceId: "device-1",
        mediaKind: "snapshot",
        storageKey: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        mimeType: "image/svg+xml",
        capturedAt: "2026-04-10T11:55:30.000Z",
        isPrimary: true,
        createdAt: "2026-04-10T11:55:30.000Z"
      }
    ],
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
  };
}

function okResponse(data: unknown): any {
  return {
    ok: true,
    json: async () => ({ data })
  };
}
