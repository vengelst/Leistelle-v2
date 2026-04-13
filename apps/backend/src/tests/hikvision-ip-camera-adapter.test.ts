import assert from "node:assert/strict";
import test from "node:test";

import {
  createHikvisionIpCameraAlarmAdapter,
  normalizeHikvisionIpCameraAlarm
} from "../modules/alarm-core/hikvision-ip-camera-adapter.js";

test("hikvision ip camera adapter normalizes camera analytics payload into external ingestion schema", () => {
  const normalized = normalizeHikvisionIpCameraAlarm({
    sourceEventId: "HIK-CAM-1",
    eventCode: "linedetection",
    eventTime: "2026-04-10T18:00:00.000Z",
    cameraSerialNumber: "CAM-1",
    cameraIp: "10.0.0.21",
    cameraName: "Nordtor Kamera",
    severity: "2",
    zone: "gate-north",
    ruleName: "Nordtor Linie",
    analyticsName: "Line Detection",
    media: [
      {
        mediaType: "snapshot",
        url: "https://example.test/hikvision-camera-snapshot.jpg",
        cameraIp: "10.0.0.21"
      }
    ]
  });

  assert.equal(normalized.sourceSystem, "hikvision");
  assert.equal(normalized.sourceType, "camera");
  assert.equal(normalized.externalEventId, "HIK-CAM-1");
  assert.equal(normalized.eventType, "line_crossing");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.deviceSerialNumber, "CAM-1");
  assert.equal(normalized.title, "Hikvision Camera Nordtor Kamera | Line Crossing");
  assert.match(normalized.description ?? "", /Nordtor Linie/);
  assert.equal(normalized.media?.[0]?.storageKey, "https://example.test/hikvision-camera-snapshot.jpg");
  assert.equal(normalized.media?.[0]?.deviceNetworkAddress, "10.0.0.21");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["adapter"], "hikvision-ip-camera");
});

test("hikvision ip camera adapter keeps unknown analytics events transparent", () => {
  const normalized = normalizeHikvisionIpCameraAlarm({
    sourceEventId: "HIK-CAM-2",
    eventCode: "unattendedBaggageStart",
    eventTime: "2026-04-10T18:05:00.000Z",
    cameraSerialNumber: "CAM-1"
  });

  assert.equal(normalized.eventType, "unattended_baggage_start");
  assert.equal(normalized.deviceSerialNumber, "CAM-1");
  assert.equal(normalized.title, "Hikvision Camera unattendedBaggageStart | Unattended Baggage Start");
});

test("hikvision ip camera adapter delegates normalized payload to external ingestion", async () => {
  let delegatedPayload: any;

  const adapter = createHikvisionIpCameraAlarmAdapter({
    externalAlarmIngestion: {
      ingest: async (payload: any, _requestId: string, providedSharedSecret?: string) => {
        delegatedPayload = { payload, providedSharedSecret };
        return {
          alarmCase: {
            id: "alarm-1",
            siteId: "site-1",
            alarmType: "area_entry",
            priority: "critical",
            priorityRank: 3,
            lifecycleStatus: "received",
            assessmentStatus: "pending",
            technicalState: "complete",
            title: "Hikvision Camera Cam | Area Entry",
            receivedAt: "2026-04-10T18:00:00.000Z",
            lastEventAt: "2026-04-10T18:00:00.000Z",
            createdAt: "2026-04-10T18:00:00.000Z",
            updatedAt: "2026-04-10T18:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false,
          duplicate: false,
          resolution: {
            sourceSystem: "hikvision",
            sourceType: "camera",
            externalEventId: "HIK-CAM-3",
            externalSourceRef: "hikvision:camera:HIK-CAM-3",
            siteId: "site-1"
          }
        };
      }
    }
  });

  const result = await adapter.ingest({
    sourceEventId: "HIK-CAM-3",
    eventCode: "intrusion",
    eventTime: "2026-04-10T18:10:00.000Z",
    siteId: "site-1",
    cameraSerialNumber: "CAM-1",
    severity: "major"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "HIK-CAM-3");
  assert.equal(delegatedPayload.payload.eventType, "area_entry");
  assert.equal(delegatedPayload.payload.severity, "critical");
  assert.equal(delegatedPayload.payload.deviceSerialNumber, "CAM-1");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});
