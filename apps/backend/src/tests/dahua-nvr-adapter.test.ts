import assert from "node:assert/strict";
import test from "node:test";

import { createDahuaNvrAlarmAdapter, normalizeDahuaNvrAlarm } from "../modules/alarm-core/dahua-nvr-adapter.js";

test("dahua nvr adapter normalizes event code severity and device hints", () => {
  const normalized = normalizeDahuaNvrAlarm({
    sourceEventId: "DAHUA-1",
    eventCode: "CrossLineDetection",
    eventTime: "2026-04-10T12:00:00.000Z",
    cameraSerialNumber: "CAM-1",
    recorderIp: "10.0.0.50",
    channel: 3,
    cameraName: "Yard Kamera 1",
    severity: "2",
    ruleName: "Perimeter Nord",
    zone: "north-fence",
    media: [
      {
        mediaType: "snapshot",
        url: "https://example.test/snapshot.jpg",
        cameraIp: "10.0.0.21"
      }
    ]
  });

  assert.equal(normalized.sourceSystem, "dahua");
  assert.equal(normalized.sourceType, "nvr");
  assert.equal(normalized.externalEventId, "DAHUA-1");
  assert.equal(normalized.eventType, "line_crossing");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.deviceSerialNumber, "CAM-1");
  assert.equal(normalized.title, "Dahua Yard Kamera 1 | Line Crossing");
  assert.match(normalized.description ?? "", /Perimeter Nord/);
  assert.equal(normalized.media?.[0]?.storageKey, "https://example.test/snapshot.jpg");
  assert.equal(normalized.media?.[0]?.deviceNetworkAddress, "10.0.0.21");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["adapter"], "dahua-nvr");
});

test("dahua nvr adapter keeps unknown event codes transparent", () => {
  const normalized = normalizeDahuaNvrAlarm({
    sourceEventId: "DAHUA-2",
    eventCode: "HeatMapAlarm",
    eventTime: "2026-04-10T12:05:00.000Z",
    recorderSerialNumber: "NVR-1"
  });

  assert.equal(normalized.eventType, "heat_map_alarm");
  assert.equal(normalized.deviceSerialNumber, "NVR-1");
  assert.equal(normalized.title, "Dahua HeatMapAlarm | Heat Map Alarm");
});

test("dahua nvr adapter delegates normalized payload to external ingestion", async () => {
  let delegatedPayload: any;

  const adapter = createDahuaNvrAlarmAdapter({
    externalAlarmIngestion: {
      ingest: async (payload: any, _requestId: string, providedSharedSecret?: string) => {
        delegatedPayload = { payload, providedSharedSecret };
        return {
          alarmCase: {
            id: "alarm-1",
            siteId: "site-1",
            alarmType: "motion",
            priority: "high",
            priorityRank: 2,
            lifecycleStatus: "received",
            assessmentStatus: "pending",
            technicalState: "complete",
            title: "Dahua Cam | Motion",
            receivedAt: "2026-04-10T12:00:00.000Z",
            lastEventAt: "2026-04-10T12:00:00.000Z",
            createdAt: "2026-04-10T12:00:00.000Z",
            updatedAt: "2026-04-10T12:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false,
          duplicate: false,
          resolution: {
            sourceSystem: "dahua",
            sourceType: "nvr",
            externalEventId: "DAHUA-3",
            externalSourceRef: "dahua:nvr:DAHUA-3",
            siteId: "site-1"
          }
        };
      }
    }
  });

  const result = await adapter.ingest({
    sourceEventId: "DAHUA-3",
    eventCode: "VideoMotion",
    eventTime: "2026-04-10T12:10:00.000Z",
    siteId: "site-1",
    recorderSerialNumber: "NVR-1",
    severity: "major"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "DAHUA-3");
  assert.equal(delegatedPayload.payload.eventType, "motion");
  assert.equal(delegatedPayload.payload.severity, "critical");
  assert.equal(delegatedPayload.payload.deviceSerialNumber, "NVR-1");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});
