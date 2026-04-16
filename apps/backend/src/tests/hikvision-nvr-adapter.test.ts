/**
 * Testet die Normalisierung von Hikvision-NVR-Ereignissen.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createHikvisionNvrAlarmAdapter, normalizeHikvisionNvrAlarm } from "../modules/alarm-core/hikvision-nvr-adapter.js";

test("hikvision nvr adapter normalizes recorder payload into external ingestion schema", () => {
  const normalized = normalizeHikvisionNvrAlarm({
    sourceEventId: "HIK-NVR-1",
    eventCode: "VideoMotion",
    eventTime: "2026-04-10T19:00:00.000Z",
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
        url: "https://example.test/hikvision-nvr-snapshot.jpg",
        cameraIp: "10.0.0.21"
      }
    ]
  });

  assert.equal(normalized.sourceSystem, "hikvision");
  assert.equal(normalized.sourceType, "nvr");
  assert.equal(normalized.externalEventId, "HIK-NVR-1");
  assert.equal(normalized.eventType, "motion");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.deviceSerialNumber, "CAM-1");
  assert.equal(normalized.title, "Hikvision NVR Pier Kamera 1 | Motion");
  assert.match(normalized.description ?? "", /Kai Nord/);
  assert.equal(normalized.media?.[0]?.storageKey, "https://example.test/hikvision-nvr-snapshot.jpg");
  assert.equal(normalized.media?.[0]?.deviceNetworkAddress, "10.0.0.21");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["adapter"], "hikvision-nvr");
});

test("hikvision nvr adapter keeps unknown event codes transparent", () => {
  const normalized = normalizeHikvisionNvrAlarm({
    sourceEventId: "HIK-NVR-2",
    eventCode: "SmartRecordFallback",
    eventTime: "2026-04-10T19:05:00.000Z",
    nvrSerialNumber: "NVR-1"
  });

  assert.equal(normalized.eventType, "smart_record_fallback");
  assert.equal(normalized.deviceSerialNumber, "NVR-1");
  assert.equal(normalized.title, "Hikvision NVR SmartRecordFallback | Smart Record Fallback");
});

test("hikvision nvr adapter delegates normalized payload to external ingestion", async () => {
  let delegatedPayload: any;

  const adapter = createHikvisionNvrAlarmAdapter({
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
            title: "Hikvision NVR Recorder | Technical",
            receivedAt: "2026-04-10T19:00:00.000Z",
            lastEventAt: "2026-04-10T19:00:00.000Z",
            createdAt: "2026-04-10T19:00:00.000Z",
            updatedAt: "2026-04-10T19:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false,
          duplicate: false,
          resolution: {
            sourceSystem: "hikvision",
            sourceType: "nvr",
            externalEventId: "HIK-NVR-3",
            externalSourceRef: "hikvision:nvr:HIK-NVR-3",
            siteId: "site-1"
          }
        };
      }
    }
  });

  const result = await adapter.ingest({
    sourceEventId: "HIK-NVR-3",
    eventCode: "hdError",
    eventTime: "2026-04-10T19:10:00.000Z",
    siteId: "site-1",
    nvrSerialNumber: "NVR-1",
    severity: "major"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "HIK-NVR-3");
  assert.equal(delegatedPayload.payload.eventType, "technical");
  assert.equal(delegatedPayload.payload.severity, "critical");
  assert.equal(delegatedPayload.payload.deviceSerialNumber, "NVR-1");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});

test("hikvision nvr adapter remains separate from camera domain", () => {
  const normalized = normalizeHikvisionNvrAlarm({
    sourceEventId: "HIK-NVR-4",
    eventCode: "ipcDisconnect",
    eventTime: "2026-04-10T19:15:00.000Z",
    nvrSerialNumber: "NVR-1"
  });

  assert.equal(normalized.sourceType, "nvr");
  assert.notEqual(normalized.sourceType, "camera");
});