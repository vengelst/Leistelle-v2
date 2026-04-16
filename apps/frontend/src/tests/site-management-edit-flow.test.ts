/**
 * Deckt den Wechsel von Standortdetails in den Stammdaten-Editor ab.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createSiteHandlers } from "../handlers/site.handlers.js";
import { resetSessionScopedState, state } from "../state.js";
import { renderSiteManagementSection } from "../views/master-data.js";

test("overview tab explains that editing opens the master data editor", () => {
  resetSessionScopedState();
  state.session = createSession(["administrator"]);
  state.overview = createOverview();
  state.selectedSiteId = "site-1";
  state.siteManagementView = "detail";
  state.selectedSiteManagementSection = "overview";

  const html = renderSiteManagementSection();

  assert.ok(html.includes("Stammdaten bearbeiten"));
  assert.ok(html.includes("Bearbeitung startet im Stammdaten-Tab"));
  assert.ok(html.includes("Editor oeffnen"));
});

test("edit handler switches from overview to master-data editor", () => {
  resetSessionScopedState();
  state.overview = createOverview();
  state.siteManagementView = "detail";
  state.selectedSiteManagementSection = "overview";

  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousDocument = globalThis.document;
  let renderCalls = 0;
  let focused = false;

  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof requestAnimationFrame;
  globalThis.document = {
    querySelector: (selector: string) => {
      if (selector === "#site-form input[name=\"siteName\"]") {
        return {
          focus: () => {
            focused = true;
          }
        };
      }
      return null;
    }
  } as unknown as Document;

  try {
    const handlers = createSiteHandlers({
      fetchOverview: async () => undefined,
      fetchSiteMarkers: async () => undefined,
      handleMapFocusSite: async () => undefined,
      handleMapMarkerSelect: async () => undefined,
      handleDetail: async () => undefined,
      handleMonitoringDetail: async () => undefined,
      handleSitePlanSelect: () => undefined,
      handleSitePlanMarkerSelect: () => undefined,
      handleSitePlanZoom: () => undefined,
      handleCustomerSubmit: async () => undefined,
      handleSiteSubmit: async () => undefined,
      handleSiteManagementToggleArchive: async () => undefined,
      handleSiteManagementShowArchivedToggle: () => undefined,
      handleDeviceSubmit: async () => undefined,
      handleSiteManagementDeleteDevice: async () => undefined,
      handleAlarmSourceMappingSubmit: async () => undefined,
      handleSiteManagementToggleAlarmSourceMapping: async () => undefined,
      handlePlanSubmit: async () => undefined,
      router: {
        navigateWorkspace: () => undefined,
        navigateTo: () => undefined,
        start: () => undefined
      } as any,
      render: () => {
        renderCalls += 1;
      }
    });

    handlers.handleSiteManagementEditSite("site-1");
  } finally {
    globalThis.requestAnimationFrame = previousRequestAnimationFrame;
    globalThis.document = previousDocument;
  }

  assert.equal(state.selectedSiteId, "site-1");
  assert.equal(state.selectedSiteManagementSection, "master-data");
  assert.equal(state.selectedSiteEditorId, "site-1");
  assert.equal(renderCalls, 1);
  assert.equal(focused, true);
});

test("alarm sources tab renders component based mapping form and list", () => {
  resetSessionScopedState();
  state.session = createSession(["administrator"]);
  state.overview = createOverview();
  state.selectedSiteId = "site-1";
  state.siteManagementView = "detail";
  state.selectedSiteManagementSection = "alarm-sources";

  const html = renderSiteManagementSection();

  assert.ok(html.includes("Alarmquellen-Mappings"));
  assert.ok(html.includes("Interne Komponente"));
  assert.ok(html.includes("Vendor / Source-System"));
  assert.ok(html.includes("Kamera Nord (Kamera)"));
  assert.ok(html.includes("source=cam-nord"));
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
    customers: [
      {
        id: "customer-1",
        name: "Customer 1",
        externalRef: "cust-1",
        isActive: true
      }
    ],
    sites: [
      {
        id: "site-1",
        siteName: "Standort Nord",
        customer: {
          id: "customer-1",
          name: "Customer 1"
        },
        internalReference: "site-1-ref",
        description: "Teststandort",
        status: "active",
        address: {
          street: "Musterweg",
          houseNumber: "1",
          postalCode: "10115",
          city: "Berlin",
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
        isArchived: false,
        settings: {
          monitoringIntervalSeconds: 120,
          failureThreshold: 4,
          highlightCriticalDevices: true,
          defaultAlarmPriority: "high",
          defaultWorkflowProfile: "event_sensitive",
          mapLabelMode: "full"
        },
        credentials: [],
        devices: [
          {
            id: "device-camera-1",
            siteId: "site-1",
            name: "Kamera Nord",
            type: "camera",
            vendor: "Hikvision",
            serialNumber: "SER-1",
            status: "installed",
            isActive: true,
            networkAddress: "10.0.0.10",
            externalDeviceId: "cam-ext-1",
            linkedNvrDeviceId: "device-nvr-1",
            channelNumber: 2,
            zone: "Tor Nord",
            credentials: []
          },
          {
            id: "device-nvr-1",
            siteId: "site-1",
            name: "Recorder Nord",
            type: "nvr",
            vendor: "Hikvision",
            status: "installed",
            isActive: true,
            channelNumber: 16,
            credentials: []
          }
        ],
        plans: [],
        alarmSourceMappings: [
          {
            id: "mapping-1",
            siteId: "site-1",
            componentId: "device-camera-1",
            nvrComponentId: "device-nvr-1",
            vendor: "hikvision",
            sourceType: "nvr",
            externalSourceKey: "cam-nord",
            externalRecorderId: "nvr-nord",
            channelNumber: 2,
            sortOrder: 10,
            isActive: true
          }
        ],
        technicalStatus: {
          overallStatus: "ok",
          updatedAt: "2026-04-10T11:55:00.000Z"
        }
      }
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
