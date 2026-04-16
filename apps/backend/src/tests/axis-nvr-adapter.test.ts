/**
 * Testet die Normalisierung von Axis-NVR-Ereignissen.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createAxisNvrAlarmAdapter, normalizeAxisNvrAlarm } from "../modules/alarm-core/axis-nvr-adapter.js";

test("axis nvr adapter normalizes recorder payload into external ingestion schema", () => {
  const normalized = normalizeAxisNvrAlarm({
    sourceEventId: "AXIS-NVR-1",
    eventCode: "UniversalMotionDetection",
    eventTime: "2026-04-10T21:00:00.000Z",
    cameraSerialNumber: "CAM-1",
    nvrIp: "10.0.0.50",
    channel: 4,
    cameraName: "Pier Kamera 1",
    severity: "2",
    ruleName: "Kai Nord",
    zone: "pier-north",
    media: [
      {
        mediaType: "snapshot",
        url: "https://example.test/axis-nvr-snapshot.jpg",
        cameraIp: "10.0.0.21"
      }
    ]
  });

  assert.equal(normalized.sourceSystem, "axis");
  assert.equal(normalized.sourceType, "nvr");
  assert.equal(normalized.externalEventId, "AXIS-NVR-1");
  assert.equal(normalized.eventType, "motion");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.deviceSerialNumber, "CAM-1");
  assert.equal(normalized.title, "Axis NVR Pier Kamera 1 | Motion");
  assert.match(normalized.description ?? "", /Kai Nord/);
  assert.equal(normalized.media?.[0]?.storageKey, "https://example.test/axis-nvr-snapshot.jpg");
  assert.equal(normalized.media?.[0]?.deviceNetworkAddress, "10.0.0.21");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["adapter"], "axis-nvr");
});

test("axis nvr adapter keeps unknown event codes transparent", () => {
  const normalized = normalizeAxisNvrAlarm({
    sourceEventId: "AXIS-NVR-2",
    eventCode: "RecorderScenarioFallback",
    eventTime: "2026-04-10T21:05:00.000Z",
    nvrSerialNumber: "NVR-1"
  });

  assert.equal(normalized.eventType, "recorder_scenario_fallback");
  assert.equal(normalized.deviceSerialNumber, "NVR-1");
  assert.equal(normalized.title, "Axis NVR RecorderScenarioFallback | Recorder Scenario Fallback");
});

test("axis nvr adapter delegates normalized payload to external ingestion", async () => {
  let delegatedPayload: any;

  const adapter = createAxisNvrAlarmAdapter({
    externalAlarmIngestion: {
      ingest: async (payload: any, _requestId: string, providedSharedSecret?: string) => {
        delegatedPayload = { payload, providedSharedSecret };
        return {
          alarmCase: {
            id: "alarm-1",
            siteId: "site-1",
            alarmType: "technical",
            priority: "critical",
            priorityRank: 3,
            lifecycleStatus: "received",
            assessmentStatus: "pending",
            technicalState: "complete",
            title: "Axis NVR Recorder | Technical",
            receivedAt: "2026-04-10T21:00:00.000Z",
            lastEventAt: "2026-04-10T21:00:00.000Z",
            createdAt: "2026-04-10T21:00:00.000Z",
            updatedAt: "2026-04-10T21:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false,
          duplicate: false,
          resolution: {
            sourceSystem: "axis",
            sourceType: "nvr",
            externalEventId: "AXIS-NVR-3",
            externalSourceRef: "axis:nvr:AXIS-NVR-3",
            siteId: "site-1"
          }
        };
      }
    }
  });

  const result = await adapter.ingest({
    sourceEventId: "AXIS-NVR-3",
    eventCode: "DiskError",
    eventTime: "2026-04-10T21:10:00.000Z",
    siteId: "site-1",
    nvrSerialNumber: "NVR-1",
    severity: "major"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "AXIS-NVR-3");
  assert.equal(delegatedPayload.payload.eventType, "technical");
  assert.equal(delegatedPayload.payload.severity, "critical");
  assert.equal(delegatedPayload.payload.deviceSerialNumber, "NVR-1");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});

test("axis nvr adapter remains separate from camera domain", () => {
  const normalized = normalizeAxisNvrAlarm({
    sourceEventId: "AXIS-NVR-4",
    eventCode: "CameraDisconnected",
    eventTime: "2026-04-10T21:15:00.000Z",
    nvrSerialNumber: "NVR-1"
  });

  assert.equal(normalized.sourceType, "nvr");
  assert.notEqual(normalized.sourceType, "camera");
});