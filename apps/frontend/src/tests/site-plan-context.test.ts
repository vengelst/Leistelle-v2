/**
 * Testet die Ableitung des Standortplan-Kontexts aus Markern, Geraeten und offenen Vorgaengen.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { MasterDataOverview } from "@leitstelle/contracts";

import { resolveSitePlanContext } from "../site-plan-context.js";

test("site plan context chooses highlighted device marker when no explicit marker is selected", () => {
  const site = createSiteFixture();

  const context = resolveSitePlanContext({
    site,
    selectedPlanId: "plan-yard",
    highlightedDeviceId: "device-camera-north",
    openAlarms: [],
    openDisturbances: []
  });

  assert.equal(context.selectedPlan?.id, "plan-yard");
  assert.equal(context.selectedMarker?.id, "marker-camera-north");
  assert.equal(context.selectedDevice?.id, "device-camera-north");
});

test("site plan context filters matching alarms and disturbances by selected marker device", () => {
  const site = createSiteFixture();

  const context = resolveSitePlanContext({
    site,
    selectedPlanId: "plan-yard",
    selectedMarkerId: "marker-camera-north",
    openAlarms: [
      {
        id: "alarm-1",
        siteId: site.id,
        primaryDeviceId: "device-camera-north"
      },
      {
        id: "alarm-2",
        siteId: site.id,
        primaryDeviceId: "device-camera-south"
      }
    ] as any,
    openDisturbances: [
      {
        id: "disturbance-1",
        siteId: site.id,
        deviceId: "device-camera-north"
      },
      {
        id: "disturbance-2",
        siteId: site.id,
        deviceId: "device-router-1"
      }
    ] as any
  });

  assert.deepEqual(context.matchingAlarms.map((entry) => entry.id), ["alarm-1"]);
  assert.deepEqual(context.matchingDisturbances.map((entry) => entry.id), ["disturbance-1"]);
});

test("site plan context keeps camera markers without device assignment robust", () => {
  const site = createSiteFixture();

  const context = resolveSitePlanContext({
    site,
    selectedPlanId: "plan-yard",
    selectedMarkerId: "marker-camera-unassigned",
    openAlarms: [],
    openDisturbances: []
  });

  assert.equal(context.selectedMarker?.id, "marker-camera-unassigned");
  assert.equal(context.selectedDevice, undefined);
  assert.equal(context.cameraMarkerCount, 2);
  assert.equal(context.unassignedCameraMarkerCount, 1);
  assert.deepEqual(context.matchingAlarms, []);
  assert.deepEqual(context.matchingDisturbances, []);
});

test("site plan context returns empty selection for sites without plans", () => {
  const site = {
    ...createSiteFixture(),
    plans: []
  };

  const context = resolveSitePlanContext({
    site,
    openAlarms: [],
    openDisturbances: []
  });

  assert.equal(context.selectedPlan, undefined);
  assert.equal(context.selectedMarker, undefined);
  assert.equal(context.cameraMarkerCount, 0);
});

function createSiteFixture(): MasterDataOverview["sites"][number] {
  return {
    id: "site-hamburg-hafen",
    customer: {
      id: "customer-1",
      name: "Hamburg Hafen",
      isActive: true
    },
    siteName: "Hamburg Hafen",
    address: {
      street: "Kai 1",
      postalCode: "20457",
      city: "Hamburg",
      country: "DE"
    },
    status: "active",
    technicalStatus: {
      overallStatus: "ok",
      updatedAt: "2026-04-10T08:00:00.000Z"
    },
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
        id: "device-camera-north",
        siteId: "site-hamburg-hafen",
        name: "Kamera Nord",
        type: "camera",
        status: "installed",
        isActive: true,
        credentials: []
      },
      {
        id: "device-camera-south",
        siteId: "site-hamburg-hafen",
        name: "Kamera Sued",
        type: "camera",
        status: "installed",
        isActive: true,
        credentials: []
      }
    ],
    alarmSourceMappings: [],
    plans: [
      {
        id: "plan-yard",
        siteId: "site-hamburg-hafen",
        name: "Yard Uebersicht",
        kind: "site_plan",
        assetName: "yard-overview.png",
        markers: [
          {
            id: "marker-camera-north",
            label: "Kamera Nord",
            x: 34,
            y: 58,
            deviceId: "device-camera-north",
            markerType: "camera"
          },
          {
            id: "marker-camera-unassigned",
            label: "Kamera Sued",
            x: 64,
            y: 46,
            markerType: "camera"
          }
        ]
      }
    ]
  };
}
