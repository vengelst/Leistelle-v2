/**
 * Testet die Normalisierung von Axis-IP-Kamera-Ereignissen.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createAxisIpCameraAlarmAdapter,
  normalizeAxisIpCameraAlarm
} from "../modules/alarm-core/axis-ip-camera-adapter.js";

test("axis ip camera adapter normalizes camera analytics payload into external ingestion schema", () => {
  const normalized = normalizeAxisIpCameraAlarm({
    sourceEventId: "AXIS-CAM-1",
    eventCode: "LineTouched",
    eventType: "CrossLineDetection",
    eventTime: "2026-04-10T20:00:00.000Z",
    cameraSerialNumber: "AX-1468-001",
    cameraIp: "10.12.0.21",
    cameraName: "Yard Kamera 1",
    severity: "2",
    zone: "yard-entry",
    ruleName: "Nordtor Linie",
    analyticsName: "CrossLineDetection",
    media: [
      {
        mediaType: "snapshot",
        url: "https://example.test/axis-camera-snapshot.jpg",
        cameraIp: "10.12.0.21"
      }
    ]
  });

  assert.equal(normalized.sourceSystem, "axis");
  assert.equal(normalized.sourceType, "camera");
  assert.equal(normalized.externalEventId, "AXIS-CAM-1");
  assert.equal(normalized.eventType, "line_crossing");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.deviceSerialNumber, "AX-1468-001");
  assert.equal(normalized.title, "Axis Camera Yard Kamera 1 | Line Crossing");
  assert.match(normalized.description ?? "", /Nordtor Linie/);
  assert.equal(normalized.media?.[0]?.storageKey, "https://example.test/axis-camera-snapshot.jpg");
  assert.equal(normalized.media?.[0]?.deviceNetworkAddress, "10.12.0.21");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["adapter"], "axis-ip-camera");
});

test("axis ip camera adapter keeps unknown analytics events transparent", () => {
  const normalized = normalizeAxisIpCameraAlarm({
    sourceEventId: "AXIS-CAM-2",
    eventCode: "FenceBreachScenario",
    eventTime: "2026-04-10T20:05:00.000Z",
    cameraSerialNumber: "AX-1468-001"
  });

  assert.equal(normalized.eventType, "fence_breach_scenario");
  assert.equal(normalized.deviceSerialNumber, "AX-1468-001");
  assert.equal(normalized.title, "Axis Camera FenceBreachScenario | Fence Breach Scenario");
});

test("axis ip camera adapter delegates normalized payload to external ingestion", async () => {
  let delegatedPayload: any;

  const adapter = createAxisIpCameraAlarmAdapter({
    externalAlarmIngestion: {
      ingest: async (payload: any, _requestId: string, providedSharedSecret?: string) => {
        delegatedPayload = { payload, providedSharedSecret };
        return {
          alarmCase: {
            id: "alarm-1",
            siteId: "site-1",
            alarmType: "motion",
            priority: "critical",
            priorityRank: 3,
            lifecycleStatus: "received",
            assessmentStatus: "pending",
            technicalState: "complete",
            title: "Axis Camera Yard Kamera 1 | Motion",
            receivedAt: "2026-04-10T20:00:00.000Z",
            lastEventAt: "2026-04-10T20:00:00.000Z",
            createdAt: "2026-04-10T20:00:00.000Z",
            updatedAt: "2026-04-10T20:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false,
          duplicate: false,
          resolution: {
            sourceSystem: "axis",
            sourceType: "camera",
            externalEventId: "AXIS-CAM-3",
            externalSourceRef: "axis:camera:AXIS-CAM-3",
            siteId: "site-1"
          }
        };
      }
    }
  });

  const result = await adapter.ingest({
    sourceEventId: "AXIS-CAM-3",
    eventCode: "VideoMotion",
    eventTime: "2026-04-10T20:10:00.000Z",
    siteId: "site-1",
    cameraSerialNumber: "AX-1468-001",
    severity: "major"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "AXIS-CAM-3");
  assert.equal(delegatedPayload.payload.eventType, "motion");
  assert.equal(delegatedPayload.payload.severity, "critical");
  assert.equal(delegatedPayload.payload.deviceSerialNumber, "AX-1468-001");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});

test("axis ip camera adapter remains separate from nvr domain", () => {
  const normalized = normalizeAxisIpCameraAlarm({
    sourceEventId: "AXIS-CAM-4",
    eventCode: "networkDisconnected",
    eventTime: "2026-04-10T20:15:00.000Z",
    cameraSerialNumber: "AX-1468-001"
  });

  assert.equal(normalized.sourceType, "camera");
  assert.notEqual(normalized.sourceType, "nvr");
});