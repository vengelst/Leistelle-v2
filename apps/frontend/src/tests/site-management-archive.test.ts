import assert from "node:assert/strict";
import test from "node:test";

import { createMasterDataHandlers } from "../actions/master-data-handlers.js";
import { resetSessionScopedState, state } from "../state.js";
import { renderSiteManagementSection } from "../views/master-data.js";

test("site list hides archived entries by default and marks them when consciously enabled", () => {
  resetSessionScopedState();
  state.session = createSession(["administrator"]);
  state.overview = createOverview();
  state.siteManagementView = "list";

  const defaultHtml = renderSiteManagementSection();
  assert.ok(!defaultHtml.includes("Archiviert AG"));
  assert.ok(defaultHtml.includes("Aktive Standorte sichtbar"));

  state.siteManagementShowArchived = true;
  const archiveHtml = renderSiteManagementSection();

  assert.ok(archiveHtml.includes("site-archive-pill"));
  assert.ok(archiveHtml.includes("Archiviert AG"));
});

test("site detail shows archive action and keeps archive state out of the visible form fieldset", () => {
  resetSessionScopedState();
  state.session = createSession(["administrator"]);
  state.overview = createOverview();
  state.selectedSiteId = "site-active";
  state.siteManagementView = "detail";
  state.selectedSiteManagementSection = "master-data";
  state.selectedSiteEditorId = "site-active";

  const html = renderSiteManagementSection();

  assert.ok(html.includes("Archivieren"));
  assert.ok(html.includes('class="secondary site-management-toggle-archive-button site-management-archive-button"'));
  assert.ok(html.includes('type="hidden" name="isArchived" value="false"'));
  assert.ok(!html.includes('<span>Archiviert</span><select name="isArchived">'));
});

test("archive toggle reuses the existing site upsert flow", async () => {
  resetSessionScopedState();
  state.session = createSession(["administrator"]);
  state.overview = createOverview();
  state.selectedSiteId = "site-active";
  state.siteManagementView = "detail";
  state.selectedSiteManagementSection = "master-data";

  const fetchCalls: Array<{ url: string; method: string; body?: string }> = [];
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const previousLocalStorage = (globalThis as { localStorage?: { getItem: (key: string) => string | null } }).localStorage;
  const previousConfirm = globalThis.window?.confirm;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const call = { url, method: init?.method ?? "GET" } as { url: string; method: string; body?: string };
    if (typeof init?.body === "string") {
      call.body = init.body;
    }
    fetchCalls.push(call);

    if (url.endsWith("/api/v1/master-data/sites") && init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      assert.equal(payload.id, "site-active");
      assert.equal(payload.isArchived, true);
      assert.equal(payload.siteName, "Aktiv GmbH");
      return okResponse({
        overview: createOverview(true)
      });
    }

    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;
  (globalThis as { localStorage?: { getItem: (key: string) => string | null } }).localStorage = {
    getItem: () => "token-1"
  };
  globalThis.window = {
    ...(globalThis.window ?? globalThis),
    confirm: () => true
  } as Window & typeof globalThis;

  try {
    const handlers = createMasterDataHandlers({
      render: () => undefined,
      setBusyState: (key: string, label: string | null) => {
        if (label) {
          state.pendingOperations = { ...state.pendingOperations, [key]: label };
          return;
        }
        const next = { ...state.pendingOperations };
        delete next[key];
        state.pendingOperations = next;
      },
      setSuccess: (message: string | null) => {
        state.message = message;
        state.error = null;
      },
      setFailure: (message: string) => {
        state.error = message;
        state.message = null;
      },
      runRenderBatch: async <T>(work: () => Promise<T>) => await work(),
      fetchOpenAlarms: async () => undefined,
      fetchSiteMarkers: async () => undefined,
      fetchWorkflowProfiles: async () => undefined
    });

    await handlers.handleSiteManagementToggleArchive("site-active");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousLocalStorage) {
      (globalThis as { localStorage?: { getItem: (key: string) => string | null } }).localStorage = previousLocalStorage;
    } else {
      delete (globalThis as { localStorage?: { getItem: (key: string) => string | null } }).localStorage;
    }
    if (previousWindow) {
      globalThis.window = previousWindow;
    } else {
      delete (globalThis as { window?: Window & typeof globalThis }).window;
    }
  }

  assert.ok(fetchCalls.some((call) => call.url.endsWith("/api/v1/master-data/sites") && call.method === "POST"));
  assert.equal(state.overview?.sites[0]?.isArchived, true);
  assert.equal(state.message, "Standort archiviert.");
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

function createOverview(activeSiteArchived = false) {
  return {
    customers: [
      {
        id: "customer-1",
        name: "Customer 1",
        externalRef: "cust-1",
        isActive: true
      }
    ],
    sites: [
      createSite({
        id: "site-active",
        siteName: "Aktiv GmbH",
        isArchived: activeSiteArchived,
        city: "Berlin"
      }),
      createSite({
        id: "site-archived",
        siteName: "Archiviert AG",
        isArchived: true,
        city: "Hamburg"
      })
    ],
    globalSettings: {
      monitoringIntervalSeconds: 120,
      failureThreshold: 4,
      uiDensity: "comfortable",
      escalationProfile: "standard",
      workflowProfile: "default"
    }
  } as any;
}

function createSite(input: { id: string; siteName: string; isArchived: boolean; city: string }) {
  return {
    id: input.id,
    siteName: input.siteName,
    customer: {
      id: "customer-1",
      name: "Customer 1"
    },
    internalReference: `${input.id}-ref`,
    description: "Teststandort",
    status: "active",
    address: {
      street: "Musterweg",
      houseNumber: "1",
      postalCode: "10115",
      city: input.city,
      country: "DE"
    },
    coordinates: {
      latitude: 52.52,
      longitude: 13.405
    },
    siteType: "Objekt",
    contactPerson: "Max Mustermann",
    contactPhone: "030123456",
    notes: "Hinweis",
    isArchived: input.isArchived,
    settings: {
      monitoringIntervalSeconds: 120,
      failureThreshold: 4,
      highlightCriticalDevices: true,
      defaultAlarmPriority: "high",
      defaultWorkflowProfile: "event_sensitive",
      mapLabelMode: "full"
    },
    credentials: [],
    devices: [],
    alarmSourceMappings: [],
    plans: [],
    technicalStatus: {
      overallStatus: "ok",
      updatedAt: "2026-04-10T11:55:00.000Z"
    }
  };
}

function okResponse(data: unknown): any {
  return {
    ok: true,
    json: async () => ({ data })
  };
}
