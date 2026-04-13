import assert from "node:assert/strict";
import test from "node:test";

import {
  createGrundigGuSeriesIpCameraAlarmAdapter,
  normalizeGrundigGuSeriesIpCameraAlarm
} from "../modules/alarm-core/grundig-gu-series-ip-camera-adapter.js";

test("grundig gu series ip camera adapter normalizes camera analytics payload into external ingestion schema", () => {
  const normalized = normalizeGrundigGuSeriesIpCameraAlarm({
    sourceEventId: "GRUNDIG-CAM-1",
    eventCode: "LineCrossingDetection",
    eventTime: "2026-04-10T17:00:00.000Z",
    cameraSerialNumber: "CAM-1",
    cameraIp: "10.0.0.21",
    cameraName: "Nordtor Kamera",
    severity: "2",
    zone: "gate-north",
    ruleName: "Nordtor Linie",
    analyticsName: "Line Crossing",
    media: [
      {
        mediaType: "snapshot",
        url: "https://example.test/grundig-camera-snapshot.jpg",
        cameraIp: "10.0.0.21"
      }
    ]
  });

  assert.equal(normalized.sourceSystem, "grundig");
  assert.equal(normalized.sourceType, "camera");
  assert.equal(normalized.externalEventId, "GRUNDIG-CAM-1");
  assert.equal(normalized.eventType, "line_crossing");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.deviceSerialNumber, "CAM-1");
  assert.equal(normalized.title, "Grundig Camera Nordtor Kamera | Line Crossing");
  assert.match(normalized.description ?? "", /Nordtor Linie/);
  assert.equal(normalized.media?.[0]?.storageKey, "https://example.test/grundig-camera-snapshot.jpg");
  assert.equal(normalized.media?.[0]?.deviceNetworkAddress, "10.0.0.21");
  assert.equal((normalized.rawPayload as Record<string, unknown>)["adapter"], "grundig-gu-series-ip-camera");
});

test("grundig gu series ip camera adapter keeps unknown analytics events transparent", () => {
  const normalized = normalizeGrundigGuSeriesIpCameraAlarm({
    sourceEventId: "GRUNDIG-CAM-2",
    eventCode: "ObjectRemoval",
    eventTime: "2026-04-10T17:05:00.000Z",
    cameraSerialNumber: "CAM-1"
  });

  assert.equal(normalized.eventType, "object_removal");
  assert.equal(normalized.deviceSerialNumber, "CAM-1");
  assert.equal(normalized.title, "Grundig Camera ObjectRemoval | Object Removal");
});

test("grundig gu series ip camera adapter delegates normalized payload to external ingestion", async () => {
  let delegatedPayload: any;

  const adapter = createGrundigGuSeriesIpCameraAlarmAdapter({
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
            title: "Grundig Camera Cam | Area Entry",
            receivedAt: "2026-04-10T17:00:00.000Z",
            lastEventAt: "2026-04-10T17:00:00.000Z",
            createdAt: "2026-04-10T17:00:00.000Z",
            updatedAt: "2026-04-10T17:00:00.000Z",
            responseDeadlineState: "within_deadline",
            isEscalationReady: false
          },
          events: [],
          media: [],
          acceptedAsTechnicalError: false,
          duplicate: false,
          resolution: {
            sourceSystem: "grundig",
            sourceType: "camera",
            externalEventId: "GRUNDIG-CAM-3",
            externalSourceRef: "grundig:camera:GRUNDIG-CAM-3",
            siteId: "site-1"
          }
        };
      }
    }
  });

  const result = await adapter.ingest({
    sourceEventId: "GRUNDIG-CAM-3",
    eventCode: "IntrusionDetection",
    eventTime: "2026-04-10T17:10:00.000Z",
    siteId: "site-1",
    cameraSerialNumber: "CAM-1",
    severity: "major"
  }, "req-1", "shared-secret");

  assert.equal(result.resolution.externalEventId, "GRUNDIG-CAM-3");
  assert.equal(delegatedPayload.payload.eventType, "area_entry");
  assert.equal(delegatedPayload.payload.severity, "critical");
  assert.equal(delegatedPayload.payload.deviceSerialNumber, "CAM-1");
  assert.equal(delegatedPayload.providedSharedSecret, "shared-secret");
});
