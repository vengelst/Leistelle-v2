/**
 * Testet Polling und Auswahlverhalten der Monitoring-Live-Aktualisierung.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMonitoringHandlers } from "../actions/monitoring-handlers.js";
import { resetSessionScopedState, state } from "../state.js";

test("monitoring poll updates disturbance pipeline and tracks selected change", async () => {
  resetSessionScopedState();
  state.monitoringFilter = { priority: "critical" };
  state.openDisturbances = [
    {
      id: "dist-1",
      siteId: "site-1",
      siteName: "Standort Nord",
      customerId: "customer-1",
      customerName: "Testkunde",
      siteTechnicalStatus: "offline",
      disturbanceTypeId: "dtype-1",
      disturbanceTypeCode: "camera_unreachable",
      disturbanceTypeLabel: "Kamera nicht erreichbar",
      priority: "critical",
      priorityRank: 3,
      status: "open",
      title: "Kamera Nord offline",
      startedAt: "2026-04-10T12:00:00.000Z",
      durationSeconds: 60,
      deviceId: "device-1",
      deviceName: "Kamera Nord",
      latestEventAt: "2026-04-10T12:01:00.000Z",
      isCritical: true,
      isOfflineRelated: true
    } as any
  ];
  state.selectedMonitoringDisturbanceId = "dist-1";

  const fetchCalls: string[] = [];
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = (globalThis as any).localStorage;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetchCalls.push(url);
    return okResponse({
      items: [
        {
          ...state.openDisturbances[0],
          status: "acknowledged",
          latestEventAt: "2026-04-10T12:02:00.000Z"
        }
      ]
    });
  }) as typeof fetch;
  (globalThis as any).localStorage = { getItem: () => "token-1" };

  try {
    const handlers = createMonitoringHandlers(createRuntimeDeps());
    const result = await handlers.pollOpenDisturbances();

    assert.equal(result.changed, true);
    assert.equal(result.selectedChanged, true);
    assert.equal(state.openDisturbances[0]?.status, "acknowledged");
    assert.ok(fetchCalls[0]?.includes("/api/v1/monitoring/disturbances/open?priority=critical"));
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as any).localStorage = previousLocalStorage;
  }
});

test("monitoring poll keeps detail context stable until disturbance detail actually changes", async () => {
  resetSessionScopedState();
  state.selectedMonitoringDetail = createMonitoringDetailFixture();
  state.selectedMonitoringDisturbanceId = "dist-1";

  const previousFetch = globalThis.fetch;
  const previousLocalStorage = (globalThis as any).localStorage;
  let revision = 0;
  globalThis.fetch = (async () => {
    revision += 1;
    return okResponse(revision === 1 ? createMonitoringDetailFixture() : createMonitoringDetailFixture({ updatedAt: "2026-04-10T12:05:00.000Z", historyLength: 2 }));
  }) as typeof fetch;
  (globalThis as any).localStorage = { getItem: () => "token-1" };

  try {
    const handlers = createMonitoringHandlers(createRuntimeDeps());
    const unchanged = await handlers.pollSelectedMonitoringDetail();
    const changed = await handlers.pollSelectedMonitoringDetail();

    assert.equal(unchanged, false);
    assert.equal(changed, true);
    assert.equal(state.selectedMonitoringDetail?.disturbance.updatedAt, "2026-04-10T12:05:00.000Z");
    assert.equal(state.selectedMonitoringDetail?.history.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as any).localStorage = previousLocalStorage;
  }
});

function createRuntimeDeps() {
  return {
    render: () => undefined,
    setBusyState: () => undefined,
    setSuccess: () => undefined,
    setFailure: () => undefined,
    runRenderBatch: async <T>(work: () => Promise<T>) => await work()
  };
}

function createMonitoringDetailFixture(
  options: { updatedAt?: string; historyLength?: number } = {}
): any {
  return {
    disturbance: {
      id: "dist-1",
      siteId: "site-1",
      disturbanceTypeId: "dtype-1",
      disturbanceTypeCode: "camera_unreachable",
      disturbanceTypeLabel: "Kamera nicht erreichbar",
      priority: "critical",
      priorityRank: 3,
      status: "open",
      title: "Kamera Nord offline",
      startedAt: "2026-04-10T12:00:00.000Z",
      durationSeconds: 60,
      createdAt: "2026-04-10T12:00:00.000Z",
      updatedAt: options.updatedAt ?? "2026-04-10T12:01:00.000Z"
    },
    site: {
      id: "site-1",
      siteName: "Standort Nord",
      customerId: "customer-1",
      customerName: "Testkunde",
      technicalStatus: "offline",
      technicalStatusUpdatedAt: "2026-04-10T12:01:00.000Z"
    },
    history: Array.from({ length: options.historyLength ?? 1 }, (_, index) => ({
      id: `event-${index + 1}`,
      disturbanceId: "dist-1",
      eventKind: "detected",
      createdAt: `2026-04-10T12:0${index}:00.000Z`
    })),
    notes: []
  };
}

function okResponse(data: unknown): any {
  return {
    ok: true,
    json: async () => ({ data })
  };
}
